"use client"

/**
 * Hazard Track (Module 6, RRAP-06-001…06-004, 06-009…06-011, 06-019).
 *
 * Hazards are detected and grouped automatically: every accepted detection
 * joins the nearest cluster (hazard) of its type, or opens one — no path to
 * draw. The page is an explorer with a clear hierarchy
 *
 *   Clusters (list + overview map) › Cluster (detail pane) › Detections of
 *   the cluster › Evidence (viewer with bbox, clip, AI reasoning, prev/next)
 *
 * plus the flat "All detections" list and the recurring spots, as separate
 * views. Places are shown as reverse-geocoded street · quartier, town;
 * coordinates are secondary. Deep links: ?tab=active|resolved|detections|
 * recurring, ?job_id=<job> (All detections of a job), ?hazard=<id>,
 * ?detection=<id>. Resolve / Reopen need detections:edit; the rejected-data
 * export needs datasets:view. Components: components/hazard-track/*.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft, CheckCircle2, Download, FileJson, FileSpreadsheet, Layers, List, Loader2, MapPinned, MousePointerClick, Repeat,
  TriangleAlert,
} from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { useM6Labels } from "@/components/m6-shared"
import { useNow } from "@/components/hazard-lifecycle"
import { RecurringSpotsView } from "@/components/hazard-recurring-spots"
import { PageHeader } from "@/components/page-header"
import { StatCard, type Tone } from "@/components/stat-card"
import { DataCard } from "@/components/data-toolbar"
import { ClusterList, EMPTY_CLUSTER_FILTERS, placeQuery, type ClusterFilters, type ClusterStatus } from "@/components/hazard-track/cluster-list"
import { ClusterMap } from "@/components/hazard-track/cluster-map"
import { ClusterDetail } from "@/components/hazard-track/cluster-detail"
import { EvidenceViewer } from "@/components/hazard-track/evidence-viewer"
import { AllDetectionsView } from "@/components/hazard-track/all-detections"
import { AddressBackfillBanner } from "@/components/hazard-track/address-backfill"
import { useDebounced, useIsNarrow } from "@/components/hazard-track/shared"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/auth-api"
import {
  downloadRejectedExport, getHazardSummary, hazardMembers, listDetections, listHazardPlaces, listHazards, listRecurringSpots,
  type Hazard, type HazardDetail, type HazardPlace,
} from "@/lib/module6-api"

type Tab = "active" | "resolved" | "detections" | "recurring"
const TABS: Tab[] = ["active", "resolved", "detections", "recurring"]
const asTab = (v: string | null): Tab | null => (v && (TABS as string[]).includes(v) ? (v as Tab) : null)
const MAP_LIMIT = 200

export default function HazardTrackPage() {
  return (
    <Suspense fallback={null}>
      <HazardTrack />
    </Suspense>
  )
}

function HazardTrack() {
  const L = useM6Labels()
  const { t } = L
  const { can } = useAuth()
  const canExport = can("datasets", "view")
  const now = useNow()
  const narrow = useIsNarrow()

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const urlJobId = searchParams.get("job_id")
  const urlTab = asTab(searchParams.get("tab"))
  const urlHazard = searchParams.get("hazard")
  const urlDetection = searchParams.get("detection")

  const [tab, setTab] = useState<Tab>(urlJobId ? "detections" : urlTab ?? "active")
  const [jobId, setJobId] = useState<string | null>(urlJobId)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const [counts, setCounts] = useState<Record<Tab, number | null>>({ active: null, resolved: null, detections: null, recurring: null })
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null)

  // Cluster explorer state
  const clusterStatus: ClusterStatus = tab === "resolved" ? "resolved" : "active"
  const [filters, setFilters] = useState<ClusterFilters>(EMPTY_CLUSTER_FILTERS)
  const debounced = useDebounced(filters)
  const [sort, setSort] = useState("-last_detected_at")
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [items, setItems] = useState<Hazard[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapItems, setMapItems] = useState<Hazard[]>([])
  const [mapTotal, setMapTotal] = useState(0)
  const [places, setPlaces] = useState<HazardPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(urlHazard)
  const [detail, setDetail] = useState<HazardDetail | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Evidence viewer
  const [detectionId, setDetectionId] = useState<string | null>(urlDetection)
  const [siblings, setSiblings] = useState<string[] | null>(null)

  // ── URL sync ──────────────────────────────────────────────────────────────
  const replaceParams = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(patch)) { if (v == null) p.delete(k); else p.set(k, v) }
    const q = p.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [pathname, router])

  useEffect(() => {
    if (urlJobId === jobId) return
    setJobId(urlJobId)
    if (urlJobId) setTab("detections")
  }, [urlJobId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (urlJobId || !urlTab || urlTab === tab) return
    setTab(urlTab)
  }, [urlTab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (urlHazard !== selectedId) setSelectedId(urlHazard) }, [urlHazard]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (urlDetection !== detectionId) setDetectionId(urlDetection) }, [urlDetection]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (next: Tab) => {
    setTab(next)
    setPage(1)
    if (next === "detections" || next === "recurring") setSelectedId(null)
    replaceParams({ tab: next === "active" ? null : next, ...(next === "detections" || next === "recurring" ? { hazard: null } : {}) })
  }
  const clearJob = () => { setJobId(null); replaceParams({ job_id: null }) }
  const selectCluster = useCallback((id: string | null) => {
    setSelectedId(id)
    if (!id) setDetail(null)
    replaceParams({ hazard: id, detection: null })
  }, [replaceParams])
  const openCluster = (id: string) => {
    setDetectionId(null)
    if (tab !== "active" && tab !== "resolved") setTab("active")
    setSelectedId(id)
    replaceParams({ tab: tab === "resolved" ? "resolved" : null, hazard: id, detection: null })
  }
  const openDetection = useCallback((id: string, ids: string[] | null) => {
    setDetectionId(id)
    setSiblings(ids)
    replaceParams({ detection: id })
  }, [replaceParams])
  const closeDetection = () => { setDetectionId(null); replaceParams({ detection: null }) }

  // Siblings for a deep-linked detection inside the selected cluster.
  const memberIds = useMemo(() => (detail ? hazardMembers(detail).map((m) => m.id) : null), [detail])
  useEffect(() => {
    if (detectionId && !siblings && memberIds?.includes(detectionId)) setSiblings(memberIds)
  }, [detectionId, memberIds, siblings])

  // ── data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([
      getHazardSummary(),
      listHazards({ status: "active", limit: 1 }),
      listHazards({ status: "resolved", limit: 1 }),
      listDetections({ limit: 1 }),
      listRecurringSpots(),
    ]).then(([s, a, r, d, rs]) => {
      const byStatus = s.status === "fulfilled" ? s.value.by_status ?? {} : {}
      setCounts({
        active: a.status === "fulfilled" ? a.value.total : byStatus.active ?? null,
        resolved: r.status === "fulfilled" ? r.value.total : byStatus.resolved ?? null,
        detections: d.status === "fulfilled" ? d.value.total : null,
        recurring: rs.status === "fulfilled" ? rs.value.total : null,
      })
    })
  }, [reload])

  const query = useMemo(() => {
    const f = debounced
    return {
      status: clusterStatus,
      type: f.type,
      ...placeQuery(f.place),
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
      search: f.search.trim() || undefined,
      resolution_source: clusterStatus === "resolved" ? f.resolution : undefined,
      recurring_spot: f.recurring === "yes" ? true : f.recurring === "no" ? false : undefined,
    }
  }, [debounced, clusterStatus])
  const isClusters = tab === "active" || tab === "resolved"

  useEffect(() => {
    if (!isClusters) return
    let alive = true
    setLoading(true)
    setError(null)
    listHazards({ ...query, sort, skip: (page - 1) * pageSize, limit: pageSize })
      .then((r) => { if (alive) { setItems(r.items); setTotal(r.total) } })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setItems([]); setTotal(0) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [isClusters, query, sort, page, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isClusters) return
    let alive = true
    listHazards({ ...query, sort: "-last_detected_at", limit: MAP_LIMIT })
      .then((r) => { if (alive) { setMapItems(r.items); setMapTotal(r.total) } })
      .catch(() => { if (alive) { setMapItems([]); setMapTotal(0) } })
    return () => { alive = false }
  }, [isClusters, query, reload])

  useEffect(() => {
    if (!isClusters) return
    listHazardPlaces({ status: clusterStatus, type: debounced.type }).then(setPlaces).catch(() => setPlaces([]))
  }, [isClusters, clusterStatus, debounced.type, reload])

  const doExport = async (format: "csv" | "json") => {
    setExporting(format)
    try {
      await downloadRejectedExport(format, { type: filters.type, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined })
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    } finally {
      setExporting(null)
    }
  }

  const cards: { key: Tab; label: string; Icon: typeof Layers; tone: Tone }[] = [
    { key: "active", label: t("ht.kpi.active"), Icon: TriangleAlert, tone: "red" },
    { key: "resolved", label: t("ht.kpi.resolved"), Icon: CheckCircle2, tone: "green" },
    { key: "detections", label: t("ht.kpi.detections"), Icon: Layers, tone: "blue" },
    { key: "recurring", label: t("hzl.tab.recurring"), Icon: Repeat, tone: "purple" },
  ]
  const views: { key: "clusters" | "detections" | "recurring"; label: string; Icon: typeof Layers }[] = [
    { key: "clusters", label: t("ht.view.clusters"), Icon: MapPinned },
    { key: "detections", label: t("ht.view.detections"), Icon: List },
    { key: "recurring", label: t("ht.view.recurring"), Icon: Repeat },
  ]
  const view = isClusters ? "clusters" : tab
  // The selected cluster as a list item (map framing) — from the list, the map set or the loaded detail.
  const selectedHazard: Hazard | null = !selectedId ? null
    : (detail?.id === selectedId ? detail : null)
      ?? items.find((h) => h.id === selectedId) ?? mapItems.find((h) => h.id === selectedId) ?? null
  // Stable array: a new one on every render would rebuild the map layers on each hover.
  const extraOnMap = selectedHazard && !mapItems.some((h) => h.id === selectedHazard.id) ? selectedHazard : null
  const mapClusters = useMemo(() => (extraOnMap ? [...mapItems, extraOnMap] : mapItems), [mapItems, extraOnMap])
  const showList = !narrow || !selectedId
  const showPane = !narrow || !!selectedId

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="detections">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <PageHeader
              title={t("m6.hz.title")}
              description={t("ht.subtitle")}
              actions={canExport && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9" disabled={!!exporting}>
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {t("m6.hz.export")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="max-w-[16rem] text-xs font-normal text-muted-foreground">{t("m6.hz.exportHint")}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => doExport("csv")}><FileSpreadsheet className="h-4 w-4" />CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => doExport("json")}><FileJson className="h-4 w-4" />JSON</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            />

            {/* KPI strip */}
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {cards.map(({ key, label, Icon, tone }) => (
                <StatCard key={key} icon={Icon} tone={tone} value={counts[key] ?? "—"} label={label}
                  onClick={() => switchTab(key)}
                  className={cn(tab === key && "border-primary/60 ring-1 ring-primary/30")} />
              ))}
            </div>

            <AddressBackfillBanner onDone={refresh} />

            {/* View switch: clusters explorer / flat detections / recurring spots */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm" role="tablist" aria-label={t("ht.view.label")}>
                {views.map(({ key, label, Icon }) => (
                  <button key={key} type="button" role="tab" aria-selected={view === key}
                    onClick={() => switchTab(key === "clusters" ? (tab === "resolved" ? "resolved" : "active") : key)}
                    className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>
              {view === "clusters" && <p className="text-xs text-muted-foreground">{t("ht.view.clustersHint")}</p>}
            </div>

            {view === "recurring" && (
              <DataCard>
                <RecurringSpotsView onOpenHazard={openCluster} reloadKey={reload} />
              </DataCard>
            )}

            {view === "detections" && (
              <DataCard>
                <AllDetectionsView jobId={jobId} onClearJob={clearJob} reloadKey={reload}
                  onOpenDetection={(id, ids) => openDetection(id, ids)} onOpenCluster={openCluster} />
              </DataCard>
            )}

            {view === "clusters" && (
              <div className="grid gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[640px] lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
                {/* Level 1 — Cluster list */}
                {showList && (
                  <DataCard className="flex min-h-0 flex-col">
                    {narrow && (
                      <ClusterMap className="m-3 mb-0 h-56" clusters={mapClusters} selected={null}
                        hoveredId={hoveredId} onHover={setHoveredId} onSelect={selectCluster}
                        capped={mapTotal > mapItems.length ? mapItems.length : null} />
                    )}
                    <ClusterList
                      className="min-h-0 flex-1"
                      status={clusterStatus}
                      onStatus={(s) => switchTab(s)}
                      counts={{ active: counts.active, resolved: counts.resolved }}
                      filters={filters}
                      onFilter={(k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }}
                      onReset={() => { setFilters(EMPTY_CLUSTER_FILTERS); setPage(1) }}
                      places={places}
                      sort={sort}
                      onSort={(s) => { setSort(s); setPage(1) }}
                      items={items}
                      total={total}
                      loading={loading}
                      error={error}
                      page={page}
                      pageSize={pageSize}
                      onPage={setPage}
                      selectedId={selectedId}
                      hoveredId={hoveredId}
                      onSelect={selectCluster}
                      onHover={setHoveredId}
                      now={now}
                    />
                  </DataCard>
                )}

                {/* Level 2 — Overview map + cluster detail */}
                {showPane && (
                  <div className="flex min-h-0 flex-col gap-4">
                    {narrow && selectedId && (
                      <Button variant="outline" size="sm" className="self-start" onClick={() => selectCluster(null)}>
                        <ArrowLeft className="h-4 w-4" />{t("ht.detail.back")}
                      </Button>
                    )}
                    {(!narrow || selectedId) && (
                      <ClusterMap
                        className={cn("shrink-0 transition-[height]", selectedId ? "h-64 lg:h-[38%]" : "h-[420px] lg:h-auto lg:min-h-0 lg:flex-1")}
                        clusters={mapClusters}
                        selected={selectedHazard}
                        members={detail && detail.id === selectedId ? hazardMembers(detail) : undefined}
                        selectedDetectionId={detectionId}
                        hoveredId={hoveredId}
                        onHover={setHoveredId}
                        onSelect={selectCluster}
                        onOpenDetection={(id) => openDetection(id, memberIds)}
                        capped={mapTotal > mapItems.length ? mapItems.length : null}
                      />
                    )}
                    {selectedId ? (
                      <DataCard className="min-h-0 flex-1 overflow-y-auto">
                        <ClusterDetail
                          key={selectedId}
                          id={selectedId}
                          reloadKey={reload}
                          onBack={() => selectCluster(null)}
                          onChanged={refresh}
                          onLoaded={setDetail}
                          onOpenDetection={(id) => openDetection(id, memberIds)}
                          selectedDetectionId={detectionId}
                        />
                      </DataCard>
                    ) : null}
                    {!selectedId && !narrow && items.length > 0 && (
                      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MousePointerClick className="h-3.5 w-3.5" />{t("ht.detail.emptyText")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </RequirePermission>
      </main>

      <EvidenceViewer
        detectionId={detectionId}
        siblings={siblings}
        onNavigate={(id) => openDetection(id, siblings)}
        onClose={closeDetection}
        onOpenCluster={openCluster}
      />
    </div>
  )
}
