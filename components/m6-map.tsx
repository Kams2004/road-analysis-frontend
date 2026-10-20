"use client"

/**
 * Small Leaflet map used by the Module 6 screens:
 *  - Location review: draggable pin, proposed position, vehicle trajectory
 *    polyline with clickable points (the nearest point to the event highlighted)
 *  - Hazard drawer: hazard radius circle + member markers
 *  - Cluster areas: click to pick the centre, area circle
 * Base tiles come from useMapTiles() like every other map of the console.
 */
import { useEffect, useRef, useState } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type L = typeof import("leaflet")
type LMap = import("leaflet").Map

export interface MapPoint { lat: number; lon: number }
export interface MapTrackPoint extends MapPoint { id: string | number; label?: string }
export interface MapCircle extends MapPoint { radius_m: number; color?: string }
export interface MapMarker extends MapPoint { color?: string; label?: string }

export interface M6MapProps {
  className?: string
  /** Pin position (controlled). */
  pin?: MapPoint | null
  draggablePin?: boolean
  /** Clicking the map moves the pin there. */
  clickToPlace?: boolean
  onPinChange?: (p: MapPoint) => void
  /** Proposed (approximate) position, shown as a ghost marker. */
  proposed?: MapPoint | null
  track?: MapTrackPoint[]
  nearestPointId?: string | number | null
  selectedPointId?: string | number | null
  onPointClick?: (id: string | number) => void
  circles?: MapCircle[]
  markers?: MapMarker[]
  /** Change this value to re-fit the view on the current content. */
  fitKey?: string | number
  defaultCenter?: [number, number]
  defaultZoom?: number
}

const PIN_HTML = `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#ef4444;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>`
const GHOST_HTML = `<div style="width:16px;height:16px;border-radius:50%;background:rgba(245,158,11,.35);border:2px dashed #f59e0b"></div>`

function tileLayer(L: L, tiles: LeafletTiles) {
  return L.tileLayer(tiles.url, {
    subdomains: tiles.subdomains.length ? tiles.subdomains : undefined,
    attribution: tiles.attribution,
    maxZoom: tiles.maxZoom,
  })
}

