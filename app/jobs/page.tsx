"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Briefcase, RefreshCw, CheckCircle2, XCircle, Loader2, Clock, Cpu, Layers,
  Trash2, Ban, RotateCcw, Upload, Cloud, Radio, Server, Gauge, ExternalLink, AlertTriangle, CircleDot,
  type LucideIcon,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SettingsLinkButton } from "@/components/settings-index"
import { StatCard, type Tone } from "@/components/stat-card"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/auth-api"
import {
  JOB_SOURCES, JOB_STATUSES, cancelJob, deleteJob, formatDuration, getJob, getJobCapacity, getJobSummary,
  isActiveJob, jobModels, jobPercent, jobSeconds, listJobs, parseDate, retryJob, summaryCounts,
  type Job, type JobCapacity, type JobDetail, type JobSourceType, type JobStatus,
} from "@/lib/module7-api"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"

const PAGE_SIZE = 20
const REFRESH_MS = 5000
const SCOPE = "m7.jobs"

const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  pending: "amber", processing: "blue", done: "green", failed: "red", cancelled: "slate",
}

/** KPI card per status (also acts as the status filter). */
const JOB_STATUS_CARD: Record<JobStatus, { icon: LucideIcon; tone: Tone }> = {
  pending: { icon: Clock, tone: "orange" },
  processing: { icon: Cpu, tone: "blue" },
  done: { icon: CheckCircle2, tone: "green" },
  failed: { icon: XCircle, tone: "red" },
  cancelled: { icon: Ban, tone: "slate" },
}

function SourceIcon({ type, className }: { type: JobSourceType | null | undefined; className?: string }) {
  const Icon = type === "stream" ? Radio : type === "sftp" ? Server : type === "google_drive" || type === "onedrive" ? Cloud : Upload
  return <Icon className={className} />
}

function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n()
  return <Pill tone={JOB_STATUS_TONE[status] ?? "amber"}>{t(`ops.status.${status}`)}</Pill>
}

type Action = "cancel" | "retry" | "delete"

