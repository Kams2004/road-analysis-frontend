"use client"

import { useEffect, useRef } from "react"
import type { ApiDetection, ClusterOut } from "@/lib/api"

const TYPE_COLORS: Record<string, string> = {
  pothole:      "#ef4444",
  traffic_sign: "#3b82f6",
  speed_bump:   "#f59e0b",
  speed_hump:   "#f97316",
  default:      "#8b5cf6",
}

interface DetectionMapProps {
  clusters:                  ClusterOut[]
  radiusM?:                  number
  onClusterClick:            (c: ClusterOut) => void
  selectedCluster?:          ClusterOut | null
  expandedDetections?:       ApiDetection[]
  onDetectionClick?:         (d: ApiDetection) => void
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Radius based on actual spread of detections from centroid, min 80m
function clusterDisplayRadius(c: ClusterOut): number {
  const coords = c.detection_coords ?? []
  if (coords.length === 0) return 80
  const maxDist = Math.max(...coords.map(([lat, lon]) =>
    haversineM(c.centroid_lat, c.centroid_lon, lat, lon)
  ))
  return Math.max(maxDist * 1.3, 80)
}

export default function DetectionMap({
  clusters,
  onClusterClick,
  selectedCluster,
  expandedDetections = [],
  onDetectionClick,
}: DetectionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import("leaflet").Map | null>(null)

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(containerRef.current!, { center: [4.5, 11.5], zoom: 6 })
      mapRef.current = map
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)
    })
    return () => { mapRef.current?.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // redraw whenever clusters or selection changes
  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => {
      const map = mapRef.current!
      map.eachLayer((l) => {
        if (l instanceof L.Marker || l instanceof L.CircleMarker || l instanceof L.Circle || l instanceof L.Polygon) map.removeLayer(l)
      })

      if (clusters.length === 0) return

      clusters.forEach((c) => {
        const isSelected = selectedCluster?.cluster_id === c.cluster_id
        const color = c.is_resolved ? "#22c55e" : isSelected ? "#6366f1" : "#f97316"
        const radius = clusterDisplayRadius(c)

        const boundary = L.circle([c.centroid_lat, c.centroid_lon], {
          radius,
          color,
          weight: isSelected ? 3 : 2,
          dashArray: "8 6",
          fillColor: color,
          fillOpacity: 0.08,
        }).addTo(map)

        boundary.bindTooltip(
          `${c.is_resolved ? "✓ Resolved" : "Active"} · ${c.count} detection${c.count !== 1 ? "s" : ""}`,
          { permanent: false, direction: "top" },
        )
        boundary.on("click", () => onClusterClick(c))

        L.marker([c.centroid_lat, c.centroid_lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:${color};color:#fff;font-weight:700;font-size:12px;
              border:2px solid #fff;border-radius:12px;padding:2px 8px;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;
              pointer-events:none;">${c.count}</div>`,
            iconSize: [40, 24],
            iconAnchor: [20, 12],
          }),
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map)
      })

      // individual pin markers for the expanded cluster
      expandedDetections.forEach((det) => {
        if (det.latitude == null || det.longitude == null) return
        const color = TYPE_COLORS[det.type] ?? TYPE_COLORS.default
        const resolved = det.review_status === "resolved"

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;
            background:${resolved ? "#22c55e" : color};
            border:2px solid white;transform:rotate(-45deg);
            box-shadow:0 2px 6px rgba(0,0,0,0.4);opacity:${resolved ? 0.7 : 1};"></div>`,
          iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -24],
        })

        const m = L.marker([det.latitude, det.longitude], { icon }).addTo(map)
        m.bindPopup(_popup(det), { maxWidth: 240 })
        if (onDetectionClick) m.on("click", () => onDetectionClick(det))
      })

      // fit bounds using actual circle extents
      const boundsArr = clusters.reduce((b, c) => {
        return b.extend(L.circle([c.centroid_lat, c.centroid_lon], { radius: clusterDisplayRadius(c) }).getBounds())
      }, L.latLngBounds([] as [number, number][]))
      if (boundsArr.isValid()) map.fitBounds(boundsArr, { padding: [48, 48] })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, selectedCluster, expandedDetections])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className="w-full h-full" />
    </>
  )
}

function _popup(det: ApiDetection): string {
  const pct = Math.round(det.confidence * 100)
  return `<div style="min-width:180px;font-family:sans-serif">
    <div style="font-weight:700;font-size:13px;text-transform:capitalize;margin-bottom:4px">
      ${det.type.replace("_", " ")}${det.subtype ? " / " + det.subtype : ""}
    </div>
    <div style="font-size:11px;color:#666;margin-bottom:6px">
      ${det.location_name ?? `${det.latitude!.toFixed(5)}, ${det.longitude!.toFixed(5)}`}
    </div>
    <div style="display:flex;gap:8px;font-size:11px">
      <span>Confidence: <b>${pct}%</b></span>
      <span>Frame: <b>#${det.frame_number}</b></span>
    </div>
    <div style="margin-top:4px;font-size:11px">
      Status: <b style="text-transform:capitalize">${det.review_status}</b>
    </div>
  </div>`
}
