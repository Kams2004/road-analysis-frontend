"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, RefreshCw, X, ImageIcon, ChevronLeft, CheckCircle2, Clock, Loader2, ZoomIn } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fetchAllDetections, fetchClusters, resolveCluster, resolveMinioUrl,
  type ApiDetection, type ClusterOut, type ClusteredDetectionsOut,
} from "@/lib/api"
import { getDetection } from "@/lib/module6-api"
import { subtypeText, useI18n, useT } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { RouteSearchBar, type RouteSearchResult } from "@/components/route-search-bar"
import { filterAlongRoute, type LatLon } from "@/lib/routes-api"
import { placeLabel, TypeTile } from "@/components/hazard-track/shared"
import { useM6Labels } from "@/components/m6-shared"
import { bboxOf } from "@/components/zoomable-image"
import { DetectionImageViewer, type ViewerItem } from "@/components/detection-image-viewer"
import { DETECTION_TYPE_COLORS, detectionTypeColor } from "@/components/detection-map"

function MapLoading() {
  const t = useT()
  return (
    <div className="flex h-full items-center justify-center bg-muted/30 rounded-xl">
      <div className="text-center space-y-2">
        <MapPin className="mx-auto h-10 w-10 text-muted-foreground animate-pulse" />
        <p className="text-sm text-muted-foreground">{t("pmap.map.loading")}</p>
      </div>
    </div>
  )
}

const DetectionMap = dynamic(() => import("@/components/detection-map"), {
  ssr: false,
  loading: () => <MapLoading />,
})

const STATUS_TONE: Record<string, BadgeTone> = {
  pending:   "amber",
  validated: "green",
  corrected: "blue",
  rejected:  "red",
  resolved:  "blue",
}

/** Accepted statuses — the only ones POST /detections/clusters groups. */
const CLUSTERED_STATUSES = "validated,corrected"

const detTime = (d: ApiDetection) => d.recorded_at ?? d.captured_at ?? d.created_at
const timeMs = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0)
const mostCommon = <T,>(xs: (T | null | undefined)[]): { value: T; n: number } | null => {
  const acc = new Map<T, number>()
  for (const x of xs) if (x != null && x !== "") acc.set(x, (acc.get(x) ?? 0) + 1)
  let best: { value: T; n: number } | null = null
  for (const [value, n] of acc) if (!best || n > best.n) best = { value, n }
  return best
}

/** What the console can say about a cluster from its member detections. */
interface ClusterInfo {
  /** Hazard code(s) of the members, most common first. */
  hazardCodes: string[]
  /** [type, count], most frequent first. */
  types: [string, number][]
  dominantType: string | null
  place: string | null
  lastDetected: string | null
  /** Members, grouped by type (most frequent type first), newest first — numbering order. */
  members: ApiDetection[]
  /** Member ids not found in the loaded detections. */
  missing: string[]
}

function clusterInfo(c: ClusterOut, byId: Map<string, ApiDetection>): ClusterInfo {
  const found: ApiDetection[] = []
  const missing: string[] = []
  for (const id of c.detection_ids) {
    const d = byId.get(id)
    if (d) found.push(d)
    else missing.push(id)
  }
  const typeCount = new Map<string, number>()
  for (const d of found) typeCount.set(d.type, (typeCount.get(d.type) ?? 0) + 1)
  const types = [...typeCount.entries()].sort((a, b) => b[1] - a[1])
  const rank = new Map(types.map(([ty], i) => [ty, i]))
  const members = [...found].sort((a, b) =>
    (rank.get(a.type)! - rank.get(b.type)!) || (timeMs(detTime(b)) - timeMs(detTime(a))))
  const codes = new Map<string, number>()
  for (const d of found) if (d.hazard_code) codes.set(d.hazard_code, (codes.get(d.hazard_code) ?? 0) + 1)
  const last = found.reduce<string | null>((m, d) => (!m || timeMs(detTime(d)) > timeMs(m) ? detTime(d) : m), null)
  return {
    hazardCodes: [...codes.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code),
    types,
    dominantType: types[0]?.[0] ?? null,
    place: mostCommon(found.map((d) => placeLabel(d)))?.value ?? null,
    lastDetected: last,
    members,
    missing,
  }
}

