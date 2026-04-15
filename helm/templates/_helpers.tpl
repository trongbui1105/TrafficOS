{{/*
trafficOS.labels — standard Kubernetes recommended labels applied to every resource.
Usage: {{ include "trafficOS.labels" . | nindent 4 }}
*/}}
{{- define "trafficOS.labels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
trafficOS.selectorLabels — minimal label set used in selector.matchLabels and
pod template labels so that selectors remain stable across upgrades.
Usage: {{ include "trafficOS.selectorLabels" . | nindent 6 }}
*/}}
{{- define "trafficOS.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