export default function JobsPage() {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const canEdit = can("jobs", "edit")
  const canDelete = can("jobs", "delete")

  const [items, setItems] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capacity, setCapacity] = useState<JobCapacity | null>(null)
  const [counts, setCounts] = useState<Partial<Record<JobStatus, number>> | null>(null)
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all")
  const [sourceFilter, setSourceFilter] = useState<JobSourceType | "all">("all")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [pending, setPending] = useState<{ action: Action; job: Job } | null>(null)
  const [busy, setBusy] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const reqSeq = useRef(0)

  // Deep link: /jobs?job=<id> opens the detail drawer (used by the upload page)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job")
    if (id) setDetailId(id)
  }, [])

  // Debounce the search box
  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => clearTimeout(h)
  }, [searchInput])

  const load = useCallback(async (silent = false) => {
    const seq = ++reqSeq.current
    if (!silent) setLoading(true)
    try {
      const [list, cap, sum] = await Promise.all([
        listJobs({
          status: statusFilter === "all" ? undefined : [statusFilter],
          source_type: sourceFilter === "all" ? undefined : sourceFilter,
          search: search || undefined,
          skip: (page - 1) * pageSize,
          limit: pageSize,
        }),
        getJobCapacity().catch(() => null),
        getJobSummary().catch(() => null),
      ])
      if (seq !== reqSeq.current) return
      setItems(list.items)
      setTotal(list.total)
      setCapacity(cap)
      setCounts(summaryCounts(sum))
      setError(null)
    } catch (e) {
      if (seq !== reqSeq.current) return
      setError(errorText(t, e, SCOPE) || t("ops.jobs.loadFailed"))
    } finally {
      if (!silent && seq === reqSeq.current) setLoading(false)
    }
  }, [statusFilter, sourceFilter, search, page, pageSize, t])

  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await getJob(id)
      setDetail(d)
      setDetailError(null)
    } catch (e) {
      setDetailError(errorText(t, e, SCOPE))
    }
  }, [t])

  useEffect(() => {
    setDetail(null)
    setDetailError(null)
    if (detailId) loadDetail(detailId)
  }, [detailId, loadDetail])

  // Auto-refresh every 5 s while anything is pending/processing
  const anyActive = items.some(isActiveJob) || (capacity ? capacity.running + capacity.pending > 0 : false)
    || (detail ? isActiveJob(detail) : false)
  useEffect(() => {
    if (!anyActive) return
    const h = setInterval(() => {
      load(true)
      if (detailId) loadDetail(detailId)
    }, REFRESH_MS)
    return () => clearInterval(h)
  }, [anyActive, load, loadDetail, detailId])

  const runAction = async () => {
    if (!pending) return
    const { action, job } = pending
    setBusy(true)
    try {
      if (action === "cancel") await cancelJob(job.id)
      else if (action === "retry") await retryJob(job.id)
      else await deleteJob(job.id)
      toast.success(t(`${SCOPE}.done.${action}`))
      setPending(null)
      if (action === "delete" && detailId === job.id) setDetailId(null)
      else if (detailId === job.id) loadDetail(job.id)
      load(true)
    } catch (e) {
      toast.error(errorText(t, e, SCOPE))
    } finally {
      setBusy(false)
    }
  }

  const allCount = counts ? JOB_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0) : null
  const fmtDate = (s: string | null | undefined) => {
    const d = parseDate(s)
    return d ? d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"
  }
  const sourceLabel = (s: JobSourceType | null | undefined) => t(`${SCOPE}.source.${s ?? "upload"}`)
  const actions = (job: Job): Action[] => {
    const out: Action[] = []
    if (canEdit && isActiveJob(job)) out.push("cancel")
    if (canEdit && (job.status === "failed" || job.status === "cancelled")) out.push("retry")
    if (canDelete && job.status !== "processing") out.push("delete")
    return out
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="jobs">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader
            title={t("nav.jobs")}
            description={t("ops.jobs.subtitle")}
            actions={<>
              <SettingsLinkButton anchor="processing" />
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-9 gap-2">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {t("ops.common.refresh")}
              </Button>
            </>}
          />

          {/* KPI cards (also act as status filters) */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Layers} tone="purple" value={allCount ?? "—"} label={t("ops.jobs.total")}
              onClick={() => { setStatusFilter("all"); setPage(1) }}
              className={cn(statusFilter === "all" && "border-primary/60 ring-1 ring-primary/30")} />
            {JOB_STATUSES.map((s) => (
              <StatCard key={s} icon={JOB_STATUS_CARD[s].icon} tone={JOB_STATUS_CARD[s].tone}
                value={counts?.[s] ?? "—"} label={t(`ops.status.${s}`)}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={cn(statusFilter === s && "border-primary/60 ring-1 ring-primary/30")} />
            ))}
          </div>

          {/* Capacity banner */}
          {capacity && (
            <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-white">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums">
                    {t(`${SCOPE}.capacity.running`, { running: capacity.running, max: capacity.max_concurrent_jobs })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(`${SCOPE}.capacity.title`)}</p>
                </div>
              </div>
              <div className="flex-1 min-w-[140px]">
                <Progress
                  value={capacity.max_concurrent_jobs > 0 ? Math.min(100, (capacity.running / capacity.max_concurrent_jobs) * 100) : 0}
                  className="h-1.5"
                />
              </div>
              <p className="text-sm tabular-nums">
                <span className="font-semibold">{capacity.pending}</span>{" "}
                <span className="text-muted-foreground">{t(`${SCOPE}.capacity.pending`)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`${SCOPE}.capacity.workers`, { n: capacity.worker_concurrency })}
              </p>
              {anyActive && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleDot className="h-3 w-3 animate-pulse text-primary" />{t(`${SCOPE}.autoRefresh`)}
                </span>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}

          <DataCard>
            <DataToolbar search={searchInput} onSearch={setSearchInput} placeholder={t(`${SCOPE}.searchPlaceholder`)}>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as JobStatus | "all"); setPage(1) }}>
                <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("common.status")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("ops.jobs.total")}</SelectItem>
                  {JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`ops.status.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as JobSourceType | "all"); setPage(1) }}>
                <SelectTrigger className="h-9 w-full sm:w-44" aria-label={t(`${SCOPE}.col.source`)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(`${SCOPE}.source.all`)}</SelectItem>
                  {JOB_SOURCES.map((s) => <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </DataToolbar>

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">{t(`${SCOPE}.col.job`)}</TableHead>
                  <TableHead className="hidden md:table-cell">{t(`${SCOPE}.col.source`)}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-44">{t("ops.jobs.col.progress")}</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">{t("nav.detections")}</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">{t(`${SCOPE}.col.avgConf`)}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t(`${SCOPE}.col.started`)}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t(`${SCOPE}.col.duration`)}</TableHead>
                  <TableHead className="hidden xl:table-cell text-center">{t(`${SCOPE}.col.attempts`)}</TableHead>
                  <TableHead className="w-24 pr-4 text-right"><span className="sr-only">{t(`${SCOPE}.col.actions`)}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center">
                      <Briefcase className="mx-auto h-7 w-7 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">{t("ops.jobs.empty")}</p>
                    </TableCell>
                  </TableRow>
                )}
                {items.map((job) => {
                  const pct = jobPercent(job)
                  const name = job.source_name || job.filename
                  return (
                    <TableRow key={job.id} className="h-11 cursor-pointer" onClick={() => setDetailId(job.id)}>
                      <TableCell className="py-1.5 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <SourceIcon type={job.source_type} className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate font-medium leading-tight" title={name}>{name}</p>
                            <p className="font-mono text-[11px] leading-tight text-muted-foreground">{job.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-1.5 md:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <SourceIcon type={job.source_type} className="h-3.5 w-3.5" />
                          {sourceLabel(job.source_type)}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <StatusBadge status={job.status} />
                        {job.cancel_requested && job.status === "processing" && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{t(`${SCOPE}.cancelRequested`)}</p>
                        )}
                        {job.error && job.status === "failed" && (
                          <p className="mt-0.5 max-w-[160px] truncate text-xs text-destructive" title={job.error}>{job.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {job.status === "pending" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="w-8 text-right text-xs tabular-nums">{pct}%</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {t("ops.jobs.frames", {
                                done: (job.processed ?? 0).toLocaleString(locale),
                                total: (job.total_frames ?? 0).toLocaleString(locale),
                              })}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-right sm:table-cell">
                        <span className={cn("text-sm font-medium tabular-nums", job.detections > 0 ? "text-primary" : "text-muted-foreground")}>
                          {job.detections}
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-right tabular-nums lg:table-cell">
                        {job.avg_confidence != null ? `${Math.round(job.avg_confidence * 100)}%` : "—"}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground lg:table-cell">
                        {fmtDate(job.started_at)}
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-xs tabular-nums xl:table-cell">
                        {formatDuration(jobSeconds(job))}
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-center text-xs tabular-nums xl:table-cell">
                        {job.attempts ?? 1}{job.max_attempts ? ` / ${job.max_attempts}` : ""}
                      </TableCell>
                      <TableCell className="py-1.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions job={job} actions={actions(job)} onAction={(action) => setPending({ action, job })} />
                      </TableCell>
                    </TableRow>
                  )
                })}
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

      {/* Detail drawer */}
      <Sheet open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="pr-6 break-all">
              {detail ? (detail.source_name || detail.filename) : t(`${SCOPE}.detail.title`)}
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">{detailId}</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-6">
            {detailError && <Alert variant="destructive"><AlertDescription>{detailError}</AlertDescription></Alert>}
            {!detail && !detailError && (
              <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            )}
            {detail && (
              <JobDetailBody
                job={detail}
                fmtDate={fmtDate}
                sourceLabel={sourceLabel}
                actions={actions(detail)}
                onAction={(action) => setPending({ action, job: detail })}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm dialog */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? t(`${SCOPE}.confirm.${pending.action}.title`) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && t(`${SCOPE}.confirm.${pending.action}.body`, { name: pending.job.source_name || pending.job.filename })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runAction() }}
              disabled={busy}
              className={cn(pending?.action !== "retry" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? t(`${SCOPE}.action.${pending.action}`) : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const ACTION_ICON: Record<Action, React.ComponentType<{ className?: string }>> = {
  cancel: Ban, retry: RotateCcw, delete: Trash2,
}

function RowActions({ actions, onAction }: { job: Job; actions: Action[]; onAction: (a: Action) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-end gap-1">
      {actions.map((a) => {
        const Icon = ACTION_ICON[a]
        return (
          <Button
            key={a}
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-muted-foreground",
              a === "retry" ? "hover:bg-primary/10 hover:text-primary" : "hover:bg-destructive/10 hover:text-destructive",
            )}
            onClick={() => onAction(a)}
            title={t(`m7.jobs.action.${a}`)}
            aria-label={t(`m7.jobs.action.${a}`)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

const VERDICT_TONE: Record<string, BadgeTone> = {
  parked: "green", moving: "blue", traffic_queue: "amber", off_road: "red", not_grounded: "red",
  insufficient_evidence: "slate", too_far: "slate",
}

type VehicleSummary = { verdicts: Record<string, number>; masked: number | null }

/** Parked-vehicle counters of the latest done / cancelled event (details.vehicle_verdicts / vehicle_boxes_masked). */
function vehicleSummary(job: JobDetail): VehicleSummary | null {
  const evs = job.events
    .filter((e) => (e.event === "done" || e.event === "cancelled") && e.details
      && (e.details.vehicle_verdicts != null || e.details.vehicle_boxes_masked != null))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const ev = evs[evs.length - 1]
  if (!ev?.details) return null
  const raw = ev.details.vehicle_verdicts
  const verdicts: Record<string, number> = {}
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "number") verdicts[k] = v
  }
  const masked = typeof ev.details.vehicle_boxes_masked === "number" ? ev.details.vehicle_boxes_masked : null
  return { verdicts, masked }
}

function VehicleVerdicts({ summary }: { summary: VehicleSummary }) {
  const { t, locale } = useI18n()
  const entries = Object.entries(summary.verdicts).sort((a, b) => (a[0] === "parked" ? -1 : b[0] === "parked" ? 1 : b[1] - a[1]))
  const total = entries.reduce((n, [, v]) => n + v, 0)
  const label = (v: string) => { const k = `pv.verdict.${v}`; return t(k) === k ? v.replace(/_/g, " ") : t(k) }
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("pv.jobs.title")}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("pv.jobs.total", { n: total.toLocaleString(locale) })}
          {summary.masked != null && ` · ${t("pv.jobs.masked", { n: summary.masked.toLocaleString(locale) })}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([v, n]) => (
          <Pill key={v} tone={VERDICT_TONE[v] ?? "slate"} className={cn(v === "parked" && "font-semibold")}>
            {label(v)} · <span className="tabular-nums">{n.toLocaleString(locale)}</span>
          </Pill>
        ))}
      </div>
    </div>
  )
}

