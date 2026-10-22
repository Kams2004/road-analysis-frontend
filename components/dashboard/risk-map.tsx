"use client"

/**
 * Small, read-only map of active hazards coloured by risk level (dashboard
 * preview). Loaded with next/dynamic (ssr: false) — Leaflet needs `window`.
 */
import { useEffect, useRef } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { useT } from "@/lib/i18n"
import { RISK_COLORS, type DashboardData } from "./types"

type Hazard = DashboardData["map_hazards"][number]

export default function RiskMap({ hazards }: { hazards: Hazard[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const tiles = useMapTiles()
  const tilesRef = useRef<LeafletTiles>(tiles)
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t
  const hazardsRef = useRef(hazards)
  hazardsRef.current = hazards

  const draw = (L: typeof import("leaflet")) => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    const list = hazardsRef.current
    list.forEach((h) => {
      const color = RISK_COLORS[h.risk_level]
      L.circleMarker([h.lat, h.lon], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      })
        .bindTooltip(
          `<b>${h.code}</b> · ${tRef.current(`dash.risk.${h.risk_level}`)}<br/>${h.type.replace(/_/g, " ")} · ×${h.detection_count}`,
          { direction: "top" },
        )
        .addTo(group)
    })
    if (list.length) {
      const b = L.latLngBounds(list.map((h) => [h.lat, h.lon] as [number, number]))
      map.fitBounds(b, { padding: [24, 24], maxZoom: 14 })
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { center: [4.5, 11.5], zoom: 5, zoomControl: true, attributionControl: true })
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
  }, [hazards])

  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
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
