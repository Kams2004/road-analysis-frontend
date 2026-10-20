"use client"

/**
 * Hazard lifecycle building blocks (spec-module6-hazard-lifecycle.md):
 * relative "expires in" countdowns, resolution-source and recurring-spot
 * badges and the hazard event timeline shown in the Hazard Track drawer.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2, Eye, EyeOff, Hourglass, Loader2, Repeat, RotateCcw, ThumbsDown, ThumbsUp, TimerOff, Video,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { parseApiDate, useM6Labels } from "@/components/m6-shared"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { errorText } from "@/lib/auth-api"
import {
  getHazardEvents, HAZARD_EVENT_KINDS, type HazardEvent, type HazardEventKind, type ResolutionSource,
} from "@/lib/module6-api"

/** Current time, refreshed every `ms` (default 30 s) for live countdowns. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** Lifecycle-specific labels on top of useM6Labels(). */
export function useHzlLabels() {
  const L = useM6Labels()
  const { t, tl } = L
  /** "1 d 3 h", "1 h 20 min", "5 min", "< 1 min". */
  const duration = (ms: number) => {
    const min = Math.floor(Math.abs(ms) / 60_000)
    if (min < 1) return t("hzl.unit.lt1min")
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
    const parts: string[] = []
    if (d) parts.push(t("hzl.unit.d", { n: d }))
    if (h) parts.push(t("hzl.unit.h", { n: h }))
    if (m && !d) parts.push(t("hzl.unit.min", { n: m }))
    return parts.join(" ")
  }
  /** "in 1 h 20 min" / "expired 5 min ago" / "never". */
  const expiresRel = (iso: string | null | undefined, now: number) => {
    if (!iso) return t("hzl.never")
    const diff = parseApiDate(iso).getTime() - now
    return diff >= 0 ? t("hzl.expiresIn", { d: duration(diff) }) : t("hzl.expiredAgo", { d: duration(diff) })
  }
  /** "5 min ago". */
  const ago = (iso: string | null | undefined, now: number) =>
    iso ? t("hzl.ago", { d: duration(now - parseApiDate(iso).getTime()) }) : "—"
  const srcLabel = (s: string) => tl(`hzl.src.${s}`, s.replace(/_/g, " "))
  const kindLabel = (k: string) => tl(`hzl.kind.${k}`, k.replace(/_/g, " "))
  const evSrcLabel = (s: string) => tl(`hzl.evsrc.${s}`, s.replace(/_/g, " "))
  return { ...L, duration, expiresRel, ago, srcLabel, kindLabel, evSrcLabel }
}

const SRC_TONE: Record<ResolutionSource, BadgeTone> = {
  manual: "blue", video_absence: "purple", votes: "orange", expiry: "slate",
}

export function ResolutionSourceBadge({ source, className }: { source: string | null | undefined; className?: string }) {
  const { srcLabel } = useHzlLabels()
  if (!source) return null
  return <Pill tone={SRC_TONE[source as ResolutionSource] ?? "slate"} className={cn("text-[10px]", className)}>{srcLabel(source)}</Pill>
}

/** Small "recurring spot ×N" badge. */
export function RecurringBadge({ count, className }: { count?: number | null; className?: string }) {
  const { t } = useM6Labels()
  return (
    <Badge variant="outline" title={t("hzl.recurringTitle", { n: count ?? 0 })}
      className={cn("gap-0.5 border-violet-500/30 bg-violet-500/10 px-1.5 text-[10px] text-violet-700 dark:text-violet-400", className)}>
      <Repeat className="h-3 w-3" />×{count ?? 0}
    </Badge>
  )
}

