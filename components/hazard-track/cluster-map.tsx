"use client"

/**
 * Overview map of the Hazard Track explorer.
 *
 *  - every cluster of the current filter as a dot coloured by hazard type,
 *    sized by its detection count (resolved = faded);
 *  - at low zoom, nearby clusters are grouped on a 56 px screen grid into a
 *    count bubble (click = zoom in) so a city-wide view stays readable;
 *  - synced with the list: hovering a dot highlights its card and vice
 *    versa, clicking selects;
 *  - with a selected cluster, the map zooms to its radius and shows the
 *    member detections as small numbered points (click = open evidence).
 *
 * Base tiles from useMapTiles() like every map of the console.
 */
import { useEffect, useRef, useState } from "react"
import { Expand, Layers } from "lucide-react"
import { useMapTiles, type LeafletTiles } from "@/hooks/use-map-tiles"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { DETECTION_TYPES, type Hazard, type HazardMember } from "@/lib/module6-api"
import { useM6Labels } from "@/components/m6-shared"
import { placeLabel, typeMeta } from "./shared"

type LNS = typeof import("leaflet")
type LMap = import("leaflet").Map

const GRID_PX = 56
const GROUP_BELOW_ZOOM = 14

function tileLayer(L: LNS, tiles: LeafletTiles) {
  return L.tileLayer(tiles.url, {
    subdomains: tiles.subdomains.length ? tiles.subdomains : undefined,
    attribution: tiles.attribution,
    maxZoom: tiles.maxZoom,
  })
}

const dotRadius = (n: number) => Math.min(18, 6 + Math.sqrt(Math.max(1, n)) * 2.2)

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

