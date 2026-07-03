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
  onClusterClick:            (c: ClusterOut) => void
  selectedCluster?:          ClusterOut | null
  expandedDetections?:       ApiDetection[]
  onDetectionClick?:         (d: ApiDetection) => void
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
        if (l instanceof L.Marker || l instanceof L.CircleMarker) map.removeLayer(l)
      })

      if (clusters.length === 0) return

      clusters.forEach((c) => {
        const isSelected = selectedCluster?.cluster_id === c.cluster_id
        const color = c.is_resolved ? "#22c55e" : isSelected ? "#6366f1" : "#f97316"
        const r     = Math.max(18, Math.min(50, 14 + c.count * 3))

        const circle = L.circleMarker([c.centroid_lat, c.centroid_lon], {
          radius: r, fillColor: color, fillOpacity: 0.88,
          color: "#fff", weight: isSelected ? 3 : 2,
        }).addTo(map)

        circle.bindTooltip(
          `${c.is_resolved ? "✓ Resolved" : "Active"} · ${c.count} detection${c.count !== 1 ? "s" : ""}`,
          { permanent: false, direction: "top" },
        )
        circle.on("click", () => onClusterClick(c))

        // count label (non-interactive marker on top)
        L.marker([c.centroid_lat, c.centroid_lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:${r*2}px;height:${r*2}px;display:flex;align-items:center;
              justify-content:center;font-size:${r>28?13:11}px;font-weight:700;
              color:#fff;pointer-events:none;">${c.count}</div>`,
            iconSize: [r * 2, r * 2], iconAnchor: [r, r],
          }),
          interactive: false,
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

      // fit bounds
      const pts = clusters.map((c) => [c.centroid_lat, c.centroid_lon] as [number, number])
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48] })
      else if (pts.length === 1) map.setView(pts[0], 14)
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
