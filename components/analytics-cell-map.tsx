"use client"

/**
 * Generic grid-cell map for the analytics pages (Module 4 historical risk
 * heatmap, Module 5 behaviour heatmap / zones): square cells coloured by the
 * caller, optional circles (zones) on top. Loaded with next/dynamic
 * (ssr: false) — Leaflet needs `window`.
 */
import { useEffect, useRef } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"

export type LatLon = [number, number]

export interface MapCell {
  id: string
  lat: number
  lon: number
  sizeM: number
  color: string
  fillOpacity?: number
  weight?: number
  dashed?: boolean
  tooltip: string
}

export interface MapCircle {
  id: string
  lat: number
  lon: number
  radiusM: number
  color: string
  tooltip: string
}

const DOUALA: LatLon = [4.0511, 9.7679]

export default function AnalyticsCellMap({
  cells, circles = [], center = null, focus = null, onSelect,
}: {
  cells: MapCell[]
  circles?: MapCircle[]
  center?: LatLon | null
  focus?: { id: string; n: number } | null
  onSelect?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const shapes = useRef<Map<string, import("leaflet").Rectangle | import("leaflet").Circle>>(new Map())
  const centeredRef = useRef(false)
  const tiles = useMapTiles()
  const tilesRef = useRef<LeafletTiles>(tiles)
  const props = useRef({ cells, circles, center, onSelect })
  props.current = { cells, circles, center, onSelect }

  const draw = (L: typeof import("leaflet")) => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    shapes.current.clear()
    const { cells, circles, center, onSelect } = props.current
    const pts: LatLon[] = []
    cells.forEach((c) => {
      const half = c.sizeM / 2
      const dLat = half / 111320
      const dLon = half / (111320 * Math.cos((c.lat * Math.PI) / 180))
      const rect = L.rectangle([[c.lat - dLat, c.lon - dLon], [c.lat + dLat, c.lon + dLon]], {
        color: c.color, weight: c.weight ?? 1, opacity: 0.9, fillColor: c.color,
        fillOpacity: c.fillOpacity ?? 0.45, dashArray: c.dashed ? "4 4" : undefined,
      })
        .bindTooltip(c.tooltip, { direction: "top", sticky: true })
        .addTo(group)
      if (onSelect) rect.on("click", () => onSelect(c.id))
      shapes.current.set(c.id, rect)
      pts.push([c.lat, c.lon])
    })
    circles.forEach((z) => {
      const circle = L.circle([z.lat, z.lon], {
        radius: z.radiusM, color: z.color, weight: 2.5, fillColor: z.color, fillOpacity: 0.12,
      })
        .bindTooltip(z.tooltip, { direction: "top", sticky: true })
        .addTo(group)
      if (onSelect) circle.on("click", () => onSelect(z.id))
      shapes.current.set(z.id, circle)
      pts.push([z.lat, z.lon])
    })
    if (center && !centeredRef.current) {
      centeredRef.current = true
      map.setView(center, 15)
    } else if (!centeredRef.current && pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 })
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { center: props.current.center ?? DOUALA, zoom: 12 })
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
  }, [cells, circles, center])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const s = shapes.current.get(focus.id)
    if (!s) return
    map.fitBounds(s.getBounds(), { maxZoom: 16, padding: [40, 40] })
    s.openTooltip()
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