export function M6Map(props: M6MapProps) {
  const {
    className, pin, draggablePin, clickToPlace, onPinChange, proposed, track, nearestPointId,
    selectedPointId, onPointClick, circles, markers, fitKey, defaultCenter = [4.5, 11.5], defaultZoom = 6,
  } = props
  const t = useT()
  const tiles = useMapTiles()
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const LRef = useRef<L | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const overlayRef = useRef<import("leaflet").LayerGroup | null>(null)
  const pinRef = useRef<import("leaflet").Marker | null>(null)
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  // Latest callbacks/flags for Leaflet handlers registered once.
  const cb = useRef({ onPinChange, onPointClick, clickToPlace })
  cb.current = { onPinChange, onPointClick, clickToPlace }
  const propsRef = useRef(props)
  propsRef.current = props
  const [ready, setReadyState] = useState(false)
  const setReady = () => setReadyState(true)

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(boxRef.current, { center: defaultCenter, zoom: defaultZoom })
      mapRef.current = map
      tileRef.current = tileLayer(L, tilesRef.current).addTo(map)
      overlayRef.current = L.layerGroup().addTo(map)
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        if (cb.current.clickToPlace) cb.current.onPinChange?.({ lat: e.latlng.lat, lon: e.latlng.lng })
      })
      // The map often mounts inside a sheet/dialog that is still animating.
      setTimeout(() => map.invalidateSize(), 250)
      setReady()
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      overlayRef.current = null
      pinRef.current = null
      tileRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap base tiles when the config arrives.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    const prev = tileRef.current
    const layer = tileLayer(L, tiles).addTo(map)
    layer.bringToBack()
    tileRef.current = layer
    if (prev) map.removeLayer(prev)
  }, [tiles, ready])

  // Overlays: proposed position, trajectory, circles, markers.
  useEffect(() => {
    const L = LRef.current, group = overlayRef.current
    if (!L || !group) return
    group.clearLayers()
    for (const c of circles ?? []) {
      L.circle([c.lat, c.lon], { radius: c.radius_m, color: c.color ?? "#3b82f6", fillOpacity: 0.12, weight: 2 }).addTo(group)
    }
    if (track && track.length) {
      L.polyline(track.map((p) => [p.lat, p.lon] as [number, number]), { color: "#3b82f6", weight: 3, opacity: 0.7 }).addTo(group)
      for (const p of track) {
        const isSel = selectedPointId != null && p.id === selectedPointId
        const isNear = nearestPointId != null && p.id === nearestPointId
        const m = L.circleMarker([p.lat, p.lon], {
          radius: isSel ? 8 : isNear ? 7 : 4,
          color: isSel ? "#16a34a" : isNear ? "#f59e0b" : "#1d4ed8",
          fillColor: isSel ? "#22c55e" : isNear ? "#fbbf24" : "#3b82f6",
          fillOpacity: 0.9,
          weight: isSel || isNear ? 3 : 1,
        }).addTo(group)
        if (p.label) m.bindTooltip(p.label, { direction: "top" })
        m.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          cb.current.onPointClick?.(p.id)
        })
      }
    }
    for (const mk of markers ?? []) {
      const m = L.circleMarker([mk.lat, mk.lon], {
        radius: 6, color: "#fff", weight: 2, fillColor: mk.color ?? "#ef4444", fillOpacity: 1,
      }).addTo(group)
      if (mk.label) m.bindTooltip(mk.label, { direction: "top" })
    }
    if (proposed) {
      L.marker([proposed.lat, proposed.lon], {
        icon: L.divIcon({ className: "", html: GHOST_HTML, iconSize: [16, 16], iconAnchor: [8, 8] }),
        interactive: false,
      }).addTo(group)
    }
  }, [ready, track, nearestPointId, selectedPointId, circles, markers, proposed])

  // Pin (kept outside the overlay group so dragging is not interrupted).
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    if (!pin) {
      if (pinRef.current) { map.removeLayer(pinRef.current); pinRef.current = null }
      return
    }
    if (!pinRef.current) {
      const marker = L.marker([pin.lat, pin.lon], {
        draggable: !!draggablePin,
        icon: L.divIcon({ className: "", html: PIN_HTML, iconSize: [22, 22], iconAnchor: [11, 22] }),
        zIndexOffset: 1000,
      }).addTo(map)
      marker.on("dragend", () => {
        const ll = marker.getLatLng()
        cb.current.onPinChange?.({ lat: ll.lat, lon: ll.lng })
      })
      pinRef.current = marker
    } else {
      const cur = pinRef.current.getLatLng()
      if (cur.lat !== pin.lat || cur.lng !== pin.lon) pinRef.current.setLatLng([pin.lat, pin.lon])
      if (draggablePin) pinRef.current.dragging?.enable(); else pinRef.current.dragging?.disable()
    }
  }, [ready, pin, draggablePin])

  // Fit to content when asked.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    const p = propsRef.current
    const pts: [number, number][] = []
    if (p.pin) pts.push([p.pin.lat, p.pin.lon])
    if (p.proposed) pts.push([p.proposed.lat, p.proposed.lon])
    for (const x of p.track ?? []) pts.push([x.lat, x.lon])
    for (const x of p.markers ?? []) pts.push([x.lat, x.lon])
    let bounds = pts.length ? L.latLngBounds(pts) : null
    for (const c of p.circles ?? []) {
      const cb2 = L.latLng(c.lat, c.lon).toBounds(c.radius_m * 2)
      bounds = bounds ? bounds.extend(cb2) : cb2
    }
    if (!bounds) return
    if (pts.length === 1 && !(p.circles ?? []).length) map.setView(pts[0], 16)
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [ready, fitKey])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div className={cn("relative isolate overflow-hidden rounded-lg border", className)}>
        <div ref={boxRef} className="h-full w-full" />
        {(tiles.fallbackReason === "google_not_configured" || tiles.fallbackReason === "google_unavailable") && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            {t("pmap.common.googleFallback")}
          </div>
        )}
      </div>
    </>
  )
}
