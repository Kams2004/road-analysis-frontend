"use client"

import { useEffect, useRef } from "react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { useT } from "@/lib/i18n"
import type { ClusterOut } from "@/lib/api"

const CLUSTER_COLORS = [
  "#ef4444", "#3b82f6", "#f59e0b", "#10b981",
  "#8b5cf6", "#f97316", "#06b6d4", "#ec4899",
]

interface ClusterMapProps {
  clusters: ClusterOut[]
  radiusM: number
  onClusterClick?: (cluster: ClusterOut) => void
}

export default function ClusterMap({ clusters, radiusM, onClusterClick }: ClusterMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null)
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "/vendor/leaflet/images/marker-icon-2x.png",
        iconUrl: "/vendor/leaflet/images/marker-icon.png",
        shadowUrl: "/vendor/leaflet/images/marker-shadow.png",
      })

      const center: [number, number] = clusters.length > 0
        ? [clusters[0].centroid_lat, clusters[0].centroid_lon]
        : [4.5, 11.5]

      const map = L.map(containerRef.current!, { center, zoom: clusters.length > 0 ? 13 : 6 })
      mapRef.current = map

      tileLayerRef.current = makeTileLayer(L, tilesRef.current).addTo(map)

      renderClusters(L, map, clusters, radiusM, tRef.current, onClusterClick)

      if (clusters.length > 1) {
        const bounds = L.latLngBounds(clusters.map((c) => [c.centroid_lat, c.centroid_lon] as [number, number]))
        map.fitBounds(bounds, { padding: [60, 60] })
      }
    })

    return () => { mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => {
      const map = mapRef.current!
      map.eachLayer((layer) => {
        if (layer instanceof L.Circle || layer instanceof L.Marker || layer instanceof L.CircleMarker)
          map.removeLayer(layer)
      })
      renderClusters(L, map, clusters, radiusM, tRef.current, onClusterClick)
      if (clusters.length > 1) {
        const bounds = L.latLngBounds(clusters.map((c) => [c.centroid_lat, c.centroid_lon] as [number, number]))
        map.fitBounds(bounds, { padding: [60, 60] })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, radiusM])

  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />
        {(tiles.fallbackReason === "google_not_configured" || tiles.fallbackReason === "google_unavailable") && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
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

function renderClusters(
  L: typeof import("leaflet"),
  map: import("leaflet").Map,
  clusters: ClusterOut[],
  radiusM: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
  onClusterClick?: (c: ClusterOut) => void,
) {
  clusters.forEach((cluster, i) => {
    const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length]

    // Cluster radius circle
    const circle = L.circle([cluster.centroid_lat, cluster.centroid_lon], {
      radius: radiusM,
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(map)

    circle.bindPopup(`
      <div style="font-family:sans-serif;min-width:160px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${t("pmap.cluster.title", { id: cluster.cluster_id })}</div>
        <div style="font-size:11px;color:#666">${t(cluster.count === 1 ? "pmap.cluster.detectionOne" : "pmap.cluster.detectionMany", { count: cluster.count })}</div>
        <div style="font-size:11px;color:#666">${t("pmap.cluster.radius", { radius: radiusM })}</div>
      </div>
    `, { maxWidth: 200 })

    if (onClusterClick) circle.on("click", () => onClusterClick(cluster))

    // Centroid marker
    const centroidIcon = L.divIcon({
      className: "",
      html: `<div style="
        background:${color};color:#fff;
        border-radius:50%;width:32px;height:32px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;
        border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
      ">${cluster.count}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })

    const centroid = L.marker([cluster.centroid_lat, cluster.centroid_lon], { icon: centroidIcon }).addTo(map)
    centroid.bindPopup(`
      <div style="font-family:sans-serif;min-width:160px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${t("pmap.cluster.title", { id: cluster.cluster_id })}</div>
        <div style="font-size:11px;color:#666">${t(cluster.count === 1 ? "pmap.cluster.detectionOne" : "pmap.cluster.detectionMany", { count: cluster.count })}</div>
        <div style="font-size:11px;color:#666">${cluster.centroid_lat.toFixed(5)}, ${cluster.centroid_lon.toFixed(5)}</div>
      </div>
    `, { maxWidth: 200 })
    if (onClusterClick) centroid.on("click", () => onClusterClick(cluster))
  })
}
