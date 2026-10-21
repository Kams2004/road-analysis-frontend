"use client"

/**
 * One cluster (hazard) of the Cluster list: type tile + colour accent, code,
 * readable place, detection count, last seen / expiry, confidence, status
 * badges and the thumbnail of its best evidence.
 */
import { forwardRef } from "react"
import { Clock, ImageIcon, Layers } from "lucide-react"
import { resolveMinioUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Hazard } from "@/lib/module6-api"
import { ExpiresText, RecurringBadge, ResolutionSourceBadge, useHzlLabels } from "@/components/hazard-lifecycle"
import { pendingOf, useMemberCountsText } from "@/components/cluster-review"
import { placeParts, typeMeta, TypeTile, ZoneBadge } from "./shared"

export const ClusterCard = forwardRef<HTMLButtonElement, {
  h: Hazard
  selected: boolean
  hovered: boolean
  now: number
  onSelect: () => void
  onHover: (on: boolean) => void
}>(function ClusterCard({ h, selected, hovered, now, onSelect, onHover }, ref) {
  const L = useHzlLabels()
  const { t } = L
  const meta = typeMeta(h.type)
  const place = placeParts(h)
  const cover = resolveMinioUrl(h.cover_crop_url ?? h.cover_image_url ?? null)
  const memberText = useMemberCountsText()
  const active = h.status === "active"
  const toReview = pendingOf(h)
  const seen = h.last_seen_at ?? h.last_detected_at
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full gap-3 overflow-hidden rounded-xl border bg-card p-3 pl-4 text-left shadow-sm transition-all",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']", meta.accent,
        !active && "before:opacity-40",
        selected
          ? "border-primary/60 bg-primary/[0.04] ring-2 ring-primary/30"
          : hovered
            ? "border-primary/40 shadow-md"
            : "hover:border-primary/30 hover:shadow-md",
      )}
    >
      {/* Thumbnail of the best evidence */}
      <div className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-muted">
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground/60" /></div>}
        <span className="absolute bottom-1 left-1"><TypeTile type={h.type} size="sm" className="bg-background/90 shadow-sm" /></span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold">{L.typeLabel(h.type)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{h.code}</span>
            </p>
            {h.subtype && <p className="truncate text-[11px] text-muted-foreground">{L.subtypeLabel(h.type, h.subtype)}</p>}
          </div>
          <span className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset",
            active ? "bg-primary/10 text-primary ring-primary/25" : "bg-muted text-muted-foreground ring-border",
          )} title={t("ht.card.detectionsTitle")}>
            <Layers className="h-3 w-3" />{h.detection_count}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground/90">
            {place.primary ?? <span className="italic font-normal text-muted-foreground">{t("ht.place.unknown")}</span>}
          </p>
          {place.secondary && <p className="truncate text-xs text-muted-foreground">{place.secondary}</p>}
        </div>

        {h.member_counts && <p className="truncate text-[11px] text-muted-foreground">{memberText(h)}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {seen && (
            <span className="inline-flex items-center gap-1" title={L.fmtDate(seen)}>
              <Clock className="h-3 w-3" />{L.ago(seen, now)}
            </span>
          )}
          {active
            ? <ExpiresText iso={h.expires_at} now={now} className="text-[11px]" />
            : <span>{t("ht.card.resolvedOn", { when: L.fmtShort(h.resolved_at) })}</span>}
          {h.avg_confidence != null && (
            <span className="inline-flex items-center gap-1" title={t("m6.col.avgConfidence")}>
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${Math.round(h.avg_confidence * 100)}%`, background: meta.color }} />
              </span>
              <span className="tabular-nums">{L.pct(h.avg_confidence)}</span>
            </span>
          )}
        </div>

        {(h.recurring_spot || h.resolution_source || !!h.absence_count || h.cluster_zone_name || h.cluster_environment || (active && toReview > 0)) && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {active && toReview > 0 && (
              <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-inset ring-orange-500/25 dark:text-orange-400">
                {t("cr.card.toReview", { n: toReview })}
              </span>
            )}
            {h.recurring_spot && <RecurringBadge count={h.recurrence_count} />}
            {!active && h.resolution_source && <ResolutionSourceBadge source={h.resolution_source} />}
            {active && !!h.absence_count && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-400">
                {t("hzl.absences", { n: h.absence_count })}
              </span>
            )}
            <ZoneBadge h={h} />
          </div>
        )}
      </div>
    </button>
  )
})
