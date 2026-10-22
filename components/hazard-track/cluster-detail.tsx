"use client"

/**
 * Cluster detail pane of the Hazard Track explorer — level 2 of the
 * hierarchy Clusters › Cluster › Detections › Evidence:
 *
 *  breadcrumb "Clusters › HZ-000123" · header (type, readable place, status,
 *  zone, resolve / reopen) · key figures · lifecycle · resolution ·
 *  "Detections of this cluster" (numbered like the map points; each opens
 *  the Evidence viewer) · lifecycle timeline.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  BrainCircuit, CheckCircle2, ChevronRight, Clock, Eye, History, ImageIcon, Layers, Loader2, RotateCcw, Target, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth-provider"
import { StatusBadge as Pill, toneForStatus, type BadgeTone } from "@/components/status-badge"
import { AiBadges } from "@/components/ai-badges"
import {
  ExpiresText, HazardTimeline, RecurringBadge, ResolutionSourceBadge, useHzlLabels, useNow,
} from "@/components/hazard-lifecycle"
import { resolveMinioUrl } from "@/lib/api"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import {
  getHazard, hazardMembers, reopenHazard, resolveHazard, type HazardDetail, type HazardMember,
} from "@/lib/module6-api"
import { CoordsCopy, placeLabel, placeParts, typeMeta, TypeTile, ZoneBadge } from "./shared"

const M6_TONE: Record<string, BadgeTone> = { location_pending: "amber", corrected: "blue", resolved: "slate" }
export const reviewTone = (s: string | null | undefined): BadgeTone => (s && M6_TONE[s]) || toneForStatus(s)

export function ClusterDetail({ id, onBack, onChanged, onLoaded, onOpenDetection, selectedDetectionId, reloadKey }: {
  id: string
  onBack: () => void
  onChanged: () => void
  onLoaded: (h: HazardDetail | null) => void
  onOpenDetection: (id: string) => void
  selectedDetectionId: string | null
  reloadKey?: number
}) {
  const L = useHzlLabels()
  const { t } = L
  const { can } = useAuth()
  const canEdit = can("detections", "edit")
  const now = useNow()
  const [h, setH] = useState<HazardDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"idle" | "resolve" | "reopen">("idle")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [tlKey, setTlKey] = useState(0)
  const [showTimeline, setShowTimeline] = useState(false)

  const load = useCallback(() => {
    setError(null)
    getHazard(id)
      .then((d) => { setH(d); onLoaded(d) })
      .catch((err) => { setError(errorText(t, err, "m6")); onLoaded(null) })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load, reloadKey])

  const act = async () => {
    if (!h) return
    setBusy(true)
    try {
      if (mode === "resolve") await resolveHazard(h.id, text.trim() || undefined)
      else await reopenHazard(h.id, text.trim())
      toast.success(mode === "resolve" ? t("m6.hz.resolvedToast") : t("m6.hz.reopenedToast"))
      setMode("idle")
      setText("")
      load()
      setTlKey((n) => n + 1)
      onChanged()
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    } finally {
      setBusy(false)
    }
  }

  const crumbs = (
    <nav aria-label="breadcrumb" className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
      <ol className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <li><button type="button" onClick={onBack} className="font-medium hover:text-foreground hover:underline">{t("ht.clusters.title")}</button></li>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <li className="truncate font-mono font-semibold text-foreground" aria-current="page">{h?.code ?? "…"}</li>
      </ol>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack} title={t("ht.detail.close")} aria-label={t("ht.detail.close")}>
        <X className="h-4 w-4" />
      </Button>
    </nav>
  )

  if (error) return <div>{crumbs}<p className="p-6 text-sm text-destructive">{error}</p></div>
  if (!h) {
    return (
      <div>
        {crumbs}
        <div className="space-y-3 p-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const members = hazardMembers(h)
  const meta = typeMeta(h.type)
  const active = h.status === "active"
  const place = placeParts(h)

  return (
    <div className="flex flex-col">
      {crumbs}

      {/* Header */}
      <header className="relative overflow-hidden border-b px-4 pb-4 pt-4">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${meta.color}, transparent 60%)` }} />
        <div className="relative flex flex-wrap items-start gap-3">
          <TypeTile type={h.type} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold leading-tight">{L.typeLabel(h.type)}</h3>
              {h.subtype && <span className="text-sm text-muted-foreground">{L.subtypeLabel(h.type, h.subtype)}</span>}
              <Pill tone={active ? "red" : "slate"}>{L.statusLabel(h.status)}</Pill>
              {h.recurring_spot && <RecurringBadge count={h.recurrence_count} />}
              <ZoneBadge h={h} />
            </div>
            <p className="text-base font-medium">
              {place.primary ?? <span className="italic text-muted-foreground">{t("ht.place.unknown")}</span>}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {place.secondary && <span>{place.secondary}</span>}
              {h.district && h.district !== place.secondary && <span>{h.district}</span>}
              {h.region && <span>{h.region}</span>}
              <CoordsCopy lat={h.latitude} lon={h.longitude} />
            </p>
          </div>
          {canEdit && mode === "idle" && (
            active ? (
              <Button size="sm" onClick={() => setMode("resolve")} className="bg-success text-white hover:bg-success/90">
                <CheckCircle2 className="h-4 w-4" />{t("m6.hz.resolve")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setMode("reopen")}><RotateCcw className="h-4 w-4" />{t("m6.hz.reopen")}</Button>
            )
          )}
        </div>

        {canEdit && mode !== "idle" && (
          <div className="relative mt-3 space-y-2 rounded-lg border bg-background p-3">
            <Label htmlFor="ht-act-text">
              {mode === "resolve" ? t("m6.common.noteOptional") : <>{t("m6.act.reopenReason")} <span className="text-destructive">*</span></>}
            </Label>
            <Textarea id="ht-act-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-xs text-muted-foreground">{mode === "resolve" ? t("m6.hz.resolveHint") : t("m6.hz.reopenHint")}</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || (mode === "reopen" && !text.trim())} onClick={act}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "resolve" ? t("m6.hz.resolve") : t("m6.hz.reopen")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setMode("idle"); setText("") }}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}

        {/* Key figures */}
        <dl className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure icon={Layers} label={t("m6.col.detections")} value={h.detection_count} />
          <Figure icon={Target} label={t("m6.col.avgConfidence")} value={L.pct(h.avg_confidence)} hint={`${t("m6.hz.maxConfidence")} ${L.pct(h.max_confidence)}`} />
          <Figure icon={Eye} label={t("hzl.col.lastSeen")} value={h.last_seen_at ? L.ago(h.last_seen_at, now) : "—"} hint={L.fmtDate(h.last_seen_at)} />
          <Figure icon={Clock} label={active ? t("hzl.col.expires") : t("m6.col.resolved")}
            value={active ? (h.expires_at ? <ExpiresText iso={h.expires_at} now={now} className="text-sm font-semibold" /> : t("hzl.never")) : L.fmtShort(h.resolved_at)}
            hint={active ? undefined : h.resolved_by ?? undefined} />
        </dl>
        <p className="relative mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{t("m6.col.firstSeen")}: {L.fmtDate(h.first_detected_at)}</span>
          <span>{t("m6.col.lastSeen")}: {L.fmtDate(h.last_detected_at)}</span>
          <span>{t("m6.hz.radius")}: {h.radius_m != null ? `${Math.round(h.radius_m)} m` : "—"}</span>
          {!!h.absence_count && <span className="text-amber-600 dark:text-amber-400">{t("hzl.absences", { n: h.absence_count })}</span>}
        </p>

        {(h.status === "resolved" || h.resolved_at) && (
          <div className="relative mt-3 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-success" />{t("m6.hz.resolution")}
              <ResolutionSourceBadge source={h.resolution_source} />
            </p>
            <p className="mt-1 text-xs">{t("m6.hz.resolvedBy", { who: h.resolved_by ?? "—", when: L.fmtDate(h.resolved_at) })}</p>
            {h.resolution_note && <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{h.resolution_note}&rdquo;</p>}
          </div>
        )}
      </header>

      {/* Detections of this cluster — visually a level below the cluster */}
      <section aria-labelledby="ht-dets-title" className="px-4 py-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 id="ht-dets-title" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted"><ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /></span>
            {t("ht.detail.detections", { n: members.length })}
          </h4>
        </div>
        <p className="mb-3 pl-8 text-xs text-muted-foreground">{t("ht.detail.detectionsHint")}</p>
        {!members.length ? (
          <p className="pl-8 text-sm text-muted-foreground">{t("m6.hz.noMembers")}</p>
        ) : (
          <ol className="relative ml-3 space-y-2 border-l-2 border-dashed pl-5" style={{ borderColor: `${meta.color}55` }}>
            {members.map((m, i) => (
              <MemberRow key={m.id} m={m} index={i} cluster={h} selected={m.id === selectedDetectionId} onOpen={() => onOpenDetection(m.id)} />
            ))}
          </ol>
        )}
      </section>

      {/* Lifecycle timeline */}
      <section className="border-t px-4 py-4">
        <button type="button" onClick={() => setShowTimeline((v) => !v)} aria-expanded={showTimeline}
          className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" />{t("hzl.tl.title")}</span>
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showTimeline && "rotate-90")} />
        </button>
        {showTimeline && (
          <div className="mt-3">
            <HazardTimeline hazardId={h.id} reloadKey={tlKey} onOpenDetection={onOpenDetection} />
          </div>
        )}
      </section>
    </div>
  )
}

function Figure({ icon: Icon, label, value, hint }: { icon: typeof Layers; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background/70 px-3 py-2" title={hint}>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" />{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function MemberRow({ m, index, cluster, selected, onOpen }: {
  m: HazardMember
  index: number
  cluster: HazardDetail
  selected: boolean
  onOpen: () => void
}) {
  const L = useHzlLabels()
  const { t } = L
  const meta = typeMeta(cluster.type)
  const src = resolveMinioUrl(m.crop_url ?? m.image_url)
  const status = m.review_status ?? m.status ?? "validated"
  const when = m.recorded_at ?? m.captured_at
  const own = placeLabel(m)
  const differs = own && own !== placeLabel(cluster)
  return (
    <li className="relative">
      {/* connector dot on the tree line */}
      <span className="absolute -left-[27px] top-5 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-background text-[9px] font-bold"
        style={{ borderColor: meta.color }} aria-hidden />
      <button type="button" onClick={onOpen} aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full gap-3 rounded-lg border bg-background p-2 text-left transition-colors",
          selected ? "border-primary/60 ring-1 ring-primary/30" : "hover:border-primary/40 hover:bg-accent/30",
        )}>
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
          {src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt="" loading="lazy" className="h-full w-full bg-black object-contain" />
            : <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground/60" /></div>}
          <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1 text-[10px] font-semibold text-white">#{index + 1}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-xs font-medium" title={when ? t("pv.time.recordedHint") : undefined}>
              {when ? L.fmtDate(when) : <span className="text-muted-foreground">{t("ht.det.noTime")}</span>}
            </span>
            <Pill tone={reviewTone(status)} className="text-[10px]">{L.statusLabel(status)}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${Math.round(m.confidence * 100)}%`, background: meta.color }} />
              </span>
              <span className="tabular-nums">{L.pct(m.confidence)}</span>
            </span>
            {m.verifier_score != null && (
              <span className="inline-flex items-center gap-0.5 tabular-nums" title={t("ht.det.verifier")}>
                <BrainCircuit className="h-3 w-3" />{L.pct(m.verifier_score)}
              </span>
            )}
            <span className="font-mono">{m.id.slice(0, 8)}</span>
            {m.reviewed_by && <span>· {m.reviewed_by === "system" ? t("m6.hist.system") : m.reviewed_by}</span>}
          </div>
          <AiBadges d={{ ai_decision: m.ai_decision ?? null, ai_decision_reason: m.ai_decision_reason ?? null, audit_sample: m.audit_sample ?? null }} />
          {m.ai_decision_reason && <p className="line-clamp-1 text-[11px] italic text-muted-foreground">{m.ai_decision_reason}</p>}
          {differs && <p className="truncate text-[11px] text-muted-foreground">{own}</p>}
        </div>
      </button>
    </li>
  )
}