/** "HZ-000012" / "HZ-000012 +1" when the members belong to the hazard(s); else "Cluster #n". */
function clusterTitle(c: ClusterOut, info: ClusterInfo | undefined, t: (k: string, v?: Record<string, string | number>) => string) {
  const codes = info?.hazardCodes ?? []
  if (codes.length === 1) return codes[0]
  if (codes.length > 1) return `${codes[0]} +${codes.length - 1}`
  return t("pmap.cluster.title", { id: c.cluster_id + 1 })
}

/** Labels shared by the panels. */
function useDetLabels() {
  const L = useM6Labels()
  const subLabel = (d: ApiDetection) => {
    if (!d.subtype) return ""
    if (d.type === "parked_vehicle") return subtypeText(d.type, d.subtype, L.lang)
    return L.subtypeLabel(d.type, d.subtype)
  }
  const vehicleClass = (d: ApiDetection) => {
    const cls = d.type === "parked_vehicle" ? d.ai_details?.vehicle_class : null
    return cls ? L.tl(`pv.class.${cls}`, cls) : ""
  }
  const fullLabel = (d: ApiDetection) =>
    [L.typeLabel(d.type), subLabel(d), vehicleClass(d)].filter(Boolean).join(" · ")
  const place = (d: ApiDetection) =>
    placeLabel(d) ?? (d.latitude != null && d.longitude != null ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}` : "—")
  return { ...L, subLabel, vehicleClass, fullLabel, place }
}

export default function MapPage() {
  const { t } = useI18n()
  const tl = (key: string, raw: string) => { const s = t(key); return s === key ? raw : s }
  const { can } = useAuth()
  const [detections, setDetections]           = useState<ApiDetection[]>([])
  /** Members fetched one by one because they were not in the bulk list. */
  const [extraDetections, setExtraDetections] = useState<Record<string, ApiDetection>>({})
  const [membersLoading, setMembersLoading]   = useState(false)
  const [clusterData, setClusterData]         = useState<ClusteredDetectionsOut | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [typeFilter, setTypeFilter]           = useState("all")

  const [selectedCluster, setSelectedCluster]     = useState<ClusterOut | null>(null)
  const [selectedDetection, setSelectedDetection] = useState<ApiDetection | null>(null)
  const [viewerIndex, setViewerIndex]             = useState<number | null>(null)

  // resolve dialog state
  const [resolving, setResolving]           = useState(false)
  const [newDetectionCount, setNewDetectionCount] = useState("0")
  const [resolveError, setResolveError]     = useState<string | null>(null)

  // route search: only the clusters along the searched route
  const [routeRes, setRouteRes] = useState<RouteSearchResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Independent: a failing detection list must not hide the clusters.
      const [detRes, clusterSettled] = await Promise.allSettled([
        fetchAllDetections({ review_status: CLUSTERED_STATUSES }, 2000),
        fetchClusters({ type: typeFilter !== "all" ? typeFilter : undefined }),
      ])
      if (detRes.status === "fulfilled") {
        setDetections(detRes.value.items.filter((d) => d.latitude != null && d.longitude != null))
        setExtraDetections({})
      }
      if (clusterSettled.status === "rejected") throw clusterSettled.reason
      const clusterRes = clusterSettled.value
      setClusterData(clusterRes)
      // Cluster ids are positions in the answer, not stable: keep the selection
      // on the new cluster that shares the most members with the old one.
      setSelectedCluster((prev) => {
        if (!prev) return null
        const old = new Set(prev.detection_ids)
        let best: ClusterOut | null = null, bestN = 0
        for (const c of clusterRes.clusters) {
          const n = c.detection_ids.filter((id) => old.has(id)).length
          if (n > bestN) { best = c; bestN = n }
        }
        return best
      })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  const byId = useMemo(() => {
    const m = new Map(detections.map((d) => [d.id, d]))
    for (const d of Object.values(extraDetections)) if (!m.has(d.id)) m.set(d.id, d)
    return m
  }, [detections, extraDetections])

  const types = useMemo(() => [...new Set(detections.map((d) => d.type))], [detections])

  const mainRoute = routeRes?.routes[0]?.geometry ?? null
  const alternatives = useMemo(() => routeRes?.routes.slice(1).map((r) => r.geometry) ?? [], [routeRes])
  // A cluster is "along the route" when its centre or any of its detections
  // lies within the corridor (Settings → Mobile app → route corridor).
  const viewData = useMemo<ClusteredDetectionsOut | null>(() => {
    if (!clusterData || !mainRoute) return clusterData
    const corridor = routeRes!.corridorM
    const keep = new Set(
      [...filterAlongRoute(clusterData.clusters, mainRoute, corridor, (c) => [c.centroid_lat, c.centroid_lon] as LatLon),
       ...clusterData.clusters.filter((c) =>
         filterAlongRoute(c.detection_coords ?? [], mainRoute, corridor, (p) => p as LatLon).length > 0)]
        .map((c) => c.cluster_id))
    const clusters = clusterData.clusters.filter((c) => keep.has(c.cluster_id))
    return {
      ...clusterData,
      clusters,
      total_clusters: clusters.length,
      active_clusters: clusters.filter((c) => !c.is_resolved).length,
      resolved_clusters: clusters.filter((c) => c.is_resolved).length,
      total_detections: clusters.reduce((n, c) => n + c.count, 0),
    }
  }, [clusterData, mainRoute, routeRes])

  const infos = useMemo(() => {
    const m = new Map<number, ClusterInfo>()
    for (const c of viewData?.clusters ?? []) m.set(c.cluster_id, clusterInfo(c, byId))
    return m
  }, [viewData, byId])

  const clusterTitles = useMemo(() => {
    const out: Record<number, string> = {}
    for (const c of viewData?.clusters ?? []) {
      const info = infos.get(c.cluster_id)
      const parts = [clusterTitle(c, info, t)]
      if (info?.dominantType) parts.push(tl(`pmap.type.${info.dominantType}`, info.dominantType.replace(/_/g, " ")) + (info.types.length > 1 ? " +" : ""))
      if (info?.place) parts.push(info.place)
      out[c.cluster_id] = parts.join(" · ")
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewData, infos, t])

  const selectedInfo = useMemo(
    () => (selectedCluster ? infos.get(selectedCluster.cluster_id) ?? clusterInfo(selectedCluster, byId) : null),
    [selectedCluster, infos, byId])
  const members = useMemo(() => selectedInfo?.members ?? [], [selectedInfo])

  // Fetch the members missing from the bulk list (e.g. beyond its first 2000).
  const missingKey = selectedInfo?.missing.slice(0, 60).join(",") ?? ""
  const fetchedRef = useRef(new Set<string>())
  useEffect(() => {
    const ids = missingKey ? missingKey.split(",").filter((id) => !fetchedRef.current.has(id)) : []
    if (!ids.length) return
    ids.forEach((id) => fetchedRef.current.add(id))
    let cancelled = false
    setMembersLoading(true)
    Promise.allSettled(ids.map((id) => getDetection(id))).then((res) => {
      if (cancelled) return
      const add: Record<string, ApiDetection> = {}
      for (const r of res) if (r.status === "fulfilled") add[r.value.id] = r.value as unknown as ApiDetection
      setExtraDetections((prev) => ({ ...prev, ...add }))
    }).finally(() => { if (!cancelled) setMembersLoading(false) })
    return () => { cancelled = true }
  }, [missingKey])

  const routeByType = useMemo(() => {
    if (!routeRes || !viewData) return []
    const acc: Record<string, number> = {}
    for (const c of viewData.clusters) for (const id of c.detection_ids) {
      const ty = byId.get(id)?.type ?? "other"
      acc[ty] = (acc[ty] ?? 0) + 1
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [routeRes, viewData, byId])

  const handleClusterClick = useCallback((c: ClusterOut) => {
    setSelectedCluster(c)
    setSelectedDetection(null)
    setViewerIndex(null)
    setResolveError(null)
    setNewDetectionCount("0")
  }, [])
  const resetSelection = useCallback(() => {
    setSelectedCluster(null)
    setSelectedDetection(null)
    setViewerIndex(null)
  }, [])

  const handleResolve = async () => {
    if (!selectedCluster) return
    setResolving(true)
    setResolveError(null)
    try {
      const count = parseInt(newDetectionCount, 10) || 0
      await resolveCluster(selectedCluster.detection_ids, count, "operator")
      await load()
      setSelectedDetection(null)
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : t("pmap.map.resolveFailed"))
    } finally {
      setResolving(false)
    }
  }

  const applyRoute = (r: RouteSearchResult) => {
    setRouteRes(r)
    resetSelection()
  }
  const routeLabels = useMemo(() => ({
    start: routeRes?.from.label ?? t("hist.route.from"),
    end: routeRes?.to.label ?? t("hist.route.to"),
  }), [routeRes, t])

  // Image viewer over the members of the open cluster (← / → walk through them).
  const DL = useDetLabels()
  const viewerItems = useMemo<ViewerItem[]>(() => members.map((d, i) => ({
    id: d.id,
    title: `#${i + 1} · ${DL.fullLabel(d)}`,
    subtitle: [DL.place(d), DL.fmtDate(detTime(d)), `${t("pmap.detMap.confidence")} ${Math.round(d.confidence * 100)}%`].join(" · "),
    frame: resolveMinioUrl(d.image_url),
    crop: resolveMinioUrl(d.crop_url),
    bbox: d.image_url ? bboxOf(d) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [members, t])
  const openImage = useCallback((d: ApiDetection) => {
    const i = members.findIndex((m) => m.id === d.id)
    if (i >= 0) setViewerIndex(i)
  }, [members])

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64 h-screen flex flex-col">
        <Topbar />
        <RequirePermission module="map">

        {/* Header */}
        <div className="px-4 pt-6 pb-3 sm:px-6 lg:px-8">
          <PageHeader
            title={t("pmap.map.title")}
            description={t("pmap.map.subtitle")}
            actions={
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 gap-2">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {t("pmap.map.refresh")}
              </Button>
            }
          />

          {/* Filters + stats */}
          <div className="relative z-40 -mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); resetSelection() }}>
              <SelectTrigger size="sm" className="h-8 w-40 text-xs"><SelectValue placeholder={t("pmap.map.allTypes")} /></SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">{t("pmap.map.allTypes")}</SelectItem>
                {types.map((ty) => (
                  <SelectItem key={ty} value={ty} className="capitalize">{tl(`pmap.type.${ty}`, ty.replace(/_/g, " "))}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {viewData && (
              <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t("pmap.map.nClusters", { count: viewData.total_clusters })}</span>
                <Pill tone="orange">{t("pmap.map.nActive", { count: viewData.active_clusters })}</Pill>
                <Pill tone="green">{t("pmap.map.nResolved", { count: viewData.resolved_clusters })}</Pill>
                <span className="text-muted-foreground/40">·</span>
                <span>{t("pmap.map.nDetections", { count: viewData.total_detections })}</span>
                <Pill tone="slate" dot={false}>{t("pmap.map.radius", { radius: viewData.radius_m })}</Pill>
              </div>
            )}
            <RouteSearchBar
              idPrefix="map-route"
              className="w-full border-t border-border pt-2"
              active={!!routeRes}
              onResult={applyRoute}
              onClear={() => { setRouteRes(null); resetSelection() }}
            />
            {routeRes && viewData && (
              <div className="flex w-full flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {t("rt.alongSummary", {
                    n: viewData.total_clusters, det: viewData.total_detections,
                    km: ((routeRes.routes[0]?.distance_m ?? 0) / 1000).toFixed(1),
                  })}
                </span>
                {routeByType.map(([ty, n]) => (
                  <Pill key={ty} tone="slate" dot={false} className="capitalize">{tl(`pmap.type.${ty}`, ty.replace(/_/g, " "))} · {n}</Pill>
                ))}
                <span className="text-muted-foreground">{t("rt.corridor", { m: routeRes.corridorM })}</span>
              </div>
            )}
          </div>
        </div>

        {/* Map + panel */}
        <div className="flex-1 px-4 pb-4 sm:px-6 lg:px-8 flex gap-3 min-h-0">

          {/* Map — `isolate` keeps Leaflet's pane z-indexes inside it (dialogs stay on top). */}
          <div className="isolate flex-1 relative rounded-xl overflow-hidden border border-border shadow-sm min-h-0">
            {!loading && viewData?.total_clusters === 0 && (
              <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-background/40 pointer-events-none">
                <MapPin className="h-12 w-12 text-muted-foreground/40 mb-2" />
                <p className="rounded-full bg-background/90 px-3 py-1 text-sm text-muted-foreground shadow">
                  {routeRes ? t("rt.noneAlong") : t("pmap.map.empty")}
                </p>
              </div>
            )}

            <DetectionMap
              clusters={viewData?.clusters ?? []}
              route={mainRoute}
              alternatives={alternatives}
              routeLabels={routeLabels}
              radiusM={viewData?.radius_m}
              onClusterClick={handleClusterClick}
              selectedCluster={selectedCluster}
              expandedDetections={members}
              onDetectionClick={setSelectedDetection}
              selectedDetectionId={selectedDetection?.id ?? null}
              onMapClick={resetSelection}
              clusterTitles={clusterTitles}
            />

            {selectedCluster && (
              <div className="absolute right-3 top-3 z-[1000] flex items-center gap-2">
                {membersLoading && (
                  <span className="flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs text-muted-foreground shadow">
                    <Loader2 className="h-3 w-3 animate-spin" />{t("pmap.map.loadingMembers")}
                  </span>
                )}
                <Button size="sm" variant="secondary" className="h-8 gap-1 shadow" onClick={resetSelection}>
                  <ChevronLeft className="h-4 w-4" />{t("pmap.map.backAll")}
                </Button>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-card/95 backdrop-blur px-2.5 py-2 text-xs space-y-1 shadow-sm">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{t("pmap.map.legendClusters")}</p>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-orange-500" /><span>{t("pmap.map.active")}</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-indigo-500" /><span>{t("pmap.map.selected")}</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-green-500" /><span>{t("pmap.map.resolved")}</span></div>
              <div className="border-t border-border mt-1 pt-1 space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{t("pmap.map.legendDetections")}</p>
                {types.map((ty) => (
                  <div key={ty} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: DETECTION_TYPE_COLORS[ty] ?? DETECTION_TYPE_COLORS.default }} />
                    <span className="capitalize">{tl(`pmap.type.${ty}`, ty.replace(/_/g, " "))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side panel */}
          {selectedDetection ? (
            <DetectionDetailPanel
              detection={selectedDetection}
              number={members.findIndex((m) => m.id === selectedDetection.id) + 1}
              onOpenImage={openImage}
              onClose={() => setSelectedDetection(null)}
            />
          ) : selectedCluster && selectedInfo ? (
            <ClusterDetailPanel
              cluster={selectedCluster}
              info={selectedInfo}
              title={clusterTitle(selectedCluster, selectedInfo, t)}
              membersLoading={membersLoading}
              newDetectionCount={newDetectionCount}
              onNewDetectionCountChange={setNewDetectionCount}
              resolving={resolving}
              resolveError={resolveError}
              onResolve={handleResolve}
              canResolve={can("detections", "edit")}
              onDetectionClick={setSelectedDetection}
              onOpenImage={openImage}
              onBack={resetSelection}
            />
          ) : (
            <ClusterListPanel
              clusterData={viewData}
              infos={infos}
              onClusterClick={handleClusterClick}
            />
          )}
        </div>
        <DetectionImageViewer
          items={viewerItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
        </RequirePermission>
      </main>
    </div>
  )
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function TypeBreakdown({ types, className }: { types: [string, number][]; className?: string }) {
  const L = useM6Labels()
  if (!types.length) return null
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {types.map(([ty, n]) => (
        <span key={ty} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: detectionTypeColor(ty) }} />
          {L.typeLabel(ty)} · {n}
        </span>
      ))}
    </div>
  )
}

