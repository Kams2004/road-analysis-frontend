"use client"

/**
 * Detection Map (Leaflet). Clusters are drawn as a dashed extent circle plus
 * a count badge — both clickable. Selecting a cluster flies to its extent,
 * fades the other clusters and splits it into its member detections
 * (numbered, coloured per detection type, fanned out when they share a
 * position). Clicking a detection selects it; clicking the empty map calls
 * `onMapClick` (the page resets the selection).
 */
import { useEffect, useRef, useState } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { subtypeText, useI18n } from "@/lib/i18n"
import type { ApiDetection, ClusterOut } from "@/lib/api"

export const DETECTION_TYPE_COLORS: Record<string, string> = {
  pothole:      "#ef4444",
  traffic_sign: "#3b82f6",
  speed_bump:   "#f59e0b",
  speed_hump:   "#f97316",
  parked_vehicle: "#0ea5e9",
  default:      "#8b5cf6",
}
export const detectionTypeColor = (type: string) => DETECTION_TYPE_COLORS[type] ?? DETECTION_TYPE_COLORS.default

const NO_ALTERNATIVES: [number, number][][] = []
const NO_DETECTIONS: ApiDetection[] = []

interface DetectionMapProps {
  clusters:                  ClusterOut[]
  radiusM?:                  number
  onClusterClick:            (c: ClusterOut) => void
  selectedCluster?:          ClusterOut | null
  /** Members of the selected cluster, in display order (marker n = index + 1). */
  expandedDetections?:       ApiDetection[]
  onDetectionClick?:         (d: ApiDetection) => void
  selectedDetectionId?:      string | null
  /** Click on the map background (not on a cluster or detection). */
  onMapClick?:               () => void
  /** Readable cluster names for the tooltips (cluster_id → label). */
  clusterTitles?:            Record<number, string>
  /** Searched route (lat, lon) — drawn under the clusters; alternatives dashed. */
  route?:                    [number, number][] | null
  alternatives?:             [number, number][][]
  routeLabels?:              { start: string; end: string }
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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export default function DetectionMap({
  clusters,
  onClusterClick,
  selectedCluster,
  expandedDetections = NO_DETECTIONS,
  onDetectionClick,
  selectedDetectionId = null,
  onMapClick,
  clusterTitles,
  route = null,
  alternatives = NO_ALTERNATIVES,
  routeLabels,
}: DetectionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import("leaflet").Map | null>(null)
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const clusterLayerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const detLayerRef = useRef<import("leaflet").LayerGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const routeRef = useRef(route)
  routeRef.current = route
  const { t, lang } = useI18n()
  const tRef = useRef(t)
  tRef.current = t
  // Handlers through refs: the Leaflet layers are not rebuilt when they change.
  const onClusterClickRef = useRef(onClusterClick)
  onClusterClickRef.current = onClusterClick
  const onDetectionClickRef = useRef(onDetectionClick)
  onDetectionClickRef.current = onDetectionClick
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  // Per-user base map (admin-controlled OSM URL or Google tiles).
  const tiles = useMapTiles()
  const tilesRef = useRef<LeafletTiles>(tiles)

  // Swap the base layer when the tile config arrives/changes (overlays stay).
  useEffect(() => {
    tilesRef.current = tiles
    const map = mapRef.current
    if (!map) return
    import("leaflet").then((L) => {
      if (mapRef.current !== map) return
      const prev = tileLayerRef.current
      const layer = makeTileLayer(L, tiles).addTo(map)
      layer.bringToBack()
      tileLayerRef.current = layer
      if (prev) map.removeLayer(prev)
    })
  }, [tiles])

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(containerRef.current, { center: [4.5, 11.5], zoom: 6 })
      mapRef.current = map
      tileLayerRef.current = makeTileLayer(L, tilesRef.current).addTo(map)
      clusterLayerRef.current = L.layerGroup().addTo(map)
      detLayerRef.current = L.layerGroup().addTo(map)
      map.on("click", () => onMapClickRef.current?.())
      setMapReady(true)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null
      routeLayerRef.current = null; clusterLayerRef.current = null; detLayerRef.current = null
    }
  }, [])

  const selectedId = selectedCluster?.cluster_id ?? null
  const split = selectedId != null && expandedDetections.length > 0

  // Clusters: extent circle + count badge, both clickable. Others fade while one is open.
  useEffect(() => {
    if (!mapReady) return
    import("leaflet").then((L) => {
      const group = clusterLayerRef.current
      if (!group) return
      group.clearLayers()
      const t = tRef.current
      clusters.forEach((c) => {
        const isSelected = selectedId === c.cluster_id
        const faded = selectedId != null && !isSelected
        const color = c.is_resolved ? "#22c55e" : isSelected ? "#6366f1" : "#f97316"
        const radius = clusterDisplayRadius(c)
        const title = clusterTitles?.[c.cluster_id] ?? t("pmap.cluster.title", { id: c.cluster_id })
        const tip = `<b>${escapeHtml(title)}</b><br/>${c.is_resolved ? t("pmap.detMap.resolved") : t("pmap.detMap.active")} · ${t(c.count === 1 ? "pmap.cluster.detectionOne" : "pmap.cluster.detectionMany", { count: c.count })}${isSelected ? "" : `<br/><i>${t("pmap.detMap.clickToSplit")}</i>`}`
        const select = (e: import("leaflet").LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          onClusterClickRef.current(c)
        }

        const boundary = L.circle([c.centroid_lat, c.centroid_lon], {
          radius,
          color,
          weight: isSelected ? 3 : 2,
          dashArray: "8 6",
          opacity: faded ? 0.35 : 1,
          fillColor: color,
          fillOpacity: faded ? 0.03 : isSelected ? 0.06 : 0.1,
          bubblingMouseEvents: false,
        }).addTo(group)
        boundary.bindTooltip(tip, { direction: "top", sticky: true })
        boundary.on("click", select)

        // The badge of the open cluster gives way to its detections.
        if (isSelected && split) return
        const badge = L.marker([c.centroid_lat, c.centroid_lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:${color};color:#fff;font-weight:700;font-size:12px;
              border:2px solid #fff;border-radius:12px;padding:2px 8px;cursor:pointer;
              box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;display:inline-block;
              transform:translate(-50%,-50%);">${c.count}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          opacity: faded ? 0.45 : 1,
          zIndexOffset: isSelected ? 2000 : faded ? 0 : 1000,
          bubblingMouseEvents: false,
        }).addTo(group)
        badge.bindTooltip(tip, { direction: "top", offset: [0, -12] })
        badge.on("click", select)
      })
    })
  }, [mapReady, clusters, selectedId, split, clusterTitles])

  // Members of the open cluster: numbered pins coloured per type; same-position pins fan out.
  useEffect(() => {
    if (!mapReady) return
    import("leaflet").then((L) => {
      const group = detLayerRef.current
      if (!group) return
      group.clearLayers()
      const t = tRef.current
      const located = expandedDetections
        .map((d, i) => ({ d, n: i + 1 }))
        .filter(({ d }) => d.latitude != null && d.longitude != null)
      const stacks = new Map<string, number>()
      const slot = new Map<string, number>()
      for (const { d } of located) {
        const k = `${d.latitude!.toFixed(5)},${d.longitude!.toFixed(5)}`
        stacks.set(k, (stacks.get(k) ?? 0) + 1)
      }
      for (const { d, n } of located) {
        const k = `${d.latitude!.toFixed(5)},${d.longitude!.toFixed(5)}`
        const total = stacks.get(k)!
        const j = slot.get(k) ?? 0
        slot.set(k, j + 1)
        const ring = total > 1 ? Math.min(14 + total * 2, 40) : 0
        const ang = (2 * Math.PI * j) / total - Math.PI / 2
        const dx = ring * Math.cos(ang), dy = ring * Math.sin(ang)
        const selected = d.id === selectedDetectionId
        const color = detectionTypeColor(d.type)
        const size = selected ? 30 : 24
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;
            display:flex;align-items:center;justify-content:center;font:700 11px/1 sans-serif;cursor:pointer;
            border:2px solid #fff;box-shadow:${selected ? "0 0 0 3px #6366f1," : ""}0 2px 6px rgba(0,0,0,0.45);">${n}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2 - dx, size / 2 - dy],
        })
        const typeKey = `pmap.type.${d.type}`
        const typeText = t(typeKey) === typeKey ? d.type.replace(/_/g, " ") : t(typeKey)
        const sub = d.subtype ? ` · ${escapeHtml(subtypeText(d.type, d.subtype, lang))}` : ""
        const m = L.marker([d.latitude!, d.longitude!], {
          icon,
          zIndexOffset: selected ? 4000 : 3000,
          bubblingMouseEvents: false,
        }).addTo(group)
        m.bindTooltip(`<b>#${n} · ${escapeHtml(typeText)}</b>${sub}<br/>${t("pmap.detMap.confidence")}: ${Math.round(d.confidence * 100)}%`,
          { direction: "top", offset: [dx, dy - size / 2] })
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e)
          onDetectionClickRef.current?.(d)
        })
      }
    })
  }, [mapReady, expandedDetections, selectedDetectionId, lang])

  // View: all clusters (or the route) by default; the open cluster's extent when one is selected.
  const clusterKey = clusters.map((c) => c.cluster_id).join(",")
  const lastView = useRef<string | null>(null)
  useEffect(() => {
    if (!mapReady) return
    import("leaflet").then((L) => {
      const map = mapRef.current
      if (!map) return
      const sel = selectedId != null ? clusters.find((c) => c.cluster_id === selectedId) : null
      if (sel) {
        const view = `sel:${sel.cluster_id}:${expandedDetections.length}`
        if (lastView.current === view) return
        lastView.current = view
        // LatLng.toBounds needs no map (Circle.getBounds does: it throws when the circle is not on one).
        let b = L.latLng(sel.centroid_lat, sel.centroid_lon).toBounds(clusterDisplayRadius(sel) * 2)
        for (const d of expandedDetections) if (d.latitude != null && d.longitude != null) b = b.extend([d.latitude, d.longitude])
        map.flyToBounds(b, { padding: [60, 60], maxZoom: 18, duration: 0.6 })
        return
      }
      const view = `all:${clusterKey}`
      if (lastView.current === view) return
      lastView.current = view
      // With a searched route the view stays on the route (see below).
      if (routeRef.current?.length) {
        map.flyToBounds(L.latLngBounds(routeRef.current), { padding: [36, 36], duration: 0.6 })
        return
      }
      const all = clusters.reduce(
        (b, c) => b.extend(L.latLng(c.centroid_lat, c.centroid_lon).toBounds(clusterDisplayRadius(c) * 2)),
        L.latLngBounds([] as [number, number][]),
      )
      if (all.isValid()) map.fitBounds(all, { padding: [48, 48] })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, clusterKey, selectedId, expandedDetections.length])

  // Searched route: white casing + blue line, alternatives dashed, endpoints.
  useEffect(() => {
    if (!mapReady) return
    import("leaflet").then((L) => {
      const map = mapRef.current
      if (!map) return
      routeLayerRef.current?.remove()
      routeLayerRef.current = null
      if (!route || route.length < 2) return
      const group = L.layerGroup().addTo(map)
      routeLayerRef.current = group
      alternatives.forEach((alt) =>
        L.polyline(alt, { color: "#64748b", weight: 4, opacity: 0.45, dashArray: "6 6", interactive: false }).addTo(group))
      L.polyline(route, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false }).addTo(group)
      L.polyline(route, { color: "#2563eb", weight: 5, opacity: 0.85, interactive: false }).addTo(group)
      const pin = (p: [number, number], fill: string, label?: string) => {
        const m = L.circleMarker(p, { radius: 7, color: "#ffffff", weight: 3, fillColor: fill, fillOpacity: 1 }).addTo(group)
        if (label) m.bindTooltip(label, { direction: "top" })
      }
      pin(route[0], "#2563eb", routeLabels?.start)
      pin(route[route.length - 1], "#111827", routeLabels?.end)
      // Keep the clusters above the route lines.
      clusterLayerRef.current?.eachLayer((l) => (l as import("leaflet").Path).bringToFront?.())
      map.fitBounds(L.latLngBounds([...route, ...alternatives.flat()]), { padding: [36, 36] })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, route, alternatives])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />
        {(tiles.fallbackReason === "google_not_configured" || tiles.fallbackReason === "google_unavailable") && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-[1000] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            {t("pmap.common.googleFallback")}
          </div>
        )}
      </div>
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