/** "in 1 h 20 min" with an amber / red tint when close to or past expiry. */
export function ExpiresText({ iso, now, className }: { iso: string | null | undefined; now: number; className?: string }) {
  const { expiresRel, fmtDate } = useHzlLabels()
  const diff = iso ? parseApiDate(iso).getTime() - now : null
  return (
    <span title={iso ? fmtDate(iso) : undefined} className={cn(
      "text-xs",
      diff == null ? "text-muted-foreground" : diff < 0 ? "text-destructive" : diff < 30 * 60_000 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      className,
    )}>
      {expiresRel(iso, now)}
    </span>
  )
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const KIND_STYLE: Record<HazardEventKind, { Icon: LucideIcon; cls: string }> = {
  seen:             { Icon: Eye,          cls: "text-blue-600 border-blue-500/40 bg-blue-500/10 dark:text-blue-400" },
  not_seen:         { Icon: EyeOff,       cls: "text-amber-600 border-amber-500/40 bg-amber-500/10 dark:text-amber-400" },
  vote_still_there: { Icon: ThumbsUp,     cls: "text-orange-600 border-orange-500/40 bg-orange-500/10 dark:text-orange-400" },
  vote_not_there:   { Icon: ThumbsDown,   cls: "text-violet-600 border-violet-500/40 bg-violet-500/10 dark:text-violet-400" },
  expired:          { Icon: TimerOff,     cls: "text-slate-600 border-slate-500/40 bg-slate-500/10 dark:text-slate-300" },
  resolved:         { Icon: CheckCircle2, cls: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10 dark:text-emerald-400" },
  reopened:         { Icon: RotateCcw,    cls: "text-red-600 border-red-500/40 bg-red-500/10 dark:text-red-400" },
}
const FALLBACK_STYLE = { Icon: Hourglass, cls: "text-muted-foreground" }

/** Keys rendered elsewhere (links, note, header) or not worth showing. */
const SKIP_KEYS = new Set(["code", "source", "note", "by", "job_id", "detection_id", "hazard_id", "user_id"])

function useDetailFormatter() {
  const L = useHzlLabels()
  const { t, tl, pct, statusLabel, subtypeLabel, srcLabel, fmtDate } = L
  const num = (v: number, digits = 0) => v.toLocaleString(L.locale, { maximumFractionDigits: digits })
  return (ev: HazardEvent): string[] => {
    const d = ev.details ?? {}
    const out: string[] = []
    for (const [k, v] of Object.entries(d)) {
      if (v == null || v === "" || SKIP_KEYS.has(k)) continue
      const label = tl(`hzl.d.${k}`, k.replace(/_/g, " "))
      let val: string
      if (k === "distance_m" && typeof v === "number") val = `${num(v)} m`
      else if (k === "speed_kmh" && typeof v === "number") val = `${num(v)} km/h`
      else if (k === "heading_deg" && typeof v === "number") val = `${num(v)}°`
      else if (k === "confidence" && typeof v === "number") val = pct(v)
      else if (k === "review_status" && typeof v === "string") val = statusLabel(v)
      else if (k === "subtype" && typeof v === "string") val = subtypeLabel(String(d.type ?? ""), v) || v
      else if (k === "expiry_hours" && typeof v === "number") val = `${num(v, 1)} h`
      else if (k === "reason" && typeof v === "string") val = tl(`hzl.reason.${v}`, v)
      else if (k === "previous" && typeof v === "object") {
        const p = v as Record<string, unknown>
        const bits = [
          typeof p.resolution_source === "string" ? srcLabel(p.resolution_source) : null,
          typeof p.resolved_by === "string" ? p.resolved_by : null,
          typeof p.resolved_at === "string" ? fmtDate(p.resolved_at) : null,
        ].filter(Boolean)
        if (!bits.length) continue
        val = bits.join(" · ")
      } else if (typeof v === "boolean") val = v ? t("hzl.yes") : t("hzl.no")
      else if (typeof v === "number") val = num(v, 2)
      else if (typeof v === "string") val = v
      else val = JSON.stringify(v)
      out.push(`${label}: ${val}`)
    }
    return out
  }
}

/** Lifecycle events of a hazard, newest first, with optional kind filter chips. */
export function HazardTimeline({ hazardId, reloadKey, onOpenDetection }: {
  hazardId: string
  reloadKey?: number
  onOpenDetection?: (id: string) => void
}) {
  const L = useHzlLabels()
  const { t, fmtDate, kindLabel, evSrcLabel } = L
  const { can } = useAuth()
  const canJobs = can("jobs", "view")
  const fmtDetails = useDetailFormatter()
  const [kinds, setKinds] = useState<HazardEventKind[]>([])
  const [items, setItems] = useState<HazardEvent[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    setItems(null)
    getHazardEvents(hazardId, { kind: kinds, limit: 200 })
      .then((r) => { if (alive) { setItems(r.items); setTotal(r.total) } })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setItems([]) } })
    return () => { alive = false }
  }, [hazardId, kinds, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: HazardEventKind) =>
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {HAZARD_EVENT_KINDS.map((k) => {
          const on = kinds.includes(k)
          const { Icon } = KIND_STYLE[k]
          return (
            <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                on ? KIND_STYLE[k].cls : "text-muted-foreground hover:bg-muted",
              )}>
              <Icon className="h-3 w-3" />{kindLabel(k)}
            </button>
          )
        })}
        {kinds.length > 0 && (
          <button type="button" onClick={() => setKinds([])} className="px-1 text-[11px] text-primary hover:underline">{t("hzl.allKinds")}</button>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p>
        : items == null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : !items.length ? <p className="text-sm text-muted-foreground">{t("hzl.tl.empty")}</p>
            : (
              <ol className="relative space-y-4 border-l pl-5">
                {items.map((ev) => {
                  const st = KIND_STYLE[ev.kind as HazardEventKind] ?? FALLBACK_STYLE
                  const created = parseApiDate(ev.created_at).getTime()
                  const recorded = ev.recorded_at ? parseApiDate(ev.recorded_at).getTime() : null
                  const showLogged = recorded == null || Math.abs(created - recorded) > 60_000
                  const extra = fmtDetails(ev)
                  const d = ev.details ?? {}
                  const note = typeof d.note === "string" && d.note ? d.note : null
                  const by = typeof d.by === "string" && d.by ? d.by : null
                  return (
                    <li key={ev.id} className="relative">
                      <span className={cn("absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border bg-background", st.cls)}>
                        <st.Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium">{kindLabel(ev.kind)}</span>
                        {ev.source && <Badge variant="outline" className="text-[10px]">{evSrcLabel(ev.source)}</Badge>}
                        {by && <span className="text-xs text-muted-foreground">{t("hzl.tl.by", { who: by })}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {recorded != null && <>{t("hzl.tl.recorded")} {fmtDate(ev.recorded_at)}</>}
                        {recorded != null && showLogged && " · "}
                        {showLogged && <>{t("hzl.tl.logged")} {fmtDate(ev.created_at)}</>}
                      </p>
                      {extra.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{extra.join(" · ")}</p>}
                      {note && <p className="mt-0.5 text-xs italic">&ldquo;{note}&rdquo;</p>}
                      {(ev.job_id || ev.detection_id) && (
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          {ev.job_id && (
                            <Link href={canJobs ? `/jobs?job=${ev.job_id}` : `/detections?job_id=${ev.job_id}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline">
                              <Video className="h-3 w-3" />{t("hzl.tl.job", { id: ev.job_id.slice(0, 8) })}
                            </Link>
                          )}
                          {ev.detection_id && onOpenDetection && (
                            <button type="button" onClick={() => onOpenDetection(ev.detection_id!)}
                              className="inline-flex items-center gap-1 text-primary hover:underline">
                              <Eye className="h-3 w-3" />{t("hzl.tl.detection", { id: ev.detection_id.slice(0, 8) })}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
      {items && total > items.length && (
        <p className="text-xs text-muted-foreground">{t("hzl.tl.more", { shown: items.length, total })}</p>
      )}
    </div>
  )
}
