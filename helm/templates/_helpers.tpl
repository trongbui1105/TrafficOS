{{/*
Expand the name of the chart.
*/}}
{{- define "traffic-system.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "traffic-system.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for a given component.
Usage: {{ include "traffic-system.selectorLabels" (dict "component" "traffic-api") }}
*/}}
{{- define "traffic-system.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ $.Release.Name }}
{{- end }}
