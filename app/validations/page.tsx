"use client"

/**
 * Validations (Module 6, RRAP-06-005…06-018): review queue with three tabs —
 * Pending review, Location review, Rejected — server-side filters and
 * pagination, and a side panel with the evidence, location, cluster preview,
 * history and the Accept / Correct / Reject / Reopen actions.
 *
 * Cluster-first review: with "Group by cluster" (default ON, remembered in
 * localStorage) the Pending tab lists one card per hazard with unreviewed
 * detections (Accept / Reject cluster, open the members individually), then
 * the detections that belong to no hazard yet. `?hazard=<id>` focuses the
 * queue on the unreviewed detections of one cluster.
 */
import { useCallback, useEffect, useId, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle, CheckCircle, Clock, Edit2, Eye, Layers, Loader2, MapPin, Plus, RotateCcw,
  Video, XCircle,
} from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VideoPlayer } from "@/components/video-player"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { LocationReview } from "@/components/location-review"
import {
  ConfidenceBar, EvidenceFrame, HistoryTimeline, Info, LocationBadge, SortHead, StatusBadge, Thumb, useM6Labels,
} from "@/components/m6-shared"
import { PageHeader } from "@/components/page-header"
import { SettingsLinkButton } from "@/components/settings-index"
import { StatCard, type Tone } from "@/components/stat-card"
import { StatusBadge as Pill, toneForStatus, type BadgeTone } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/auth-api"
import {
  createRejectionReason, fetchRejectionReasons, resolveMinioUrl, REJECTION_KINDS, type RejectionKind, type RejectionReason,
} from "@/lib/api"
import {
  DETECTION_TYPES, FINAL_STATUSES, SUBTYPES,
  acceptDetection, correctDetection, getDetection, getHazard, getQueue, listRejected, rejectDetection, reopenDetection,
  type DetectionDetail, type Hazard, type M6Detection,
} from "@/lib/module6-api"
import { ClusterDecisionButtons, HazardStatusBadge, MemberCountsLine } from "@/components/cluster-review"
import { ClusterQueue } from "@/components/validations/cluster-queue"
import { AiBadges, AiReasonBadge, VerifierScore } from "@/components/ai-badges"
import { AiDetailsBadges, AiReasoningPanel } from "@/components/ai-reasoning"
import { SignPicker } from "@/components/sign-picker"
import { KIND_BADGE, kindOf } from "@/components/settings/hazards/rejection-reasons"

const PAGE_SIZE = 20
const GROUP_KEY = "rr_validations_group_by_cluster"
type Tab = "pending" | "location" | "rejected"

interface Filters {
  search: string
  type: string
  minConf: string
  dateFrom: string
  dateTo: string
  country: string
  city: string
  reason: string
  source: string
  reviewer: string
  /** all | audit (AI decisions to audit) | auto_accept | auto_reject | review */
  ai: string
}
const EMPTY: Filters = { search: "", type: "all", minConf: "all", dateFrom: "", dateTo: "", country: "", city: "", reason: "all", source: "all", reviewer: "", ai: "all" }

/** Review status → pill colour (M6 statuses not covered by toneForStatus). */
const M6_TONE: Record<string, BadgeTone> = {
  location_pending: "amber", corrected: "blue", resolved: "slate",
}
const m6Tone = (s: string | null | undefined): BadgeTone => (s && M6_TONE[s]) || toneForStatus(s)

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

