"use client"

import { useEffect, useRef } from "react"
import type { ApiDetection } from "@/lib/api"

const TYPE_COLORS: Record<string, string> = {
  pothole:      "#ef4444",
  traffic_sign: "#3b82f6",
  speed_bump:   "#f59e0b",
  speed_hump:   "#f97316",
  default:      "#8b5cf6",
}

const STATUS_OPACITY: Record<string, number> = {
  pending:   1,
  validated: 0.85,
  rejected:  0.4,
}

interface DetectionMapProps {
  detections: ApiDetection[]
  onMarkerClick?: (det: ApiDetection) => void
}

export default function DetectionMap({ detections, onMarkerClick }: DetectionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import("leaflet").Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Dynamic import to avoid SSR
    import("leaflet").then((L) => {
      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      const withCoords = detections.filter((d) => d.latitude != null && d.longitude != null)

      // Center on first detection or default to Cameroon
      const center: [number, number] = withCoords.length > 0
        ? [withCoords[0].latitude!, withCoords[0].longitude!]
        : [4.5, 11.5]

      const map = L.map(containerRef.current!, {
        center,
        zoom: withCoords.length > 0 ? 13 : 6,
        zoomControl: true,
      })
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      withCoords.forEach((det) => {
        const color   = TYPE_COLORS[det.type] ?? TYPE_COLORS.default
        const opacity = STATUS_OPACITY[det.review_status] ?? 1

        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              width:28px;height:28px;border-radius:50% 50% 50% 0;
              background:${color};opacity:${opacity};
              border:2px solid white;
              transform:rotate(-45deg);
              box-shadow:0 2px 6px rgba(0,0,0,0.4);
            "></div>`,
          iconSize:   [28, 28],
          iconAnchor: [14, 28],
          popupAnchor:[0, -30],
        })

        const marker = L.marker([det.latitude!, det.longitude!], { icon }).addTo(map)

        const pct = Math.round(det.confidence * 100)
        marker.bindPopup(`
          <div style="min-width:180px;font-family:sans-serif">
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
          </div>
        `, { maxWidth: 240 })

        if (onMarkerClick) {
          marker.on("click", () => onMarkerClick(det))
        }
      })

      // Fit bounds if multiple points
      if (withCoords.length > 1) {
        const bounds = L.latLngBounds(withCoords.map((d) => [d.latitude!, d.longitude!] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers when detections change without re-creating the map
  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => {
      const map = mapRef.current!
      // Remove existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) map.removeLayer(layer)
      })

      const withCoords = detections.filter((d) => d.latitude != null && d.longitude != null)
      withCoords.forEach((det) => {
        const color   = TYPE_COLORS[det.type] ?? TYPE_COLORS.default
        const opacity = STATUS_OPACITY[det.review_status] ?? 1

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};opacity:${opacity};border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
          iconSize:   [28, 28],
          iconAnchor: [14, 28],
          popupAnchor:[0, -30],
        })

        const pct = Math.round(det.confidence * 100)
        L.marker([det.latitude!, det.longitude!], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width:180px;font-family:sans-serif">
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
              <div style="margin-top:4px;font-size:11px">Status: <b style="text-transform:capitalize">${det.review_status}</b></div>
            </div>`, { maxWidth: 240 })
      })

      if (withCoords.length > 1) {
        const bounds = L.latLngBounds(withCoords.map((d) => [d.latitude!, d.longitude!] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    })
  }, [detections])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={containerRef} className="w-full h-full" />
    </>
  )
}
