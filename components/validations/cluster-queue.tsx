"use client"

/**
 * Validations › "Group by cluster" (cluster-first review): one card per
 * hazard (candidate or confirmed) that still has unreviewed detections, from
 * GET /hazards/review-queue — cover image, code, candidate / confirmed badge,
 * type, members to review, max confidence, place, first / last seen — with
 * Accept cluster / Reject cluster and "Open individually" (expands the member
 * detections; each opens the per-detection review panel).
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowDownUp, ChevronDown, Clock, ExternalLink, ImageIcon, Layers, Loader2, MapPinned, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { TablePagination } from "@/components/table-pagination"
import { ConfidenceBar, LocationBadge, Thumb, useM6Labels } from "@/components/m6-shared"
import { AiBadges } from "@/components/ai-badges"
import { StatusBadge as Pill, toneForStatus, type BadgeTone } from "@/components/status-badge"
import { ClusterDecisionButtons, HazardStatusBadge, memberCounts } from "@/components/cluster-review"
import { placeParts, TypeTile, typeMeta } from "@/components/hazard-track/shared"
import { resolveMinioUrl } from "@/lib/api"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import {
  getReviewQueue, REVIEW_QUEUE_SORTS, type ClusterDecision, type Hazard, type M6Detection, type ReviewQueueItem,
} from "@/lib/module6-api"

const M6_TONE: Record<string, BadgeTone> = { location_pending: "amber", corrected: "blue", resolved: "slate" }
const tone = (s: string | null | undefined): BadgeTone => (s && M6_TONE[s]) || toneForStatus(s)

export function ClusterQueue({ type, search, reloadKey, canEdit, onOpenDetection, onDecided, onUnclustered, onFocus }: {
  type: string
  search: string
  reloadKey: number
  canEdit: boolean
  /** Open a member in the per-detection review panel (siblings = the cluster's members shown). */
  onOpenDetection: (d: M6Detection, siblings: M6Detection[]) => void
  onDecided: (r: ClusterDecision) => void
  /** Number of unreviewed detections without a hazard (from the same response). */
  onUnclustered?: (n: number) => void
  /** Show every unreviewed member of one cluster in the per-detection queue. */
  onFocus: (hazard: Hazard) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const [sort, setSort] = useState<string>("-pending_count")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [total, setTotal] = useState(0)
  const [candidates, setCandidates] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { setPage(1) }, [type, search])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getReviewQueue({
      type: type === "all" ? undefined : type,
      search: search.trim() || undefined,
      sort,
      skip: (page - 1) * pageSize,
      limit: pageSize,
      members: 12,
    })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setTotal(r.total)
        setCandidates(r.candidates)
        onUnclustered?.(r.unclustered)
      })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setItems([]); setTotal(0) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [type, search, sort, page, pageSize, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setExpanded((cur) => {
    const n = new Set(cur)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <section aria-labelledby="cq-title" className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div>
          <h2 id="cq-title" className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />{t("cr.q.title")}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{total}</span>
            {candidates != null && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400"
                title={t("cr.hs.candidate.title")}>
                {t("cr.q.candidates", { n: candidates })}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">{t("cr.q.hint")}</p>
        </div>
        <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label={t("m6.filter.sort")}>
            <span className="flex items-center gap-1.5 truncate"><ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            {REVIEW_QUEUE_SORTS.map((s) => <SelectItem key={s} value={s}>{t(`cr.q.sort.${s.replace("-", "")}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="px-4 pb-2 text-sm text-destructive">{error}</p>}

      <div className="space-y-2 bg-muted/30 p-3" aria-busy={loading}>
        {loading && !items.length ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : !items.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("cr.q.empty")}</p>
        ) : (
          <>
            {loading && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
            {items.map((it) => (
              <ClusterRow key={it.hazard.id} item={it} canEdit={canEdit} open={expanded.has(it.hazard.id)}
                onToggle={() => toggle(it.hazard.id)} onOpenDetection={onOpenDetection} onDecided={onDecided}
                onFocus={() => onFocus(it.hazard)} />
            ))}
          </>
        )}
      </div>

      {total > 0 && (
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1) }} />
      )}
    </section>
  )
}

function ClusterRow({ item, canEdit, open, onToggle, onOpenDetection, onDecided, onFocus }: {
  item: ReviewQueueItem
  canEdit: boolean
  open: boolean
  onToggle: () => void
  onOpenDetection: (d: M6Detection, siblings: M6Detection[]) => void
  onDecided: (r: ClusterDecision) => void
  onFocus: () => void
}) {
  const L = useM6Labels()
  const { t } = L
  const h = item.hazard
  const dets = item.detections ?? []
  const meta = typeMeta(h.type)
  const cover = resolveMinioUrl(h.cover_crop_url ?? h.cover_image_url ?? dets[0]?.crop_url ?? dets[0]?.image_url ?? null)
  const place = placeParts(h)
  const m = memberCounts(h)
  const pending = h.member_counts ? m.pending : dets.filter((d) => d.review_status === "pending").length
  const locPending = h.member_counts ? m.location_pending : dets.filter((d) => d.review_status === "location_pending").length
  const toReview = pending + locPending
  const reviewed = m.validated + m.corrected
  const candidate = h.status === "candidate"
  // Queue items from the review queue carry no `cluster`: attach it so the panel shows the CL-/HZ- code.
  const withCluster = (d: M6Detection): M6Detection => d.cluster ? d : {
    ...d, cluster: { hazard_id: h.id, hazard_code: h.code, detection_count: h.detection_count, status: h.status, confirmed: h.confirmed ?? !candidate },
  }
  const members = dets.map(withCluster)
  const maxConf = h.max_confidence ?? (dets.length ? Math.max(...dets.map((d) => d.confidence)) : null)

  return (
    <article className={cn(
      "relative overflow-hidden rounded-xl border bg-card shadow-sm",
      "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']", meta.accent,
    )}>
      <div className="flex flex-col gap-3 p-3 pl-4 sm:flex-row">
        <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-32">
          {cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground/60" /></div>}
          <span className="absolute bottom-1 left-1"><TypeTile type={h.type} size="sm" className="bg-background/90 shadow-sm" /></span>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{L.typeLabel(h.type)}</span>
            {h.subtype && <span className="text-xs text-muted-foreground">{L.subtypeLabel(h.type, h.subtype)}</span>}
            <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
            <HazardStatusBadge status={h.status} className="text-[10px]" />
          </div>
          <p className="truncate text-sm">
            {place.primary ?? <span className="italic text-muted-foreground">{t("ht.place.unknown")}</span>}
            {place.secondary && <span className="text-muted-foreground"> · {place.secondary}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Layers className="h-3.5 w-3.5" />{t("cr.q.toReview", { n: toReview })}
            </span>
            {(pending > 0 || locPending > 0) && (
              <span>{t("cr.q.split", { p: pending, l: locPending })}</span>
            )}
            {reviewed > 0 && <span>{t("cr.mc.validated", { n: reviewed })}</span>}
            {maxConf != null && (
              <span className="inline-flex items-center gap-1" title={t("m6.hz.maxConfidence")}>
                <Target className="h-3.5 w-3.5" />{t("cr.q.maxConf", { v: L.pct(maxConf) })}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />{L.fmtShort(h.first_detected_at)} → {L.fmtShort(h.last_detected_at)}
            </span>
          </div>
          {candidate && <p className="text-[11px] text-muted-foreground">{t("cr.q.candidateHint")}</p>}
          {h.status === "active" && <p className="text-[11px] text-muted-foreground">{t("cr.q.confirmedHint")}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canEdit && <ClusterDecisionButtons hazard={h} onDone={onDecided} />}
            <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={open}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />{t("cr.q.openIndividually")}
            </Button>
            {!candidate && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/detections?hazard=${h.id}`}>
                  <MapPinned className="h-4 w-4" />{t("cr.q.openTrack")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t bg-background/60 px-3 py-2">
          {!dets.length ? (
            <p className="py-2 text-center text-xs text-muted-foreground">{t("cr.q.noMembers")}</p>
          ) : (
            <ul className="divide-y">
              {members.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => onOpenDetection(d, members)}
                    className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-muted/50">
                    <Thumb url={d.crop_url ?? d.image_url} className="h-9 w-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">{d.id.slice(0, 8)}</span>
                        <span>{L.fmtShort(d.recorded_at ?? d.captured_at ?? d.created_at)}</span>
                        <LocationBadge status={d.location_status} />
                      </div>
                      <AiBadges d={d} className="mt-0.5" />
                    </div>
                    <div className="hidden sm:block"><ConfidenceBar value={d.confidence} /></div>
                    <Pill tone={tone(d.review_status)} className="text-[10px]">{L.statusLabel(d.review_status)}</Pill>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {toReview > dets.length && (
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
              {t("cr.q.moreMembers", { shown: dets.length, n: toReview })}{" "}
              <button type="button" className="text-primary hover:underline" onClick={onFocus}>{t("cr.q.showAll")}</button>
            </p>
          )}
        </div>
      )}
    </article>
  )
}
