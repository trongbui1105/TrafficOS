package enrich

import (
	"math"
	"strings"
	"time"
)

// HCMC districts used for deterministic assignment based on road index.
var districts = []string{
	"District 1", "District 3", "District 4", "District 5", "District 7",
	"District 10", "Binh Thanh", "Phu Nhuan", "Tan Binh", "Go Vap",
	"Thu Duc", "Nha Be",
}

// hcmCenter is the reference point used for synthetic coordinates.
const (
	hcmCenterLat = 10.7769
	hcmCenterLon = 106.7009
)

// BuildMeta derives a RoadMeta record for a road given its 1-based index,
// name and nominal speed limit. Coordinates are spread deterministically in
// a ring around HCMC so the dashboard map looks natural.
func BuildMeta(index int, roadID, roadName string, speedLimit int) RoadMeta {
	district := districts[index%len(districts)]
	roadType := classifyRoadType(roadName)
	lanes := lanesFor(roadType)
	length := lengthFor(roadType, index)
	lat, lon := syntheticCoords(index)

	return RoadMeta{
		RoadID:     roadID,
		RoadName:   roadName,
		District:   district,
		RoadType:   roadType,
		Lanes:      lanes,
		SpeedLimit: speedLimit,
		LengthKm:   length,
		Lat:        lat,
		Lon:        lon,
		UpdatedAt:  FormatTime(time.Now()),
	}
}

func classifyRoadType(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "parkway"), strings.Contains(lower, "highway"), strings.Contains(lower, "expressway"):
		return "highway"
	case strings.Contains(lower, "boulevard"), strings.Contains(lower, "avenue"):
		return "arterial"
	case strings.Contains(lower, "street"):
		return "collector"
	default:
		return "local"
	}
}

func lanesFor(roadType string) int {
	switch roadType {
	case "highway":
		return 6
	case "arterial":
		return 4
	case "collector":
		return 2
	default:
		return 2
	}
}

func lengthFor(roadType string, index int) float64 {
	base := 1.2 + float64(index%7)*0.4
	switch roadType {
	case "highway":
		return base + 6
	case "arterial":
		return base + 2.5
	default:
		return base
	}
}

// syntheticCoords scatters roads in a ring around HCMC center.
func syntheticCoords(index int) (float64, float64) {
	radius := 0.015 + float64(index%8)*0.004 // ~1.5 km - 4.5 km
	angle := float64(index) * 0.42             // ~24° between consecutive roads
	lat := hcmCenterLat + radius*math.Sin(angle)
	lon := hcmCenterLon + radius*math.Cos(angle)
	return lat, lon
}
