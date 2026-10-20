"use client"

/**
 * Leaflet map of the Cluster configuration page: every cluster zone
 * (agglomerations blue, road-section corridors orange, custom violet,
 * inactive grey), a dashed preview (boundary candidate, corridor), a
 * click-to-add-vertex polygon editor and the "test a point" marker.
 * Base tiles come from useMapTiles() like every other map of the console.
 */
import { useEffect, useRef, useState } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { zoneColor, type Environment, type Geometry, type ZoneCollection } from "@/lib/clustering-api"

type L = typeof import("leaflet")
type LMap = import("leaflet").Map
export type LatLon = [number, number]
export type MapMode = "select" | "draw" | "test"
/** [[south, west], [north, east]] */
export type Bounds = [LatLon, LatLon]

export interface ZonesMapProps {
  className?: string
  collection: ZoneCollection | null
  mode: MapMode
  selectedId?: number | null
  hoveredId?: number | null
  onSelect?: (id: number) => void
  onHover?: (id: number | null) => void
  /** Dashed overlay: a boundary candidate, a corridor preview… */
  preview?: Geometry[] | null
  previewEnv?: Environment
  /** Polygon being drawn ([lat, lon] vertices). */
  drawing?: LatLon[] | null
  onDrawingChange?: (pts: LatLon[]) => void
  testPoint?: { lat: number; lon: number } | null
  onTestPoint?: (lat: number, lon: number) => void
  /** Change to re-fit the view: on `fitBounds` when given, else on every zone. */
  fitKey?: string | number
  fitBounds?: Bounds | null
}

const PIN_HTML = `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#ef4444;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>`
const VERTEX_HTML = `<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #7c3aed;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`

function tileLayer(L: L, tiles: LeafletTiles) {
  return L.tileLayer(tiles.url, {
    subdomains: tiles.subdomains.length ? tiles.subdomains : undefined,
    attribution: tiles.attribution,
    maxZoom: tiles.maxZoom,
  })
}

/** Bounds of a GeoJSON geometry, or null. */
export function geometryBounds(g: Geometry | null | undefined): Bounds | null {
  if (!g) return null
  let s = 90, w = 180, n = -90, e = -180, any = false
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [lon, lat] = c as number[]
      s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); any = true
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  walk(g.coordinates)
  return any ? [[s, w], [n, e]] : null
}

