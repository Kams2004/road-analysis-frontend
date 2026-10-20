"use client"

/**
 * Imports of cloud files with live progress. Each batch: overall bar
 * (download = first half, processing = second half of every file), counts,
 * combined speed / ETA, cancel / retry / clear. Each file: phase label and
 * bar — Downloading 45 % · 120 MB / 260 MB · 4.2 MB/s · ETA 33 s → Saving →
 * Queued → Processing 62 % (from its job) → Done (links to the job's
 * detections) — with cancel / retry and readable errors.
 *
 * Polls every 1.5 s while something is active (paused when the tab is
 * hidden), stops when everything is idle; `refreshKey` restarts it.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertCircle, Ban, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Copy, Download, ExternalLink, FileVideo,
  FolderSync, ImageIcon, Loader2, RefreshCw, RotateCcw, Trash2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge, type BadgeTone } from "@/components/status-badge"
import { useAuth } from "@/components/auth-provider"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { parseDate } from "@/lib/module7-api"
import {
  cancelImport, cancelImportItem, deleteImport, formatBytes, formatEta, formatSpeed, listImports, retryImport,
  retryImportItem, type ImportBatch, type ImportItem,
} from "@/lib/cloud-sources-api"
import { ProgressBar, type BarTone } from "./progress-bar"
import { ProviderIcon } from "./provider-icon"

const S = "cs"
const POLL_MS = 1500

const BATCH_TONE: Record<string, BadgeTone> = {
  queued: "amber", running: "blue", done: "green", completed_with_errors: "orange", failed: "red", cancelled: "slate",
}

export function ImportsPanel({ connectionId, refreshKey, onActiveChange, highlight }: {
  connectionId?: string | null
  refreshKey: number
  onActiveChange?: (n: number) => void
  highlight?: string | null
}) {
  const { t } = useI18n()
  const [batches, setBatches] = useState<ImportBatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(true)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const res = await listImports({ connectionId: connectionId ?? undefined, includeItems: true, limit })
      if (!alive.current) return false
      setBatches(res.items)
      setTotal(res.total)
      setError(null)
      const active = res.items.filter((b) => b.active).length
      onActiveChange?.(active)
      return active > 0
    } catch (e) {
      if (alive.current) setError(errorText(t, e, S))
      return false
    }
  }, [connectionId, limit, t, onActiveChange])

  // Poll while active; restart on refreshKey / filters / a user action.
  const [restartKey, setRestartKey] = useState(0)
  const kick = () => setRestartKey((k) => k + 1)
  useEffect(() => {
    alive.current = true
    setPolling(true)
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (typeof document !== "undefined" && document.hidden) {
        timer.current = setTimeout(tick, POLL_MS)       // paused while the tab is hidden
        return
      }
      const active = await load()
      if (stopped) return
      if (active) timer.current = setTimeout(tick, POLL_MS)
      else setPolling(false)
    }
    if (timer.current) clearTimeout(timer.current)
    tick()
    return () => {
      stopped = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [load, refreshKey, restartKey])
  useEffect(() => () => { alive.current = false }, [])

  const replace = (b: ImportBatch) => setBatches((prev) => prev?.map((x) => (x.id === b.id ? { ...x, ...b } : x)) ?? prev)

  const act = async (fn: () => Promise<ImportBatch | void>, ok?: string, removeId?: string) => {
    try {
      const b = await fn()
      if (b) replace(b)
      if (removeId) setBatches((prev) => prev?.filter((x) => x.id !== removeId) ?? prev)
      if (ok) toast.success(ok)
      kick()
    } catch (e) {
      toast.error(errorText(t, e, S))
    }
  }

  if (error && !batches) {
    return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  }
  if (!batches) {
    return <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {polling ? (
            <><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>{t(`${S}.live`)}</>
          ) : t(`${S}.idle`)}
        </p>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={kick}>
          <RefreshCw className="h-3.5 w-3.5" />{t("ops.common.refresh")}
        </Button>
      </div>
      {batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <Download className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
          <p className="text-sm font-medium">{t(`${S}.noImports`)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t(`${S}.noImportsHint`)}</p>
        </div>
      ) : (
        batches.map((b) => (
          <BatchCard key={b.id} batch={b} highlight={b.id === highlight}
            onCancel={() => act(() => cancelImport(b.id), t(`${S}.cancelRequested`))}
            onRetry={() => act(() => retryImport(b.id), t(`${S}.retryQueued`))}
            onDelete={() => act(() => deleteImport(b.id), undefined, b.id)}
            onItemCancel={(it) => act(() => cancelImportItem(b.id, it.id))}
            onItemRetry={(it) => act(() => retryImportItem(b.id, it.id), t(`${S}.retryQueued`))}
          />
        ))
      )}
      {total > batches.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 10)}>{t(`${S}.olderImports`)}</Button>
        </div>
      )}
    </div>
  )
}

function BatchCard({ batch: b, highlight, onCancel, onRetry, onDelete, onItemCancel, onItemRetry }: {
  batch: ImportBatch
  highlight: boolean
  onCancel: () => void
  onRetry: () => void
  onDelete: () => void
  onItemCancel: (it: ImportItem) => void
  onItemRetry: (it: ImportItem) => void
}) {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const canEdit = can("jobs", "edit")
  const canDelete = can("jobs", "delete")
  const [open, setOpen] = useState(b.active || highlight)
  useEffect(() => { if (b.active) setOpen(true) }, [b.active])
  const items = b.items ?? []
  const c = b.counts
  const done = (c.done ?? 0) + (c.skipped_duplicate ?? 0)
  const failed = (c.failed ?? 0) + (c.cancelled ?? 0)
  const created = parseDate(b.created_at)
  const tone: BarTone = b.status === "failed" ? "red" : b.status === "completed_with_errors" ? "amber"
    : b.status === "done" ? "green" : b.status === "cancelled" ? "slate" : "primary"

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm transition-shadow", highlight ? "border-primary/50 ring-1 ring-primary/30" : "border-border")}>
      <div className="space-y-2.5 px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex min-w-0 flex-1 items-start gap-3 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              <ProviderIcon provider={b.provider} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{t(`${S}.batchTitle`, { n: b.item_count })}</p>
                <StatusBadge tone={BATCH_TONE[b.status] ?? "slate"}>{t(`${S}.batch.${b.status}`)}</StatusBadge>
                {b.origin === "sync" && (
                  <StatusBadge tone="purple" dot={false}><FolderSync className="mr-1 h-3 w-3" />{t(`${S}.origin.sync`)}</StatusBadge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {b.connection_name ?? t(`m7.jobs.source.${b.provider}`)}
                {created ? ` · ${created.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                {b.created_by && b.created_by !== "system" ? ` · ${b.created_by}` : ""}
              </p>
            </div>
            {open ? <ChevronDown className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-1.5">
            {canEdit && b.active && (
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onCancel}>
                <Ban className="h-3.5 w-3.5" />{t(`${S}.cancelAll`)}
              </Button>
            )}
            {canEdit && failed > 0 && (
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onRetry}>
                <RotateCcw className="h-3.5 w-3.5" />{t(`${S}.retryFailed`, { n: failed })}
              </Button>
            )}
            {canDelete && !b.active && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete} aria-label={t(`${S}.clearHistory`)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(`${S}.clearHistory`)}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <ProgressBar value={b.progress} tone={tone} striped={b.active} label={t(`${S}.overall`)} />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{Math.round(b.progress)}%</span>
              {" · "}{t(`${S}.doneOf`, { done, n: b.item_count })}
              {failed > 0 && <span className="text-destructive"> · {t(`${S}.failedN`, { n: failed })}</span>}
            </span>
            {b.bytes_total > 0 && (
              <span className="tabular-nums">
                {formatBytes(Math.min(b.bytes_done, b.bytes_total), locale)} / {formatBytes(b.bytes_total, locale)}
                {b.speed_bps ? ` · ${formatSpeed(b.speed_bps, locale)}` : ""}
                {b.download_eta_s ? ` · ${t(`${S}.eta`, { t: formatEta(b.download_eta_s) })}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {open && items.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((it) => (
            <ItemRow key={it.id} item={it} canEdit={canEdit} onCancel={() => onItemCancel(it)} onRetry={() => onItemRetry(it)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemRow({ item: it, canEdit, onCancel, onRetry }: {
  item: ImportItem
  canEdit: boolean
  onCancel: () => void
  onRetry: () => void
}) {
  const { t, locale } = useI18n()
  const isImage = (it.mime_type ?? "").startsWith("image/")
  const Icon = isImage ? ImageIcon : FileVideo
  const { label, value, tone, detail, striped } = phase(it, t, locale)
  const cancellable = ["queued", "downloading", "uploading_to_storage", "queued_for_processing", "processing"].includes(it.status)
  const retryable = it.status === "failed" || it.status === "cancelled"

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          it.status === "done" ? "bg-emerald-500/10 text-emerald-600" : it.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
          {it.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : it.status === "failed" ? <AlertCircle className="h-4 w-4" />
            : it.status === "cancelled" ? <CircleSlash className="h-4 w-4" /> : it.status === "skipped_duplicate" ? <Copy className="h-4 w-4" />
              : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium" title={it.path ? `${it.path}/${it.name}` : it.name}>
              {it.path && <span className="font-normal text-muted-foreground">{it.path}/</span>}{it.name}
            </p>
            <span className={cn("shrink-0 text-xs font-medium tabular-nums",
              tone === "red" ? "text-destructive" : tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
          {value !== undefined && <ProgressBar value={value} tone={tone} striped={striped} className="h-1.5" label={label} />}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={cn("min-w-0 break-words", it.status === "failed" && "text-destructive")}>{detail}</span>
            {it.job_id && (it.status === "done" || it.status === "processing" || it.status === "queued_for_processing" || it.status === "failed") && (
              <span className="flex shrink-0 items-center gap-2">
                <Link href={`/detections?job_id=${it.job_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  {t(`${S}.viewDetections`)}<ExternalLink className="h-3 w-3" />
                </Link>
                <Link href="/jobs" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">{t(`${S}.viewJobs`)}</Link>
              </span>
            )}
            {it.status === "skipped_duplicate" && it.duplicate_of_job_id && (
              <Link href={`/detections?job_id=${it.duplicate_of_job_id}`} className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">
                {t(`${S}.viewEarlier`)}<ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
        {canEdit && (cancellable || retryable) && (
          <div className="flex shrink-0 items-center">
            {cancellable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel} aria-label={t(`${S}.cancelFile`)}><X className="h-4 w-4" /></Button>
                </TooltipTrigger>
                <TooltipContent>{t(`${S}.cancelFile`)}</TooltipContent>
              </Tooltip>
            )}
            {retryable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRetry} aria-label={t(`${S}.retryFile`)}><RotateCcw className="h-4 w-4" /></Button>
                </TooltipTrigger>
                <TooltipContent>{t(`${S}.retryFile`)}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

type T = (k: string, v?: Record<string, string | number>) => string

/** Label, bar value (number = determinate, null = indeterminate, undefined = no bar), tone and detail line. */
function phase(it: ImportItem, t: T, locale: string): {
  label: string; value: number | null | undefined; tone: BarTone; detail: string; striped?: boolean
} {
  const size = it.bytes_total != null ? formatBytes(it.bytes_total, locale) : null
  switch (it.status) {
    case "queued":
      return { label: t(`${S}.ph.queued`), value: 0, tone: "slate", detail: size ? t(`${S}.waitingSlot`, { size }) : t(`${S}.waitingSlotNoSize`) }
    case "downloading": {
      const parts = [
        it.bytes_total ? `${formatBytes(it.bytes_done, locale)} / ${size}` : formatBytes(it.bytes_done, locale),
        it.speed_bps ? formatSpeed(it.speed_bps, locale) : null,
        it.eta_s != null ? t(`${S}.eta`, { t: formatEta(it.eta_s) }) : null,
        it.attempts > 1 ? t(`${S}.attempt`, { n: it.attempts }) : null,
      ].filter(Boolean)
      return {
        label: it.percent != null ? t(`${S}.ph.downloadingPct`, { p: Math.floor(it.percent) }) : t(`${S}.ph.downloading`),
        value: it.percent ?? null, tone: "primary", striped: true, detail: parts.join(" · "),
      }
    }
    case "uploading_to_storage":
      return { label: t(`${S}.ph.saving`), value: null, tone: "primary", detail: t(`${S}.savingHint`, { size: size ?? formatBytes(it.bytes_done, locale) }) }
    case "queued_for_processing":
      return { label: t(`${S}.ph.queuedProcessing`), value: null, tone: "amber", detail: t(`${S}.queuedProcessingHint`) }
    case "processing": {
      const p = it.job_progress != null ? Math.round(it.job_progress * 100) : null
      return {
        label: p != null ? t(`${S}.ph.processingPct`, { p }) : t(`${S}.ph.processing`), value: p, tone: "blue", striped: true,
        detail: it.job_detections ? t(`${S}.detectionsSoFar`, { n: it.job_detections }) : t(`${S}.processingHint`),
      }
    }
    case "done":
      return { label: t(`${S}.ph.done`), value: 100, tone: "green",
        detail: it.job_id ? t(`${S}.doneHint`, { n: it.job_detections ?? 0 }) : t(`${S}.doneNoJob`) }
    case "failed":
      return { label: t(`${S}.ph.failed`), value: undefined, tone: "red", detail: it.error || t("common.error") }
    case "cancelled":
      return { label: t(`${S}.ph.cancelled`), value: undefined, tone: "slate", detail: t(`${S}.cancelledHint`) }
    case "skipped_duplicate":
      return { label: t(`${S}.ph.skipped`), value: undefined, tone: "slate", detail: t(`${S}.skippedHint`) }
    default:
      return { label: it.status, value: undefined, tone: "slate", detail: "" }
  }
}
