"use client"

/**
 * Community reporting map: one marker per report, drawn with the mobile
 * app's report icon inside a ring coloured by status — green active, amber
 * dashed when uncertain (drivers pass without voting), grey/red and greyed
 * out when hidden or rejected. Optional searched route underneath.
 * Loaded with next/dynamic (ssr: false) — Leaflet needs `window`.
 */
import { useEffect, useRef } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import type { ApiSignalement } from "@/lib/api"
import type { LatLon } from "@/lib/routes-api"

const ICONS = new Set([
  "accident", "animaux", "autre", "danger", "dos_d_ane", "eboulement", "embouteillage", "inondation",
  "nid_de_poule", "obstacle", "police", "route_fermee", "route_glissante", "travaux", "vehicule_dangereux",
  "vehicule_panne",
])
const ICON_ALIAS: Record<string, string> = {
  voie_bloquee: "route_fermee", mauvais_temps: "route_glissante", assistance_route: "vehicule_panne",
}
export const reportIconUrl = (type: string) =>
  `/report-icons/${ICONS.has(type) ? type : ICON_ALIAS[type] ?? "autre"}.png`

export type MarkerLook = "active" | "uncertain" | "expired" | "annule" | "rejete"

export function markerLook(s: ApiSignalement): MarkerLook {
  if (s.status === "annule") return "annule"
  if (s.status === "rejete") return "rejete"
  if (s.uncertain) return "uncertain"
  if (s.expired) return "expired"
  return "active"
}

export const LOOK_COLOR: Record<MarkerLook, string> = {
  active: "#16a34a", uncertain: "#f59e0b", expired: "#64748b", annule: "#64748b", rejete: "#dc2626",
}

const CAMEROON: LatLon = [5.5, 12.0]

function iconHtml(s: ApiSignalement, selected: boolean): string {
  const look = markerLook(s)
  const size = selected ? 40 : 32
  const dim = look === "annule" || look === "rejete"
  const border = look === "uncertain" ? "dashed" : "solid"
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;
    border:3px ${border} ${LOOK_COLOR[look]};display:flex;align-items:center;justify-content:center;
    box-shadow:${selected ? "0 0 0 4px rgba(99,102,241,.55)," : ""}0 2px 6px rgba(0,0,0,.35);
    opacity:${dim ? 0.6 : look === "expired" ? 0.8 : 1};${dim ? "filter:grayscale(1);" : ""}box-sizing:border-box">
    <img src="${reportIconUrl(s.type)}" alt="" style="width:${size - 10}px;height:${size - 10}px;object-fit:contain;pointer-events:none"/>
  </div>`
}

export default function SignalementMap({
  items, selectedId, focus, onSelect, tooltip, route, alternatives, routeLabels,
}: {
  items: ApiSignalement[]
  selectedId: string | null
  /** Fly to this report (row click); `n` re-triggers for the same id. */
  focus: { id: string; n: number } | null
  onSelect: (s: ApiSignalement) => void
  tooltip: (s: ApiSignalement) => string
  route?: LatLon[] | null
  alternatives?: LatLon[][]
  routeLabels?: { start: string; end: string }
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null)
  const routeRef = useRef<import("leaflet").LayerGroup | null>(null)
  const byId = useRef<Map<string, import("leaflet").Marker>>(new Map())
  const fitted = useRef<string>("")
  const tiles = useMapTiles()
  const tilesRef = useRef<LeafletTiles>(tiles)
  const props = useRef({ items, selectedId, onSelect, tooltip, route, alternatives, routeLabels })
  props.current = { items, selectedId, onSelect, tooltip, route, alternatives, routeLabels }

  const drawMarkers = (L: typeof import("leaflet")) => {
    const map = mapRef.current, group = markersRef.current
    if (!map || !group) return
    group.clearLayers()
    byId.current.clear()
    const { items, selectedId, onSelect, tooltip, route } = props.current
    for (const s of items) {
      const selected = s.id === selectedId
      const size = selected ? 40 : 32
      const m = L.marker([s.latitude, s.longitude], {
        icon: L.divIcon({ className: "", html: iconHtml(s, selected), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: selected ? 1000 : 0,
        keyboard: true,
        title: tooltip(s).replace(/<[^>]+>/g, " "),
      })
        .bindTooltip(tooltip(s), { direction: "top", offset: [0, -size / 2] })
        .on("click", () => onSelect(s))
        .addTo(group)
      byId.current.set(s.id, m)
    }
    // Fit once per data set (not on every selection change).
    const key = `${items.length}:${items[0]?.id ?? ""}:${items[items.length - 1]?.id ?? ""}`
    if (key !== fitted.current && !(route && route.length > 1)) {
      fitted.current = key
      if (items.length) {
        map.fitBounds(L.latLngBounds(items.map((s) => [s.latitude, s.longitude] as LatLon)), { padding: [32, 32], maxZoom: 15 })
      }
    }
  }

  const drawRoute = (L: typeof import("leaflet")) => {
    const map = mapRef.current, group = routeRef.current
    if (!map || !group) return
    group.clearLayers()
    const { route, alternatives = [], routeLabels } = props.current
    if (!route || route.length < 2) return
    alternatives.forEach((alt) =>
      L.polyline(alt, { color: "#64748b", weight: 4, opacity: 0.45, dashArray: "6 6", interactive: false }).addTo(group))
    L.polyline(route, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false }).addTo(group)
    L.polyline(route, { color: "#2563eb", weight: 5, opacity: 0.85, interactive: false }).addTo(group)
    const pin = (p: LatLon, fill: string, label?: string) => {
      const c = L.circleMarker(p, { radius: 7, color: "#ffffff", weight: 3, fillColor: fill, fillOpacity: 1 }).addTo(group)
      if (label) c.bindTooltip(label, { direction: "top" })
    }
    pin(route[0], "#2563eb", routeLabels?.start)
    pin(route[route.length - 1], "#111827", routeLabels?.end)
    map.fitBounds(L.latLngBounds([...route, ...alternatives.flat()]), { padding: [28, 28] })
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { center: CAMEROON, zoom: 6 })
      mapRef.current = map
      tileRef.current = makeTileLayer(L, tilesRef.current).addTo(map)
      routeRef.current = L.layerGroup().addTo(map)
      markersRef.current = L.layerGroup().addTo(map)
      drawRoute(L)
      drawMarkers(L)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      tileRef.current = null
      markersRef.current = null
      routeRef.current = null
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
    import("leaflet").then((L) => drawMarkers(L))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId])

  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => drawRoute(L))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, alternatives])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const m = byId.current.get(focus.id)
    if (!m) return
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 })
    window.setTimeout(() => m.openTooltip(), 650)
  }, [focus])

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