export function ZonesMap(props: ZonesMapProps) {
  const {
    className, collection, mode, selectedId, hoveredId, preview, previewEnv = "urban", drawing, testPoint,
    fitKey,
  } = props
  const t = useT()
  const tiles = useMapTiles()
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const LRef = useRef<L | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const zonesRef = useRef<import("leaflet").LayerGroup | null>(null)
  const overlayRef = useRef<import("leaflet").LayerGroup | null>(null)
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  const cb = useRef(props)
  cb.current = props
  const [ready, setReady] = useState(false)

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(boxRef.current, { center: [4.6, 11.0], zoom: 6, doubleClickZoom: false })
      mapRef.current = map
      tileRef.current = tileLayer(L, tilesRef.current).addTo(map)
      zonesRef.current = L.layerGroup().addTo(map)
      overlayRef.current = L.layerGroup().addTo(map)
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        const p = cb.current
        if (p.mode === "draw") p.onDrawingChange?.([...(p.drawing ?? []), [e.latlng.lat, e.latlng.lng]])
        else if (p.mode === "test") p.onTestPoint?.(e.latlng.lat, e.latlng.lng)
      })
      setTimeout(() => map.invalidateSize(), 250)
      setReady(true)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      zonesRef.current = null
      overlayRef.current = null
      tileRef.current = null
    }
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

  // Keep the cursor in step with the mode.
  useEffect(() => {
    const box = boxRef.current
    if (box) box.style.cursor = mode === "select" ? "" : "crosshair"
    const c = mapRef.current?.getContainer()
    if (c) c.style.cursor = mode === "select" ? "" : "crosshair"
  }, [mode, ready])

  // Zones.
  useEffect(() => {
    const L = LRef.current, group = zonesRef.current
    if (!L || !group) return
    group.clearLayers()
    const interactive = mode === "select"
    // Large zones first so smaller ones stay clickable on top.
    const feats = [...(collection?.features ?? [])].sort((a, b) => b.properties.area_km2 - a.properties.area_km2)
    for (const f of feats) {
      const p = f.properties
      const color = zoneColor(p.kind, p.environment, p.is_active)
      const isSel = selectedId === p.id
      const isHover = hoveredId === p.id
      const layer = L.geoJSON(f.geometry as GeoJSON.GeoJsonObject, {
        interactive,
        style: {
          color, weight: isSel ? 3.5 : isHover ? 3 : 1.6, opacity: p.is_active ? 0.95 : 0.6,
          fillColor: color, fillOpacity: isSel ? 0.28 : isHover ? 0.22 : p.kind === "road_section" ? 0.18 : 0.1,
          dashArray: p.is_active ? undefined : "4 4",
        },
      }).addTo(group)
      if (p.centerline) {
        L.geoJSON(p.centerline as GeoJSON.GeoJsonObject, {
          interactive: false, style: { color, weight: 1.5, opacity: 0.9, dashArray: "6 4" },
        }).addTo(group)
      }
      if (interactive) {
        layer.bindTooltip(p.name, { sticky: true, direction: "top" })
        layer.on("mouseover", () => cb.current.onHover?.(p.id))
        layer.on("mouseout", () => cb.current.onHover?.(null))
        layer.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          cb.current.onSelect?.(p.id)
        })
      }
    }
  }, [ready, collection, selectedId, hoveredId, mode])

  // Preview, drawing, test point.
  useEffect(() => {
    const L = LRef.current, group = overlayRef.current
    if (!L || !group) return
    group.clearLayers()
    const pc = previewEnv === "rural" ? "#ea580c" : "#2563eb"
    for (const g of preview ?? []) {
      L.geoJSON(g as GeoJSON.GeoJsonObject, {
        interactive: false,
        style: { color: pc, weight: 2.5, dashArray: "7 5", fillColor: pc, fillOpacity: 0.15 },
      }).addTo(group)
    }
    if (drawing && drawing.length) {
      if (drawing.length >= 3) {
        L.polygon(drawing, { color: "#7c3aed", weight: 2, fillOpacity: 0.15, interactive: false }).addTo(group)
      } else {
        L.polyline(drawing, { color: "#7c3aed", weight: 2, interactive: false }).addTo(group)
      }
      drawing.forEach((pt, i) => {
        const m = L.marker(pt, {
          draggable: mode === "draw",
          icon: L.divIcon({ className: "", html: VERTEX_HTML, iconSize: [12, 12], iconAnchor: [6, 6] }),
          zIndexOffset: 900,
        }).addTo(group)
        m.on("dragend", () => {
          const ll = m.getLatLng()
          const next = [...(cb.current.drawing ?? [])]
          next[i] = [ll.lat, ll.lng]
          cb.current.onDrawingChange?.(next)
        })
        m.on("contextmenu", () => {
          const next = (cb.current.drawing ?? []).filter((_, j) => j !== i)
          cb.current.onDrawingChange?.(next)
        })
      })
    }
    if (testPoint) {
      L.marker([testPoint.lat, testPoint.lon], {
        icon: L.divIcon({ className: "", html: PIN_HTML, iconSize: [20, 20], iconAnchor: [10, 20] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(group)
    }
  }, [ready, preview, previewEnv, drawing, testPoint, mode])

  // Fit when asked.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    const b = cb.current.fitBounds
    if (b) {
      map.fitBounds(L.latLngBounds(b[0], b[1]), { padding: [30, 30], maxZoom: 15 })
      return
    }
    let all: import("leaflet").LatLngBounds | null = null
    for (const f of cb.current.collection?.features ?? []) {
      const fb = geometryBounds(f.geometry)
      if (!fb) continue
      const lb = L.latLngBounds(fb[0], fb[1])
      all = all ? all.extend(lb) : lb
    }
    if (all) map.fitBounds(all, { padding: [30, 30], maxZoom: 13 })
  }, [ready, fitKey])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div className={cn("relative isolate overflow-hidden rounded-xl border", className)}>
        <div ref={boxRef} className="h-full w-full" />
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] space-y-1 rounded-md bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm">
          {([
            ["#2563eb", t("cl.legend.urban")],
            ["#f97316", t("cl.legend.road")],
            ["#8b5cf6", t("cl.legend.custom")],
            ["#94a3b8", t("cl.legend.inactive")],
          ] as const).map(([c, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        {(tiles.fallbackReason === "google_not_configured" || tiles.fallbackReason === "google_unavailable") && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-[1000] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            {t("pmap.common.googleFallback")}
          </div>
        )}
      </div>
    </>
  )
}
