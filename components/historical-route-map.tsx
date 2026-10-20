"use client"

/**
 * Historical Risk Analysis map: the searched route coloured by the
 * historical risk of the grid cells it crosses, with high-risk cells
 * outlined. Always rendered (centred on Douala before any search).
 * Loaded with next/dynamic (ssr: false) — Leaflet needs `window`.
 */
import { useEffect, useRef } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"

export interface RouteCell {
  grid_cell_id: string
  center_latitude: number
  center_longitude: number
  historical_risk_score: number
  total_events: number
  road_name: string | null
}

export type LatLon = [number, number]

const DOUALA: LatLon = [4.0511, 9.7679]
const CELL_SIZE_M = 150          // settings.HISTORICAL_GRID_CELL_SIZE_M
const NO_DATA = "#64748b"
export const HIGH_RISK = 0.5

export function riskColor(score: number): string {
  if (score >= 0.75) return "#dc2626"
  if (score >= 0.5) return "#f97316"
  if (score >= 0.25) return "#f59e0b"
  return "#10b981"
}

function distM(a: LatLon, b: LatLon): number {
  const k = Math.PI / 180
  const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k)
  const y = (b[0] - a[0]) * k
  return Math.sqrt(x * x + y * y) * 6371000
}

export default function HistoricalRouteMap({
  route, alternatives, cells, start, end, focus, onSelect, labels,
}: {
  route: LatLon[] | null
  alternatives: LatLon[][]
  cells: RouteCell[]
  start: LatLon | null
  end: LatLon | null
  focus: { id: string; n: number } | null
  onSelect: (cellId: string) => void
  labels: { start: string; end: string; events: string; risk: string }
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const cellLayers = useRef<Map<string, import("leaflet").Rectangle>>(new Map())
  const tiles = useMapTiles()
  const tilesRef = useRef<LeafletTiles>(tiles)
  const props = useRef({ route, alternatives, cells, start, end, onSelect, labels })
  props.current = { route, alternatives, cells, start, end, onSelect, labels }

  const draw = (L: typeof import("leaflet")) => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    cellLayers.current.clear()
    const { route, alternatives, cells, start, end, onSelect, labels } = props.current

    alternatives.forEach((alt) => {
      L.polyline(alt, { color: NO_DATA, weight: 4, opacity: 0.35, dashArray: "6 6" }).addTo(group)
    })

    // Cells: high-risk ones outlined & filled, others faint (all clickable).
    const half = CELL_SIZE_M / 2
    cells.forEach((c) => {
      const dLat = half / 111320
      const dLon = half / (111320 * Math.cos((c.center_latitude * Math.PI) / 180))
      const high = c.historical_risk_score >= HIGH_RISK
      const color = riskColor(c.historical_risk_score)
      const rect = L.rectangle(
        [[c.center_latitude - dLat, c.center_longitude - dLon], [c.center_latitude + dLat, c.center_longitude + dLon]],
        { color, weight: high ? 2 : 1, opacity: high ? 0.9 : 0.4, fillColor: color, fillOpacity: high ? 0.25 : 0.08 },
      )
        .bindTooltip(
          `<b>${c.road_name ?? c.grid_cell_id}</b><br/>${labels.risk}: ${Math.round(c.historical_risk_score * 100)}% · ${labels.events}: ${c.total_events}`,
          { direction: "top", sticky: true },
        )
        .on("click", () => onSelect(c.grid_cell_id))
        .addTo(group)
      cellLayers.current.set(c.grid_cell_id, rect)
    })

    // Route: each leg coloured by the cell it falls in (grey = no data).
    if (route && route.length > 1) {
      L.polyline(route, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(group)
      let run: LatLon[] = [route[0]]
      let runColor: string | null = null
      const flush = () => {
        if (run.length > 1) L.polyline(run, { color: runColor ?? NO_DATA, weight: 5, opacity: 0.95 }).addTo(group)
      }
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i]
        const mid: LatLon = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        let best: RouteCell | null = null
        let bestD = CELL_SIZE_M * 0.75
        for (const c of cells) {
          const d = distM(mid, [c.center_latitude, c.center_longitude])
          if (d < bestD) { bestD = d; best = c }
        }
        const color = best ? riskColor(best.historical_risk_score) : NO_DATA
        if (runColor !== null && color !== runColor) {
          flush()
          run = [a]
        }
        runColor = color
        run.push(b)
      }
      flush()
    }

    const pin = (p: LatLon, fill: string, label: string) =>
      L.circleMarker(p, { radius: 8, color: "#ffffff", weight: 3, fillColor: fill, fillOpacity: 1 })
        .bindTooltip(label, { direction: "top" })
        .addTo(group)
    if (start) pin(start, "#2563eb", labels.start)
    if (end) pin(end, "#111827", labels.end)

    if (route && route.length > 1) {
      map.fitBounds(L.latLngBounds([...route, ...alternatives.flat()]), { padding: [28, 28] })
    } else if (start || end) {
      map.setView((start ?? end) as LatLon, 14)
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { center: DOUALA, zoom: 12, zoomControl: true, attributionControl: true })
      mapRef.current = map
      tileRef.current = makeTileLayer(L, tilesRef.current).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      draw(L)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      tileRef.current = null
      layerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    tilesRef.current = tiles
    const map = mapRef.current
    if (!map) return
    import("leaflet").then((L) => {
      if (mapRef.current !== map) return
      const prev = tileRef.current
      const layer = makeTileLayer(L, tiles).addTo(map)
      layer.bringToBack()
      tileRef.current = layer
      if (prev) map.removeLayer(prev)
    })
  }, [tiles])

  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => draw(L))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, alternatives, cells, start, end])

  // Zoom to the selected cell (table row or map click).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const rect = cellLayers.current.get(focus.id)
    if (!rect) return
    map.fitBounds(rect.getBounds(), { maxZoom: 17, padding: [40, 40] })
    rect.openTooltip()
  }, [focus])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} className="relative z-0 h-full w-full" />
    </>
  )
}

function makeTileLayer(L: typeof import("leaflet"), tiles: LeafletTiles) {
  return L.tileLayer(tiles.url, {
    subdomains: tiles.subdomains.length ? tiles.subdomains : undefined,
    attribution: tiles.attribution,
    maxZoom: tiles.maxZoom,
  })
}