export function ClusterMap({
  clusters, selected, members, selectedDetectionId, hoveredId, onHover, onSelect, onOpenDetection, capped, className,
}: {
  clusters: Hazard[]
  /** Selected cluster (zoom target). */
  selected: Hazard | null
  members?: HazardMember[]
  selectedDetectionId?: string | null
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onOpenDetection?: (id: string) => void
  /** The filter has more clusters than the map shows. */
  capped?: number | null
  className?: string
}) {
  const t = useT()
  const L6 = useM6Labels()
  const tiles = useMapTiles()
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const LRef = useRef<LNS | null>(null)
  const tileRef = useRef<import("leaflet").TileLayer | null>(null)
  const groupRef = useRef<import("leaflet").LayerGroup | null>(null)
  const focusRef = useRef<import("leaflet").LayerGroup | null>(null)
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  const cb = useRef({ onHover, onSelect, onOpenDetection })
  cb.current = { onHover, onSelect, onOpenDetection }
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(6)
  const dotsRef = useRef(new Map<string, { m: import("leaflet").CircleMarker; r: number }>())

  useEffect(() => {
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(boxRef.current, { center: [4.05, 9.7], zoom: 6, zoomControl: true })
      mapRef.current = map
      tileRef.current = tileLayer(L, tilesRef.current).addTo(map)
      groupRef.current = L.layerGroup().addTo(map)
      focusRef.current = L.layerGroup().addTo(map)
      map.on("zoomend", () => setZoom(map.getZoom()))
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(boxRef.current)
      ;(map as unknown as { _ro?: ResizeObserver })._ro = ro
      setTimeout(() => map.invalidateSize(), 200)
      setReady(true)
    })
    return () => {
      cancelled = true
      const map = mapRef.current as (LMap & { _ro?: ResizeObserver }) | null
      map?._ro?.disconnect()
      map?.remove()
      mapRef.current = null
      groupRef.current = null
      focusRef.current = null
      tileRef.current = null
    }
  }, [])

  // Base tiles when the map config arrives.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    const prev = tileRef.current
    const layer = tileLayer(L, tiles).addTo(map)
    layer.bringToBack()
    tileRef.current = layer
    if (prev) map.removeLayer(prev)
  }, [tiles, ready])

  // Cluster dots (grid-grouped at low zoom).
  useEffect(() => {
    const L = LRef.current, map = mapRef.current, group = groupRef.current
    if (!L || !map || !group) return
    group.clearLayers()
    dotsRef.current.clear()
    const z = map.getZoom()
    const cells = new Map<string, Hazard[]>()
    for (const h of clusters) {
      if (z < GROUP_BELOW_ZOOM && h.id !== selected?.id) {
        const p = map.project([h.latitude, h.longitude], z)
        const key = `${Math.floor(p.x / GRID_PX)}:${Math.floor(p.y / GRID_PX)}`
        cells.set(key, [...(cells.get(key) ?? []), h])
      } else {
        cells.set(h.id, [h])
      }
    }
    for (const hs of cells.values()) {
      if (hs.length > 1) {
        const lat = hs.reduce((s, h) => s + h.latitude, 0) / hs.length
        const lon = hs.reduce((s, h) => s + h.longitude, 0) / hs.length
        const n = hs.reduce((s, h) => s + h.detection_count, 0)
        // Ring segments = share of each type in the group.
        const byType = new Map<string, number>()
        for (const h of hs) byType.set(h.type, (byType.get(h.type) ?? 0) + 1)
        let acc = 0
        const stops = [...byType.entries()].map(([ty, c]) => {
          const from = (acc / hs.length) * 360
          acc += c
          return `${typeMeta(ty).color} ${from}deg ${(acc / hs.length) * 360}deg`
        }).join(",")
        const size = Math.min(54, 30 + Math.sqrt(hs.length) * 4)
        const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:conic-gradient(${stops});padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.35)">
          <div style="width:100%;height:100%;border-radius:50%;background:rgba(15,23,42,.85);color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px/1 system-ui">${hs.length}</div></div>`
        const m = L.marker([lat, lon], {
          icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
          riseOnHover: true,
        }).addTo(group)
        m.bindTooltip(esc(t("ht.map.group", { n: hs.length, d: n })), { direction: "top", offset: [0, -size / 2] })
        m.on("click", () => {
          const b = L.latLngBounds(hs.map((h) => [h.latitude, h.longitude] as [number, number]))
          map.fitBounds(b.pad(0.3), { maxZoom: GROUP_BELOW_ZOOM + 1 })
        })
        continue
      }
      const h = hs[0]
      const meta = typeMeta(h.type)
      const isSel = h.id === selected?.id
      const resolved = h.status !== "active"
      const r = dotRadius(h.detection_count) + (isSel ? 2 : 0)
      const dot = L.circleMarker([h.latitude, h.longitude], {
        radius: r,
        color: isSel ? "#0f172a" : "#ffffff",
        weight: isSel ? 3 : 2,
        fillColor: resolved ? "#94a3b8" : meta.color,
        fillOpacity: resolved ? 0.75 : 0.92,
      }).addTo(group)
      if (isSel) dot.bringToFront()
      dotsRef.current.set(h.id, { m: dot, r })
      const place = placeLabel(h)
      dot.bindTooltip(
        `<b>${esc(h.code)}</b> · ${esc(L6.typeLabel(h.type))}<br/>${esc(place ?? `${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)}`)}<br/>${esc(t("ht.map.dets", { n: h.detection_count }))}`,
        { direction: "top", offset: [0, -r] },
      )
      dot.on("mouseover", () => cb.current.onHover(h.id))
      dot.on("mouseout", () => cb.current.onHover(null))
      dot.on("click", () => cb.current.onSelect(h.id))
    }
  }, [ready, clusters, selected?.id, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // List ↔ map hover: grow the hovered dot without rebuilding the layer.
  useEffect(() => {
    if (!hoveredId) return
    const d = dotsRef.current.get(hoveredId)
    if (!d) return
    d.m.setRadius(d.r + 4)
    d.m.setStyle({ weight: 3 })
    d.m.bringToFront()
    return () => { d.m.setRadius(d.r); d.m.setStyle({ weight: hoveredId === selected?.id ? 3 : 2 }) }
  }, [hoveredId, ready, clusters, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Selected cluster: radius circle + member detections.
  useEffect(() => {
    const L = LRef.current, focus = focusRef.current
    if (!L || !focus) return
    focus.clearLayers()
    if (!selected) return
    const meta = typeMeta(selected.type)
    L.circle([selected.latitude, selected.longitude], {
      radius: selected.radius_m ?? 25, color: meta.color, weight: 2, dashArray: "6 4", fillOpacity: 0.08, interactive: false,
    }).addTo(focus)
    ;(members ?? []).forEach((m, i) => {
      if (m.latitude == null || m.longitude == null) return
      const sel = m.id === selectedDetectionId
      const html = `<div style="width:${sel ? 22 : 18}px;height:${sel ? 22 : 18}px;border-radius:50%;background:${sel ? "#0f172a" : "#fff"};color:${sel ? "#fff" : "#0f172a"};border:2px solid ${meta.color};display:flex;align-items:center;justify-content:center;font:600 10px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`
      const s = sel ? 22 : 18
      const mk = L.marker([m.latitude, m.longitude], {
        icon: L.divIcon({ className: "", html, iconSize: [s, s], iconAnchor: [s / 2, s / 2] }),
        zIndexOffset: sel ? 2000 : 1000,
      }).addTo(focus)
      mk.bindTooltip(esc(`#${i + 1} · ${L6.pct(m.confidence)} · ${L6.fmtShort(m.recorded_at ?? m.captured_at ?? m.created_at ?? null)}`), { direction: "top", offset: [0, -s / 2] })
      mk.on("click", () => cb.current.onOpenDetection?.(m.id))
    })
  }, [ready, selected, members, selectedDetectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Framing: the selected cluster, else every cluster of the filter.
  const fitAll = () => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map || !clusters.length) return
    const b = L.latLngBounds(clusters.map((h) => [h.latitude, h.longitude] as [number, number]))
    if (clusters.length === 1) map.setView(b.getCenter(), 15)
    else map.fitBounds(b.pad(0.15), { maxZoom: 16 })
  }
  const clusterKey = clusters.map((h) => h.id).join(",")
  useEffect(() => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    if (selected) {
      let b = L.latLng(selected.latitude, selected.longitude).toBounds((selected.radius_m ?? 25) * 2.4)
      for (const m of members ?? []) if (m.latitude != null && m.longitude != null) b = b.extend([m.latitude, m.longitude])
      map.flyToBounds(b, { maxZoom: 18, duration: 0.6, padding: [24, 24] })
    } else {
      fitAll()
    }
  }, [ready, selected?.id, members?.length, selected ? "" : clusterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const types = DETECTION_TYPES.filter((ty) => clusters.some((h) => h.type === ty))
  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
      <div className={cn("relative isolate overflow-hidden rounded-xl border bg-muted", className)}>
        <div ref={boxRef} className="h-full w-full" />
        {/* Legend */}
        {types.length > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm ring-1 ring-border backdrop-blur">
            {types.map((ty) => (
              <span key={ty} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: typeMeta(ty).color }} />
                {L6.typeLabel(ty)}
              </span>
            ))}
          </div>
        )}
        <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1">
          <button type="button" onClick={fitAll} title={t("ht.map.fit")} aria-label={t("ht.map.fit")}
            className="inline-flex items-center gap-1 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm ring-1 ring-border backdrop-blur hover:bg-background">
            <Expand className="h-3.5 w-3.5" />{t("ht.map.fit")}
          </button>
          {capped != null && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/90 px-2 py-1 text-[10px] font-medium text-white shadow-sm">
              <Layers className="h-3 w-3" />{t("ht.map.capped", { n: capped })}
            </span>
          )}
        </div>
        {(tiles.fallbackReason === "google_not_configured" || tiles.fallbackReason === "google_unavailable") && (
          <div className="pointer-events-none absolute bottom-10 left-2 z-[1000] rounded bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            {t("pmap.common.googleFallback")}
          </div>
        )}
      </div>
    </>
  )
}