/** One event `details` entry as text — the parked-vehicle counters are spelled out. */
function eventDetailText(t: (k: string, v?: Record<string, string | number>) => string, locale: string, k: string, v: unknown): string {
  if (k === "vehicle_verdicts" && v && typeof v === "object") {
    const label = (x: string) => { const key = `pv.verdict.${x}`; return t(key) === key ? x : t(key) }
    return `${t("pv.jobs.title")}: ${Object.entries(v as Record<string, unknown>).map(([x, n]) => `${label(x)} ${String(n)}`).join(", ")}`
  }
  if (k === "vehicle_boxes_masked" && typeof v === "number") return t("pv.jobs.masked", { n: v.toLocaleString(locale) })
  return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
}

function JobDetailBody({ job, fmtDate, sourceLabel, actions, onAction }: {
  job: JobDetail
  fmtDate: (s: string | null | undefined) => string
  sourceLabel: (s: JobSourceType | null | undefined) => string
  actions: Action[]
  onAction: (a: Action) => void
}) {
  const { t, locale } = useI18n()
  const pct = jobPercent(job)
  const byModel = Object.entries(job.detections_by_model ?? {}).sort((a, b) => b[1] - a[1])
  const maxModel = Math.max(1, ...byModel.map(([, n]) => n))
  const typeLabel = (m: string) => {
    for (const k of [`m7.model.${m}`, `ops.detType.${m}`]) { const v = t(k); if (v !== k) return v }
    return m
  }
  const models = jobModels(job)
  const vehicles = vehicleSummary(job)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        <Badge variant="outline" className="gap-1 text-xs">
          <SourceIcon type={job.source_type} className="h-3.5 w-3.5" />{sourceLabel(job.source_type)}
        </Badge>
        {models.map((m) => <Badge key={m} variant="secondary" className="text-xs">{typeLabel(m)}</Badge>)}
      </div>

      {job.status !== "pending" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("ops.jobs.frames", { done: (job.processed ?? 0).toLocaleString(locale), total: (job.total_frames ?? 0).toLocaleString(locale) })}
          </p>
        </div>
      )}

      {job.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="break-words">{job.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Metric label={t("nav.detections")} value={job.detections} />
        <Metric label={t("m7.jobs.col.avgConf")} value={job.avg_confidence != null ? `${Math.round(job.avg_confidence * 100)}%` : "—"} />
        <Metric label={t("m7.jobs.detail.processingTime")} value={formatDuration(jobSeconds(job))} />
        <Metric label={t("m7.jobs.detail.videoLength")} value={formatDuration(job.duration_s)} />
        <Metric label={t("m7.jobs.detail.fps")} value={job.fps != null ? job.fps.toFixed(1) : "—"} />
        <Metric label={t("m7.jobs.detail.frameSkip")} value={job.frame_skip != null ? t("m7.common.everyN", { n: job.frame_skip }) : "—"} />
        <Metric label={t("m7.jobs.col.attempts")} value={`${job.attempts ?? 1}${job.max_attempts ? ` / ${job.max_attempts}` : ""}`} />
        <Metric label={t("m7.jobs.detail.submittedBy")} value={job.submitted_by || "—"} />
        <Metric label={t("ops.jobs.col.submitted")} value={fmtDate(job.created_at)} />
        <Metric label={t("m7.jobs.col.started")} value={fmtDate(job.started_at)} />
        <Metric label={t("ops.jobs.col.finished")} value={fmtDate(job.finished_at)} />
        {job.cancelled_at
          ? <Metric label={t("m7.jobs.detail.cancelledBy")} value={`${job.cancelled_by || "—"} · ${fmtDate(job.cancelled_at)}`} />
          : <Metric label={t("m7.jobs.detail.file")} value={<span title={job.filename}>{job.filename}</span>} />}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("m7.jobs.detail.byModel")}</h3>
        {byModel.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("m7.jobs.detail.noDetections")}</p>
        ) : (
          <div className="space-y-2">
            {byModel.map(([m, n]) => (
              <div key={m} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate">{typeLabel(m)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxModel) * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {vehicles && <VehicleVerdicts summary={vehicles} />}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={`/detections?job_id=${encodeURIComponent(job.id)}`}>
            <ExternalLink className="h-4 w-4" />{t("m7.jobs.detail.viewDetections")}
          </Link>
        </Button>
        {actions.map((a) => {
          const Icon = ACTION_ICON[a]
          return (
            <Button key={a} size="sm" variant={a === "retry" ? "default" : "outline"}
              className={cn("gap-2", a !== "retry" && "text-destructive hover:text-destructive")}
              onClick={() => onAction(a)}>
              <Icon className="h-4 w-4" />{t(`m7.jobs.action.${a}`)}
            </Button>
          )
        })}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">{t("m7.jobs.detail.events")}</h3>
        {job.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("m7.jobs.detail.noEvents")}</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {job.events.map((ev) => {
              const key = `m7.event.${ev.event}`
              const label = t(key) === key ? ev.event : t(key)
              const bad = ev.event === "failed" || ev.event === "progress_failed"
              const detailsText = ev.details && Object.keys(ev.details).length
                ? Object.entries(ev.details).map(([k, v]) => eventDetailText(t, locale, k, v)).join(" · ")
                : null
              return (
                <li key={String(ev.id)} className="relative">
                  <span className={cn(
                    "absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background",
                    bad ? "bg-destructive" : ev.event === "done" ? "bg-success" : ev.event === "cancelled" ? "bg-muted-foreground" : "bg-primary",
                  )} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className={cn("text-sm font-medium", bad && "text-destructive")}>{label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(ev.at)}</p>
                  </div>
                  {ev.actor && <p className="text-xs text-muted-foreground">{ev.actor}</p>}
                  {detailsText && <p className="mt-0.5 break-words text-xs text-muted-foreground">{detailsText}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </>
  )
}