function NumberDot({ n, type, className }: { n: number; type: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-background", className)}
      style={{ background: detectionTypeColor(type) }}>
      {n}
    </span>
  )
}

function Thumb({ d, onOpen, className }: { d: ApiDetection; onOpen: (d: ApiDetection) => void; className?: string }) {
  const t = useT()
  const src = resolveMinioUrl(d.crop_url) ?? resolveMinioUrl(d.image_url)
  if (!src) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", className)} title={t("pmap.map.noImage")}>
        <ImageIcon className="h-4 w-4" />
      </span>
    )
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(d) }}
      title={t("pmap.map.openImage")} aria-label={t("pmap.map.openImage")}
      className={cn("group relative shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
        <ZoomIn className="h-4 w-4" />
      </span>
    </button>
  )
}

// ─── Cluster list panel ───────────────────────────────────────────────────────

function ClusterListPanel({
  clusterData,
  infos,
  onClusterClick,
}: {
  clusterData: ClusteredDetectionsOut | null
  infos: Map<number, ClusterInfo>
  onClusterClick: (c: ClusterOut) => void
}) {
  const L = useM6Labels()
  const { t } = L
  return (
    <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-2 overflow-y-auto">
      {clusterData && (
        <div className="shrink-0 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
          <p className="mb-1.5 text-sm font-semibold">{t("pmap.map.summary")}</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>{t("pmap.map.totalClusters")}</span><span className="font-medium text-foreground">{clusterData.total_clusters}</span></div>
            <div className="flex justify-between"><span>{t("pmap.map.active")}</span><span className="font-medium text-orange-500">{clusterData.active_clusters}</span></div>
            <div className="flex justify-between"><span>{t("pmap.map.resolved")}</span><span className="font-medium text-green-600">{clusterData.resolved_clusters}</span></div>
            <div className="flex justify-between"><span>{t("pmap.map.detections")}</span><span className="font-medium text-foreground">{clusterData.total_detections}</span></div>
            <div className="flex justify-between"><span>{t("pmap.map.clusterRadius")}</span><span className="font-medium text-foreground">{clusterData.radius_m} m</span></div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground px-1">{t("pmap.map.clickHint")}</p>

      <div className="space-y-1.5">
        {clusterData?.clusters.map((c) => {
          const info = infos.get(c.cluster_id)
          const type = info?.dominantType
          return (
            <button
              key={c.cluster_id}
              onClick={() => onClusterClick(c)}
              className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors px-3 py-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {type ? <TypeTile type={type} size="sm" /> : <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{clusterTitle(c, info, t)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {type ? (info!.types.length > 1 ? `${L.typeLabel(type)} · ${t("pmap.map.mixed")}` : L.typeLabel(type)) : t("pmap.cluster.title", { id: c.cluster_id + 1 })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.is_resolved
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    : <span className="h-2.5 w-2.5 rounded-full bg-orange-500" title={t("pmap.map.active")} />}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{c.count}</Badge>
                </div>
              </div>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{info?.place ?? `${c.centroid_lat.toFixed(5)}, ${c.centroid_lon.toFixed(5)}`}</span>
              </p>
              {info && info.types.length > 1 && <TypeBreakdown types={info.types} />}
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                {info?.lastDetected && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("pmap.map.lastDetected", { time: L.fmtShort(info.lastDetected) })}</span>
                )}
                {c.resolved_count > 0 && !c.is_resolved && (
                  <span className="text-green-600">{t("pmap.map.partResolved", { resolved: c.resolved_count, count: c.count })}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Cluster detail panel ─────────────────────────────────────────────────────

function ClusterDetailPanel({
  cluster,
  info,
  title,
  membersLoading,
  newDetectionCount,
  onNewDetectionCountChange,
  resolving,
  resolveError,
  onResolve,
  canResolve,
  onDetectionClick,
  onOpenImage,
  onBack,
}: {
  cluster:                   ClusterOut
  info:                      ClusterInfo
  title:                     string
  membersLoading:            boolean
  newDetectionCount:         string
  onNewDetectionCountChange: (v: string) => void
  resolving:                 boolean
  resolveError:              string | null
  onResolve:                 () => void
  canResolve:                boolean
  onDetectionClick:          (d: ApiDetection) => void
  onOpenImage:               (d: ApiDetection) => void
  onBack:                    () => void
}) {
  const DL = useDetLabels()
  const { t } = DL
  const count = parseInt(newDetectionCount, 10) || 0
  const willResolve = count < cluster.count
  const numberOf = new Map(info.members.map((d, i) => [d.id, i + 1]))
  const sections = info.types.map(([ty]) => ({ type: ty, items: info.members.filter((d) => d.type === ty) }))
  const stillMissing = info.missing.length

  return (
    <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-2 overflow-y-auto">
      <Button variant="ghost" size="sm" className="h-8 gap-1 self-start" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> {t("pmap.map.backAll")}
      </Button>

      {/* Cluster identity */}
      <div className="shrink-0 space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {info.dominantType ? <TypeTile type={info.dominantType} /> : <MapPin className="h-5 w-5 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="truncate font-semibold text-sm">{title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {info.dominantType ? (info.types.length > 1 ? `${DL.typeLabel(info.dominantType)} · ${t("pmap.map.mixed")}` : DL.typeLabel(info.dominantType)) : ""}
                {info.hazardCodes.length > 0 && ` · ${t("pmap.cluster.title", { id: cluster.cluster_id + 1 })}`}
              </p>
            </div>
          </div>
          <Pill tone={cluster.is_resolved ? "green" : "orange"}>
            {cluster.is_resolved ? t("pmap.map.resolved") : t("pmap.map.active")}
          </Pill>
        </div>
        {info.place && <p className="flex items-start gap-1 text-xs"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />{info.place}</p>}
        <p className="text-xs text-muted-foreground font-mono">
          {cluster.centroid_lat.toFixed(6)}, {cluster.centroid_lon.toFixed(6)}
        </p>
        <TypeBreakdown types={info.types} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t(cluster.count === 1 ? "pmap.cluster.detectionOne" : "pmap.cluster.detectionMany", { count: cluster.count })}</span>
          {cluster.resolved_count > 0 && <span>{t("pmap.map.nResolved", { count: cluster.resolved_count })}</span>}
          {info.lastDetected && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("pmap.map.lastDetected", { time: DL.fmtShort(info.lastDetected) })}</span>}
        </div>
      </div>

      {/* Resolve action — only for active clusters */}
      {!cluster.is_resolved && canResolve && (
        <details className="shrink-0 rounded-xl border border-border bg-card p-3 shadow-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-foreground">{t("pmap.map.markResolved")}</summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("pmap.map.resolveHelp", { count: cluster.count })}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">{t("pmap.map.newCount")}</Label>
              <Input
                type="number"
                min={0}
                value={newDetectionCount}
                onChange={(e) => onNewDetectionCountChange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {willResolve ? (
              <p className="text-xs text-green-600">
                ✓ {count === 0 ? t("pmap.map.hazardCleared") : t("pmap.map.improvement", { count, orig: cluster.count })} {t("pmap.map.willResolve", { count: cluster.count })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("pmap.map.persists", { count, orig: cluster.count })}
              </p>
            )}
            {resolveError && <p className="text-xs text-destructive">{resolveError}</p>}
            <Button
              size="sm"
              className="h-8 w-full"
              disabled={resolving || !willResolve}
              onClick={onResolve}
            >
              {resolving ? t("pmap.map.resolving") : t("pmap.map.confirmResolution")}
            </Button>
          </div>
        </details>
      )}

      {/* Detections, by type */}
      <div className="px-1">
        <p className="text-xs font-medium text-foreground">{t("pmap.map.inCluster")}</p>
        <p className="text-[11px] text-muted-foreground">{t("pmap.map.splitHint")}</p>
      </div>
      {membersLoading && info.members.length === 0 && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("pmap.map.loadingMembers")}</p>
      )}
      {sections.map(({ type, items }) => (
        <section key={type} className="space-y-1.5">
          <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md bg-background/95 px-1 py-1 backdrop-blur">
            <TypeTile type={type} size="sm" />
            <span className="text-sm font-medium">{DL.typeLabel(type)}</span>
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">{items.length}</Badge>
          </div>
          {items.map((det) => (
            <div
              key={det.id}
              role="button"
              tabIndex={0}
              onClick={() => onDetectionClick(det)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetectionClick(det) } }}
              className="flex w-full cursor-pointer gap-2.5 rounded-lg border border-border bg-card px-2 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Thumb d={det} onOpen={onOpenImage} className="h-16 w-16" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <NumberDot n={numberOf.get(det.id)!} type={det.type} />
                  <span className="truncate text-sm font-medium">{DL.subLabel(det) || DL.typeLabel(det.type)}</span>
                </div>
                {DL.vehicleClass(det) && <p className="text-[11px] text-muted-foreground">{DL.vehicleClass(det)}</p>}
                <p className="truncate text-xs text-muted-foreground" title={DL.place(det)}>{DL.place(det)}</p>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{t("pmap.detMap.confidence")} <b className="text-foreground">{Math.round(det.confidence * 100)}%</b></span>
                  <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{DL.fmtShort(detTime(det))}</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
      {!membersLoading && stillMissing > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">{t("pmap.map.missingMembers", { n: stillMissing })}</p>
      )}
    </div>
  )
}

// ─── Detection detail panel ───────────────────────────────────────────────────

function DetectionDetailPanel({ detection: d, number, onOpenImage, onClose }: {
  detection: ApiDetection
  /** Its marker number in the open cluster (0 = not in it). */
  number: number
  onOpenImage: (d: ApiDetection) => void
  onClose: () => void
}) {
  const DL = useDetLabels()
  const { t } = DL
  const frame = resolveMinioUrl(d.image_url)
  const crop = resolveMinioUrl(d.crop_url)
  const canOpen = number > 0
  return (
    <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-2 overflow-y-auto">
      <Button variant="ghost" size="sm" className="h-8 gap-1 self-start" onClick={onClose}>
        <ChevronLeft className="h-4 w-4" /> {t("pmap.map.backToCluster")}
      </Button>
      <div className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {canOpen ? <NumberDot n={number} type={d.type} className="mt-0.5" /> : <TypeTile type={d.type} size="sm" />}
              <div className="min-w-0">
                <p className="font-semibold">{DL.typeLabel(d.type)}{d.subtype && <span className="font-normal"> / {DL.subLabel(d)}</span>}</p>
                {DL.vehicleClass(d) && <p className="text-xs text-muted-foreground">{DL.vehicleClass(d)}</p>}
                <p className="text-xs text-muted-foreground">
                  {t("pmap.map.frame", { frame: d.frame_number })}
                  {d.hazard_code && <> · {t("pmap.map.hazard", { code: d.hazard_code })}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Pill tone={STATUS_TONE[d.review_status] ?? "slate"}>{DL.statusLabel(d.review_status)}</Pill>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t("common.close")} onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {frame || crop ? (
            <button type="button" disabled={!canOpen} onClick={() => onOpenImage(d)}
              title={t("pmap.map.openImage")} aria-label={t("pmap.map.openImage")}
              className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-muted disabled:cursor-default">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(frame ?? crop)!} alt="" className="h-full w-full object-cover" />
              {canOpen && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                  <ZoomIn className="h-6 w-6" />
                </span>
              )}
            </button>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          <div className="flex items-center gap-3">
            {frame && crop && (
              <button type="button" disabled={!canOpen} onClick={() => onOpenImage(d)} title={t("pmap.map.openImage")}
                className="relative h-16 w-20 shrink-0 overflow-hidden rounded bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crop} alt="" className="h-full w-full object-cover" />
              </button>
            )}
            <div className="text-xs space-y-1">
              <p><span className="text-muted-foreground">{t("pmap.map.confidence")}</span> <b>{Math.round(d.confidence * 100)}%</b></p>
              {d.speed_kmh != null && <p><span className="text-muted-foreground">{t("pmap.map.speed")}</span> <b>{d.speed_kmh} km/h</b></p>}
              <p><span className="text-muted-foreground">{t("pmap.map.recorded")}</span> <b>{DL.fmtDate(detTime(d))}</b></p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /><span className="font-medium">{t("pmap.map.location")}</span>
            </div>
            {placeLabel(d) && <p className="font-medium">{placeLabel(d)}</p>}
            {d.latitude != null && d.longitude != null && (
              <p className="text-muted-foreground font-mono">{d.latitude.toFixed(6)}, {d.longitude.toFixed(6)}</p>
            )}
          </div>

          {d.resolved_at && (
            <div className="text-xs">
              <p className="text-muted-foreground">{t("pmap.map.resolvedAt")}</p>
              <p className="font-medium">{DL.fmtDate(d.resolved_at)}</p>
            </div>
          )}

          {d.review_note && (
            <div className="text-xs">
              <p className="text-muted-foreground">{t("pmap.map.note")}</p>
              <p className="font-medium">{d.review_note}</p>
            </div>
          )}
      </div>
    </div>
  )
}
