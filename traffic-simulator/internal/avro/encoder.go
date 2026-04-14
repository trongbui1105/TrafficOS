// Package avro handles Avro serialization using the Confluent Schema Registry
// wire format: [0x00][4-byte schema ID big-endian][avro bytes].
package avro

import (
	"encoding/binary"
	"fmt"
	"os"

	"github.com/linkedin/goavro/v2"
	"github.com/riferrei/srclient"
)

// Encoder serializes Go maps into Confluent-compatible Avro binary messages.
type Encoder struct {
	codec    *goavro.Codec
	schemaID int
}

// NewEncoder registers (or retrieves) the given Avro schema from Schema Registry
// and returns an Encoder ready to serialize messages for that subject.
func NewEncoder(registryURL, subject, schemaPath string) (*Encoder, error) {
	schemaJSON, err := os.ReadFile(schemaPath)
	if err != nil {
		return nil, fmt.Errorf("read schema file: %w", err)
	}

	registry := srclient.CreateSchemaRegistryClient(registryURL)

	schema, err := registry.CreateSchema(subject, string(schemaJSON), srclient.Avro)
	if err != nil {
		return nil, fmt.Errorf("register schema: %w", err)
	}

	codec, err := goavro.NewCodec(schema.Schema())
	if err != nil {
		return nil, fmt.Errorf("create avro codec: %w", err)
	}

	return &Encoder{
		codec:    codec,
		schemaID: schema.ID(),
	}, nil
}

// Encode serializes the given native Go map into Confluent Avro wire format.
// The map keys must match the Avro schema field names.
func (e *Encoder) Encode(native map[string]interface{}) ([]byte, error) {
	avroBytes, err := e.codec.BinaryFromNative(nil, native)
	if err != nil {
		return nil, fmt.Errorf("avro encode: %w", err)
	}

	// Confluent wire format: magic byte + 4-byte schema ID + avro payload
	msg := make([]byte, 5+len(avroBytes))
	msg[0] = 0x00
	binary.BigEndian.PutUint32(msg[1:5], uint32(e.schemaID))
	copy(msg[5:], avroBytes)

	return msg, nil
}