export default function ValidationsPage() {
  const L = useM6Labels()
  const { t } = L
  const { can } = useAuth()
  const canEdit = can("validations", "edit")

  const [tab, setTab] = useState<Tab>("pending")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [sort, setSort] = useState("-created_at")
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const debounced = useDebounced(filters)
  const [items, setItems] = useState<M6Detection[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [counts, setCounts] = useState<Record<Tab, number | null>>({ pending: null, location: null, rejected: null })
  const [reasons, setReasons] = useState<RejectionReason[]>([])
  const [selected, setSelected] = useState<M6Detection | null>(null)
  const [initialMode, setInitialMode] = useState<Mode>("idle")
  /** Items the panel moves through after a decision (table page or a cluster's members). */
  const [panelList, setPanelList] = useState<M6Detection[]>([])
  const router = useRouter()

  // Cluster-first grouping (remembered per browser).
  const [grouped, setGroupedState] = useState(true)
  useEffect(() => {
    try { const v = localStorage.getItem(GROUP_KEY); if (v != null) setGroupedState(v === "1") } catch { /* storage unavailable */ }
  }, [])
  const setGrouped = (v: boolean) => {
    setGroupedState(v)
    setPage(1)
    try { localStorage.setItem(GROUP_KEY, v ? "1" : "0") } catch { /* storage unavailable */ }
  }
  const [unclustered, setUnclustered] = useState<number | null>(null)

  // ?hazard=<id>: the queue focused on one cluster.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusHz, setFocusHz] = useState<Hazard | null>(null)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("hazard")
    if (id) { setFocusId(id); setTab("pending") }
  }, [])
  const focus = (id: string | null, hz: Hazard | null = null) => {
    setFocusId(id)
    setFocusHz(hz)
    setPage(1)
    if (id) setTab("pending")
    const p = new URLSearchParams(window.location.search)
    if (id) p.set("hazard", id); else p.delete("hazard")
    const q = p.toString()
    router.replace(q ? `/validations?${q}` : "/validations", { scroll: false })
  }
  useEffect(() => {
    if (!focusId) { setFocusHz(null); return }
    let alive = true
    // Candidates are not hazards (404 on /hazards/{id}): keep the queue's copy then.
    getHazard(focusId).then((h) => { if (alive) setFocusHz(h) }).catch(() => { /* candidate cluster */ })
    return () => { alive = false }
  }, [focusId, reload]) // eslint-disable-line react-hooks/exhaustive-deps
  const showClusters = grouped && tab === "pending" && !focusId

  const setF = (k: keyof Filters, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => { fetchRejectionReasons().then(setReasons).catch(() => setReasons([])) }, [])
  const reasonLabel = (code: string | null) => (code ? L.tl(`rej.code.${code}`, reasons.find((r) => r.code === code)?.label ?? code) : "—")

  // Tab counters.
  useEffect(() => {
    Promise.allSettled([
      getQueue({ status: "pending", limit: 1 }),
      getQueue({ status: "location_pending", limit: 1 }),
      listRejected({ limit: 1 }),
    ]).then(([p, l, r]) => setCounts({
      pending: p.status === "fulfilled" ? p.value.total : null,
      location: l.status === "fulfilled" ? l.value.total : null,
      rejected: r.status === "fulfilled" ? r.value.total : null,
    }))
  }, [reload])

  // List.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const f = debounced
    const common = {
      type: f.type,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    }
    const req = tab === "rejected"
      ? listRejected({ ...common, reason_code: f.reason, rejection_source: f.source, reviewer: f.reviewer.trim() || undefined })
      : getQueue({
          ...common,
          status: tab === "pending" ? "pending" : "location_pending",
          hazard_id: focusId ?? undefined,
          clustered: showClusters ? false : undefined,
          min_confidence: f.minConf === "all" ? undefined : Number(f.minConf),
          audit_sample: f.ai === "audit" ? true : undefined,
          ai_decision: f.ai === "all" || f.ai === "audit" ? undefined : f.ai,
          country: f.country.trim() || undefined,
          city: f.city.trim() || undefined,
          search: f.search.trim() || undefined,
          sort,
        })
    req
      .then((r) => { if (alive) { setItems(r.items); setTotal(r.total) } })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setItems([]); setTotal(0) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [tab, page, pageSize, sort, debounced, reload, focusId, showClusters]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (d: M6Detection, mode: Mode = "idle", list: M6Detection[] = items) => {
    setInitialMode(mode)
    setPanelList(list)
    setSelected(d)
  }

  /** After a decision: refresh and move on to the next item of the page (or of the cluster). */
  const afterDecision = (id: string) => {
    const list = panelList.length ? panelList : items
    const idx = list.findIndex((x) => x.id === id)
    const next = idx < 0 ? null : list.slice(idx + 1).find((x) => x.id !== id) ?? null
    setSelected(next)
    setInitialMode("idle")
    refresh()
  }

  const quickAccept = async (d: M6Detection) => {
    try {
      await acceptDetection(d.id, {})
      toast.success(t("m6.toast.accepted"))
      refresh()
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    }
  }

  const tabs: { key: Tab; label: string; Icon: typeof Clock; tone: Tone }[] = [
    { key: "pending", label: t("m6.tab.pending"), Icon: Clock, tone: "orange" },
    { key: "location", label: t("m6.tab.location"), Icon: MapPin, tone: "blue" },
    { key: "rejected", label: t("m6.tab.rejected"), Icon: XCircle, tone: "red" },
  ]

  const isQueue = tab !== "rejected"
  const colCount = tab === "rejected" ? 7 : 8

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="validations">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <PageHeader title={t("pmap.val.title")} description={t("m6.val.subtitle")} actions={<SettingsLinkButton anchor="validation" />} />

            {/* Counters (also act as tab switches) */}
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {tabs.map(({ key, label, Icon, tone }) => (
                <StatCard key={key} icon={Icon} tone={tone} value={counts[key] ?? "—"} label={label}
                  onClick={() => { setTab(key); setPage(1) }}
                  className={cn(tab === key && "border-primary/60 ring-1 ring-primary/30")} />
              ))}
            </div>

            <DataCard>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 pt-3 pb-2">
                <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setPage(1) }}>
                  <TabsList className="h-auto flex-wrap">
                    {tabs.map(({ key, label }) => (
                      <TabsTrigger key={key} value={key} className="gap-2 text-sm">
                        {label}
                        {counts[key] != null && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{counts[key]}</Badge>}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">{t(`m6.tab.${tab}Hint`)}</p>
                {tab === "pending" && !focusId && (
                  <div className="ml-auto flex items-center gap-2" title={t("cr.group.hint")}>
                    <Switch id="v-group" checked={grouped} onCheckedChange={setGrouped} />
                    <Label htmlFor="v-group" className="cursor-pointer text-sm">{t("cr.group.label")}</Label>
                  </div>
                )}
              </div>

              {focusId && isQueue && (
                <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-4 py-3">
                  <Layers className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {t("cr.focus.title", { code: focusHz?.code ?? focusId.slice(0, 8) })}
                      {focusHz && <span className="text-muted-foreground">{L.typeLabel(focusHz.type)}</span>}
                      {focusHz && <HazardStatusBadge status={focusHz.status} className="text-[10px]" />}
                    </p>
                    {focusHz && <MemberCountsLine h={focusHz} />}
                  </div>
                  {focusHz && canEdit && (focusHz.status === "candidate" || focusHz.status === "active") && (
                    <ClusterDecisionButtons hazard={focusHz} onDone={() => { refresh(); setSelected(null) }} />
                  )}
                  {focusHz && focusHz.status !== "candidate" && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/detections?hazard=${focusId}`}>{t("cr.q.openTrack")}</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => focus(null)}>{t("cr.focus.clear")}</Button>
                </div>
              )}

              {showClusters && (
                <ClusterQueue
                  type={debounced.type}
                  search={debounced.search}
                  reloadKey={reload}
                  canEdit={canEdit}
                  onOpenDetection={(d, list) => open(d, "idle", list)}
                  onDecided={() => { refresh(); setSelected(null) }}
                  onUnclustered={setUnclustered}
                  onFocus={(h) => focus(h.id, h)}
                />
              )}

              {/* Filters */}
              <DataToolbar
                search={filters.search}
                onSearch={isQueue ? (v) => setF("search", v) : undefined}
                placeholder={t("m6.filter.searchDetections")}
                actions={
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilters(EMPTY); setPage(1) }}>
                    <RotateCcw className="h-3.5 w-3.5" />{t("m6.filter.reset")}
                  </Button>
                }
              >
                <Select value={filters.type} onValueChange={(v) => setF("type", v)}>
                  <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.type")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("pmap.val.allTypes")}</SelectItem>
                    {DETECTION_TYPES.map((ty) => <SelectItem key={ty} value={ty}>{L.typeLabel(ty)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {isQueue ? (
                  <>
                    <Select value={filters.minConf} onValueChange={(v) => setF("minConf", v)}>
                      <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.minConfidence")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("m6.filter.anyConfidence")}</SelectItem>
                        {["0.3", "0.5", "0.7", "0.9"].map((c) => (
                          <SelectItem key={c} value={c}>{t("m6.filter.confAtLeast", { n: Math.round(Number(c) * 100) })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filters.ai} onValueChange={(v) => setF("ai", v)}>
                      <SelectTrigger className="h-9 w-full sm:w-48" aria-label={t("ai.filter.label")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("ai.filter.any")}</SelectItem>
                        <SelectItem value="audit">{t("ai.filter.audit")}</SelectItem>
                        <SelectItem value="auto_accept">{t("ai.filter.auto_accept")}</SelectItem>
                        <SelectItem value="auto_reject">{t("ai.filter.auto_reject")}</SelectItem>
                        <SelectItem value="review">{t("ai.filter.review")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
                      <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.sort")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-created_at">{t("m6.sort.newest")}</SelectItem>
                        <SelectItem value="created_at">{t("m6.sort.oldest")}</SelectItem>
                        <SelectItem value="-confidence">{t("m6.sort.confDesc")}</SelectItem>
                        <SelectItem value="confidence">{t("m6.sort.confAsc")}</SelectItem>
                        <SelectItem value="-verifier_score">{t("ai.sort.verifierDesc")}</SelectItem>
                        <SelectItem value="-captured_at">{t("m6.sort.captured")}</SelectItem>
                        <SelectItem value="type">{t("m6.sort.type")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-9 w-full sm:w-32" placeholder={t("m6.filter.country")} value={filters.country} onChange={(e) => setF("country", e.target.value)} aria-label={t("m6.filter.country")} />
                    <Input className="h-9 w-full sm:w-32" placeholder={t("m6.filter.city")} value={filters.city} onChange={(e) => setF("city", e.target.value)} aria-label={t("m6.filter.city")} />
                  </>
                ) : (
                  <>
                    <Select value={filters.reason} onValueChange={(v) => setF("reason", v)}>
                      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t("m6.filter.reason")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("m6.filter.anyReason")}</SelectItem>
                        {Array.from(new Map(reasons.map((r) => [r.code, r])).values()).map((r) => (
                          <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filters.source} onValueChange={(v) => setF("source", v)}>
                      <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.source")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("m6.filter.anySource")}</SelectItem>
                        <SelectItem value="human">{t("m6.rej.human")}</SelectItem>
                        <SelectItem value="auto">{t("m6.rej.auto")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="h-9 w-full sm:w-40" placeholder={t("m6.filter.reviewer")} value={filters.reviewer} onChange={(e) => setF("reviewer", e.target.value)} aria-label={t("m6.filter.reviewer")} />
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="v-from" className="shrink-0 text-xs text-muted-foreground">{t("m6.filter.from")}</Label>
                  <Input id="v-from" type="date" className="h-9 w-36" value={filters.dateFrom} onChange={(e) => setF("dateFrom", e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="v-to" className="shrink-0 text-xs text-muted-foreground">{t("m6.filter.to")}</Label>
                  <Input id="v-to" type="date" className="h-9 w-36" value={filters.dateTo} onChange={(e) => setF("dateTo", e.target.value)} />
                </div>
              </DataToolbar>

              {showClusters && (
                <div className="px-4 pt-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    {t("cr.unclustered.title")}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{unclustered ?? total}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground">{t("cr.unclustered.hint")}</p>
                </div>
              )}

              {error && <p className="px-4 pt-3 text-sm text-destructive">{error}</p>}

              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-14 pl-4">{t("pmap.val.thFrame")}</TableHead>
                    {isQueue
                      ? <SortHead label={t("pmap.val.thType")} k="type" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
                      : <TableHead>{t("pmap.val.thType")}</TableHead>}
                    {isQueue
                      ? <SortHead label={t("pmap.val.thConfidence")} k="confidence" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
                      : <TableHead>{t("pmap.val.thConfidence")}</TableHead>}
                    <TableHead className="hidden md:table-cell">{t("pmap.val.thLocation")}</TableHead>
                    {isQueue ? (
                      <>
                        <TableHead className="hidden lg:table-cell">{t("m6.col.cluster")}</TableHead>
                        <SortHead className="hidden xl:table-cell" label={t("m6.col.detectedAt")} k="created_at" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
                      </>
                    ) : (
                      <>
                        <TableHead>{t("m6.col.reason")}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t("m6.col.rejectedBy")}</TableHead>
                      </>
                    )}
                    {isQueue && <TableHead>{t("common.status")}</TableHead>}
                    <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={colCount} className="h-28 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell></TableRow>
                  )}
                  {!loading && items.map((d) => (
                    <TableRow key={d.id} className={cn("h-11 cursor-pointer", selected?.id === d.id && "bg-muted/40")} onClick={() => open(d)}>
                      <TableCell className="py-1.5 pl-4"><Thumb url={d.crop_url ?? d.image_url} className="h-7 w-10" /></TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{L.typeLabel(d.type)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{d.id.slice(0, 8)}</span>
                        </div>
                        {d.subtype && <div className="text-xs text-muted-foreground">{L.subtypeLabel(d.type, d.subtype)}</div>}
                        <AiBadges d={d} className="mt-0.5" />
                        <AiDetailsBadges d={d} hideSubtype className="mt-0.5" />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <ConfidenceBar value={d.confidence} />
                        <VerifierScore value={d.verifier_score} />
                      </TableCell>
                      <TableCell className="hidden py-1.5 md:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[200px] truncate">{d.location_name ?? ([d.city, d.country].filter(Boolean).join(", ") || "—")}</span>
                          <LocationBadge status={d.location_status} />
                        </div>
                      </TableCell>
                      {isQueue ? (
                        <>
                          <TableCell className="hidden py-1.5 lg:table-cell"><ClusterHintText d={d} /></TableCell>
                          <TableCell className="hidden py-1.5 text-xs text-muted-foreground xl:table-cell">{L.fmtShort(d.recorded_at ?? d.captured_at ?? d.created_at)}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="max-w-[180px] truncate">{reasonLabel(d.rejection_code)}</span>
                              {d.rejection_source && (
                                <Badge variant="outline" className="text-[10px]">{t(`m6.rej.${d.rejection_source}`)}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden py-1.5 lg:table-cell">
                            {d.rejection_source === "auto" ? t("m6.hist.system") : (d.reviewed_by ?? "—")}
                            <div className="text-xs text-muted-foreground">{L.fmtShort(d.reviewed_at)}</div>
                          </TableCell>
                        </>
                      )}
                      {isQueue && <TableCell className="py-1.5"><Pill tone={m6Tone(d.review_status)}>{L.statusLabel(d.review_status)}</Pill></TableCell>}
                      <TableCell className="py-1.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title={t("pmap.val.view")} aria-label={t("pmap.val.view")} onClick={() => open(d)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {tab === "pending" && canEdit && d.review_status === "pending" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:bg-success/10"
                                title={t("m6.act.accept")} aria-label={t("m6.act.accept")} onClick={() => quickAccept(d)}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                title={t("m6.act.reject")} aria-label={t("m6.act.reject")} onClick={() => open(d, "reject")}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {tab === "location" && canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("m6.act.fixLocation")} aria-label={t("m6.act.fixLocation")} onClick={() => open(d)}>
                              <MapPin className="h-4 w-4" />
                            </Button>
                          )}
                          {tab === "rejected" && can("validations", "delete") && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("m6.act.reopen")} aria-label={t("m6.act.reopen")} onClick={() => open(d, "reopen")}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && !items.length && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="h-28 text-center">
                        <AlertTriangle className="mx-auto h-7 w-7 text-muted-foreground/40" />
                        <p className="mt-2 text-sm text-muted-foreground">{t(`m6.empty.${tab}`)}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
              />
            </DataCard>
          </div>
        </RequirePermission>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          {selected && (
            <DetectionPanel
              key={selected.id}
              item={selected}
              initialMode={initialMode}
              reasonLabel={reasonLabel}
              onDecided={() => afterDecision(selected.id)}
              onChanged={refresh}
              onReasonAdded={(r) => setReasons((xs) => [...xs, r])}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ClusterHintText({ d }: { d: M6Detection }) {
  const { t } = useM6Labels()
  const code = d.cluster?.hazard_code ?? d.hazard_code
  if (code) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Layers className="h-3.5 w-3.5 text-primary" />
        {d.cluster ? t("cr.cluster.belongs", { code, n: d.cluster.detection_count }) : code}
        <HazardStatusBadge status={d.cluster?.status ?? d.hazard_status} className="text-[10px]" />
      </span>
    )
  }
  if (d.location_status !== "confirmed") return <span className="text-muted-foreground">—</span>
  return <span className="text-muted-foreground">{t("cr.cluster.none")}</span>
}

// ── Detail panel ─────────────────────────────────────────────────────────────

type Mode = "idle" | "correct" | "reject" | "reopen" | "location"

function DetectionPanel({ item, initialMode, reasonLabel, onDecided, onChanged, onReasonAdded }: {
  item: M6Detection
  initialMode: Mode
  reasonLabel: (code: string | null) => string
  onDecided: () => void
  onChanged: () => void
  onReasonAdded: (r: RejectionReason) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const { can } = useAuth()
  const canEdit = can("validations", "edit")
  const canReopen = can("validations", "delete")
  const canAddReason = can("validations", "add")

  const [d, setD] = useState<DetectionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [busy, setBusy] = useState(false)

  // Form fields
  const [note, setNote] = useState("")
  const [severity, setSeverity] = useState<string>("none")
  const [newType, setNewType] = useState(item.type)
  const [newSubtype, setNewSubtype] = useState<string>(item.subtype ?? "none")
  const [reasons, setReasons] = useState<RejectionReason[] | null>(null)
  const [reasonCode, setReasonCode] = useState("")
  const [reopenReason, setReopenReason] = useState("")
  const [addingReason, setAddingReason] = useState(false)
  const [newReasonLabel, setNewReasonLabel] = useState("")
  const [newReasonKind, setNewReasonKind] = useState<RejectionKind>("false_positive")

  const load = useCallback(() => {
    setLoadError(null)
    getDetection(item.id).then(setD).catch((err) => setLoadError(errorText(t, err, "m6")))
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load])

  const type = d?.type ?? item.type
  useEffect(() => {
    if (mode !== "reject" || reasons) return
    fetchRejectionReasons(type).then(setReasons).catch(() => setReasons([]))
  }, [mode, type, reasons])

  const cur = d ?? ({ ...item, history: [], hazard: null } as DetectionDetail)
  const status = cur.review_status
  const isFinal = FINAL_STATUSES.includes(status)
  const cluster = item.cluster

  const run = async (fn: () => Promise<unknown>, msg: string, decided = true) => {
    setBusy(true)
    try {
      await fn()
      toast.success(msg)
      if (decided) onDecided()
      else { load(); onChanged() }
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
      load()
    } finally {
      setBusy(false)
    }
  }

  const sevNum = severity === "none" ? undefined : Number(severity)
  const noteVal = note.trim() || undefined

  const accept = () => run(() => acceptDetection(cur.id, { severity_score: sevNum, note: noteVal }), t("m6.toast.accepted"))
  const correct = () => run(() => correctDetection(cur.id, {
    type: newType,
    subtype: newSubtype === "none" ? null : newSubtype,
    severity_score: newType === "pothole" ? sevNum : undefined,
    note: noteVal,
  }), t("m6.toast.corrected"))
  const reject = () => run(() => rejectDetection(cur.id, { reason_code: reasonCode, note: noteVal }), t("m6.toast.rejected"))
  const reopen = () => run(() => reopenDetection(cur.id, reopenReason.trim()), t("m6.toast.reopened"), false)
    .then(() => { setMode("idle"); setReopenReason("") })

  const addReason = async () => {
    const label = newReasonLabel.trim()
    if (!label) return
    const code = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    setBusy(true)
    try {
      const created = await createRejectionReason({ detection_type: type, code, label, description: label, kind: newReasonKind })
      setReasons((xs) => [...(xs ?? []), created])
      onReasonAdded(created)
      setReasonCode(created.code)
      setAddingReason(false)
      setNewReasonLabel("")
      setNewReasonKind("false_positive")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pmap.val.addReasonFailed"))
    } finally {
      setBusy(false)
    }
  }

  const subtypes = SUBTYPES[newType] ?? []
  const clip = resolveMinioUrl(cur.context_clip_url)
  const crop = resolveMinioUrl(cur.crop_url)
  const classChanged = cur.predicted_type && (cur.predicted_type !== cur.type || (cur.predicted_subtype ?? null) !== (cur.subtype ?? null))

  return (
    <>
      <SheetHeader className="border-b p-4 sm:p-6">
        <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
          {L.typeLabel(cur.type)}
          {cur.subtype && <span className="text-sm font-normal text-muted-foreground">{L.subtypeLabel(cur.type, cur.subtype)}</span>}
          <StatusBadge status={status} />
        </SheetTitle>
        <SheetDescription className="font-mono text-xs">
          {t("m6.val.idLine", { id: cur.id.slice(0, 8), frame: cur.frame_number })}
          {cur.video_time_s != null && ` · ${t("m6.val.videoTime", { s: cur.video_time_s.toFixed(1) })}`}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 p-4 sm:p-6">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {/* Evidence */}
        <section className="space-y-3">
          <EvidenceFrame d={cur} />
          <div className="flex flex-wrap gap-4">
            {crop && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("pmap.val.crop")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crop} alt={t("pmap.val.crop")} className="h-28 max-w-[10rem] rounded-lg bg-muted object-contain" />
              </div>
            )}
            {clip && (
              <div className="min-w-[14rem] flex-1">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Video className="h-3.5 w-3.5" /> {t("m6.ev.clip")}
                </p>
                <VideoPlayer src={clip} className="max-h-56 w-full" />
              </div>
            )}
          </div>
        </section>

        {/* Classification */}
        <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <Info label={t("m6.ev.class")}>
            {L.typeLabel(cur.type)}{cur.subtype ? ` · ${L.subtypeLabel(cur.type, cur.subtype)}` : ""}
            {classChanged && (
              <p className="text-xs text-muted-foreground">
                {t("m6.ev.predicted", { cls: `${L.typeLabel(cur.predicted_type!)}${cur.predicted_subtype ? ` · ${L.subtypeLabel(cur.predicted_type!, cur.predicted_subtype)}` : ""}` })}
              </p>
            )}
          </Info>
          <Info label={t("pmap.val.thConfidence")}>
            <ConfidenceBar value={cur.confidence} />
            <VerifierScore value={cur.verifier_score} />
            {cur.type === "traffic_sign" && !!cur.class_candidates?.length && (
              <p className="text-xs text-muted-foreground">
                {t("sign.candidates")}: {cur.class_candidates.slice(0, 3).map((c) => `${L.subtypeLabel("traffic_sign", c.code)} ${Math.round(c.score * 100)}%`).join(" · ")}
              </p>
            )}
          </Info>
          <Info label={t("m6.ev.model")}>
            {cur.model_name ?? "—"}{cur.model_card_version && <span className="text-xs text-muted-foreground"> · {cur.model_card_version}</span>}
            {cur.model_version && <p className="break-all font-mono text-[11px] text-muted-foreground">{cur.model_version}</p>}
            {cur.verifier_model && (
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {t("ai.verifierShort")}: {cur.verifier_card_version ? `${cur.verifier_card_version} · ` : ""}{cur.verifier_model}
              </p>
            )}
          </Info>
          {cur.ai_decision && (
            <Info label={t("ai.ev.decision")}>
              <span className="flex flex-wrap items-center gap-1.5">
                {t(`ai.decision.${cur.ai_decision}`)}
                <AiBadges d={cur} />
              </span>
              {cur.ai_decision_reason && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <AiReasonBadge reason={cur.ai_decision_reason} />{cur.ai_decision_reason}
                </p>
              )}
              {cur.audit_sample && <p className="text-xs text-muted-foreground">{t("ai.badge.auditHint")}</p>}
            </Info>
          )}
          {cur.recorded_at && (
            <Info label={t("pv.time.recorded")}><span title={t("pv.time.recordedHint")}>{L.fmtDate(cur.recorded_at)}</span></Info>
          )}
          {cur.captured_at && <Info label={t("pmap.val.captured")}>{L.fmtDate(cur.captured_at)}</Info>}
          <Info label={t("pv.time.processed")}>{L.fmtDate(cur.created_at)}</Info>
          {cur.speed_kmh != null && <Info label={t("pmap.val.speed")}>{Math.round(cur.speed_kmh)} km/h</Info>}
          <Info label={t("m6.ev.job")}><span className="font-mono text-xs">{cur.job_id.slice(0, 8)}</span></Info>
        </section>

        {/* AI reasoning (rule-based pipelines: ai_details) */}
        <AiReasoningPanel d={cur} />

        {/* Location */}
        <section className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t("pmap.val.thLocation")}</p>
            <LocationBadge status={cur.location_status} source={cur.location_source} />
          </div>
          <p className="font-mono text-sm">
            {cur.latitude != null && cur.longitude != null ? `${cur.latitude.toFixed(6)}, ${cur.longitude.toFixed(6)}` : t("m6.loc.none")}
          </p>
          {(cur.location_name || cur.city || cur.country) && (
            <p className="text-sm text-muted-foreground">{[cur.location_name, cur.city, cur.country].filter(Boolean).join(" · ")}</p>
          )}
          {cur.raw_gps_text && (
            <p className="text-xs text-muted-foreground">{t("pmap.val.rawOcr")}: <code className="rounded bg-muted px-1.5 py-0.5">{cur.raw_gps_text}</code></p>
          )}
          {status === "pending" && canEdit && mode !== "location" && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMode("location")}>
              <Edit2 className="h-3.5 w-3.5" /> {t("m6.act.adjustLocation")}
            </Button>
          )}
        </section>

        {/* Location review */}
        {d && (status === "location_pending" || mode === "location") && (
          <LocationReview d={d} canEdit={canEdit && (status === "location_pending" || status === "pending")}
            onSaved={() => { setMode("idle"); load(); onChanged() }} />
        )}

        {/* Cluster: a confirmed hazard (HZ- code) or a candidate cluster (CL- code, from the queue's `cluster`) */}
        {(() => {
          const hzStatus = cur.hazard?.status ?? cur.hazard_status ?? cluster?.status ?? null
          const candidate = hzStatus === "candidate"
          const confirmed = hzStatus === "active" || hzStatus === "resolved"
          // hazard_code is null for candidate members: the CL- code comes from the queue item's cluster.
          const code = cur.hazard_code ?? cluster?.hazard_code ?? cur.hazard?.code ?? null
          const count = cur.hazard?.detection_count ?? cluster?.detection_count ?? null
          const hazardId = cur.hazard?.id ?? cur.hazard_id ?? cluster?.hazard_id ?? null
          return (
            <section className="flex items-start gap-3 rounded-lg border p-4">
              <Layers className="mt-0.5 h-4 w-4 text-primary" />
              <div className="text-sm">
                <p className="font-medium">{t("m6.col.cluster")}</p>
                {code ? (
                  <p className="flex flex-wrap items-center gap-1.5">
                    {candidate ? t("cr.cluster.candidateMember", { code }) : t("m6.cluster.member", { code })}
                    <HazardStatusBadge status={hzStatus} className="text-[10px]" />
                    {count != null && <span className="text-muted-foreground">· {t("m6.cluster.count", { n: count })}</span>}
                  </p>
                ) : (
                  <p className="text-muted-foreground">{cur.location_status === "confirmed" ? t("cr.cluster.none") : t("m6.cluster.afterLocation")}</p>
                )}
                {candidate && <p className="mt-1 text-xs text-muted-foreground">{t("cr.cluster.candidateHint")}</p>}
                {confirmed && hazardId && (
                  <Link href={`/detections?hazard=${hazardId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
                    {t("cr.q.openTrack")}
                  </Link>
                )}
              </div>
            </section>
          )
        })()}

        {/* Decision info */}
        {status === "rejected" && (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">{t("m6.rej.title")}</p>
            <p>{reasonLabel(cur.rejection_code)}{cur.rejection_source && <Badge variant="outline" className="ml-2 text-[10px]">{t(`m6.rej.${cur.rejection_source}`)}</Badge>}</p>
            {cur.review_note && <p className="mt-1 italic text-muted-foreground">&ldquo;{cur.review_note}&rdquo;</p>}
          </section>
        )}

        {/* Actions */}
        {status === "pending" && canEdit && (
          <section className="space-y-4 border-t pt-4">
            {mode !== "correct" && mode !== "reject" && (
              <>
                {cur.type === "pothole" && <SeveritySelect value={severity} onChange={setSeverity} />}
                <NoteField value={note} onChange={setNote} />
                <div className="flex flex-wrap gap-2">
                  <Button className="flex-1 bg-success text-white hover:bg-success/90" disabled={busy} onClick={accept}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{t("m6.act.accept")}
                  </Button>
                  <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setMode("correct")}>
                    <Edit2 className="h-4 w-4" />{t("m6.act.correct")}
                  </Button>
                  <Button variant="outline" className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => setMode("reject")}>
                    <XCircle className="h-4 w-4" />{t("m6.act.reject")}
                  </Button>
                </div>
              </>
            )}

            {mode === "correct" && (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t("m6.act.correctTitle")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("m6.filter.type")}</Label>
                    <Select value={newType} onValueChange={(v) => { setNewType(v); setNewSubtype("none") }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set<string>([...DETECTION_TYPES, cur.type])).map((ty) => (
                          <SelectItem key={ty} value={ty}>{L.typeLabel(ty)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newType === "traffic_sign" ? (
                    <SignPicker value={newSubtype === "none" ? null : newSubtype} onChange={setNewSubtype}
                      candidates={cur.class_candidates}
                      extraCodes={[cur.subtype, cur.predicted_subtype].filter((c): c is string => !!c && cur.type === "traffic_sign")} />
                  ) : subtypes.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>{t("pmap.val.subtype")}</Label>
                      <Select value={newSubtype} onValueChange={setNewSubtype}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {Array.from(new Set([...subtypes, ...(cur.subtype && newType === cur.type && cur.type !== "pothole" ? [cur.subtype] : [])])).map((s) => (
                            <SelectItem key={s} value={s}>{L.subtypeLabel(newType, s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {newType === "pothole" && <SeveritySelect value={severity} onChange={setSeverity} />}
                </div>
                <NoteField value={note} onChange={setNote} />
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={busy || (newType === cur.type && (newSubtype === "none" ? null : newSubtype) === (cur.subtype ?? null) && newType !== "pothole")} onClick={correct}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("m6.act.saveCorrection")}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setMode("idle")}>{t("common.cancel")}</Button>
                </div>
              </div>
            )}
          </section>
        )}

        {(status === "pending" || status === "location_pending") && canEdit && mode === "reject" && (
          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>{t("pmap.val.rejectionReason")} <span className="text-destructive">*</span></Label>
              {canAddReason && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary" onClick={() => setAddingReason(true)}>
                  <Plus className="h-3.5 w-3.5" /> {t("pmap.val.addReason")}
                </Button>
              )}
            </div>
            <div className="grid max-h-72 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label={t("pmap.val.rejectionReason")}>
              {reasons === null ? (
                <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("pmap.val.loadingReasons")}</p>
              ) : !reasons.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("pmap.val.noReasons")}</p>
              ) : REJECTION_KINDS.map((k) => {
                const group = reasons.filter((r) => kindOf(r) === k)
                if (!group.length) return null
                return (
                  <div key={k} className="space-y-1.5" role="group" aria-label={t(`rej.kind.${k}`)}>
                    <p className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={t(`rej.kind.${k}.help`)}>
                      <span className={cn("h-2 w-2 shrink-0 rounded-full border", KIND_BADGE[k])} />{t(`rej.kind.${k}`)}
                    </p>
                    {group.map((r) => (
                      <button key={r.id} type="button" role="radio" aria-checked={reasonCode === r.code} onClick={() => setReasonCode(r.code)}
                        className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          reasonCode === r.code ? "border-destructive bg-destructive/10" : "bg-muted/30 hover:border-destructive/50")}>
                        <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", reasonCode === r.code ? "border-destructive bg-destructive" : "border-muted-foreground")} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{L.tl(`rej.code.${r.code}`, r.label)}{r.is_custom && <span className="ml-1.5 text-xs text-muted-foreground">{t("pmap.val.custom")}</span>}</span>
                          {r.description && r.description !== r.label && t(`rej.code.${r.code}`) === `rej.code.${r.code}` && <span className="block text-xs text-muted-foreground">{r.description}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            {addingReason && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
                <Input className="h-8 min-w-40 flex-1 text-sm" placeholder={t("pmap.val.reasonLabelPlaceholder")} value={newReasonLabel} onChange={(e) => setNewReasonLabel(e.target.value)} />
                <Select value={newReasonKind} onValueChange={(v) => setNewReasonKind(v as RejectionKind)}>
                  <SelectTrigger className="h-8 w-full text-xs sm:w-56" aria-label={t("rej.kind.label")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REJECTION_KINDS.map((k) => <SelectItem key={k} value={k} className="text-xs">{t(`rej.kind.${k}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={busy || !newReasonLabel.trim()} onClick={addReason}>{t("pmap.val.saveSelect")}</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingReason(false)}>{t("common.cancel")}</Button>
              </div>
            )}
            <NoteField value={note} onChange={setNote} />
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" disabled={busy || !reasonCode} onClick={reject}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}{t("pmap.val.confirmReject")}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setMode("idle")}>{t("common.cancel")}</Button>
            </div>
          </section>
        )}

        {status === "location_pending" && canEdit && mode !== "reject" && (
          <div className="flex justify-end">
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setMode("reject")}>
              <XCircle className="h-4 w-4" />{t("m6.act.reject")}
            </Button>
          </div>
        )}

        {isFinal && canReopen && (
          <section className="space-y-3 border-t pt-4">
            {mode !== "reopen" ? (
              <Button variant="outline" onClick={() => setMode("reopen")}><RotateCcw className="h-4 w-4" />{t("m6.act.reopen")}</Button>
            ) : (
              <>
                <Label htmlFor="reopen-reason">{t("m6.act.reopenReason")} <span className="text-destructive">*</span></Label>
                <Textarea id="reopen-reason" rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("m6.act.reopenHint")}</p>
                <div className="flex gap-2">
                  <Button disabled={busy || !reopenReason.trim()} onClick={reopen}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{t("m6.act.reopen")}
                  </Button>
                  <Button variant="outline" onClick={() => setMode("idle")}>{t("common.cancel")}</Button>
                </div>
              </>
            )}
          </section>
        )}

        {/* History */}
        <section className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{t("m6.hist.title")}</p>
          {d ? <HistoryTimeline items={d.history ?? []} /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </section>
      </div>
    </>
  )
}

function SeveritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useM6Labels()
  return (
    <div className="space-y-1.5">
      <Label>{t("pmap.val.severity")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={t("pmap.val.selectSeverity")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{t(`pmap.val.sev${n}`)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useM6Labels()
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("m6.common.noteOptional")}</Label>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
