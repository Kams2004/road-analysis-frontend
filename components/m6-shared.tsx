"use client"

/**
 * Building blocks shared by the Validations and Hazard Track screens
 * (Module 6): labels, status badges, evidence frame with the bounding box
 * drawn on it, history timeline, pagination and sortable headers.
 */
import { useState } from "react"
import {
  ArrowDown, ArrowUp, ArrowUpDown, Bot, ChevronLeft, ChevronRight, ImageIcon, Maximize, User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useImageLightbox } from "@/components/image-lightbox"
import { Button } from "@/components/ui/button"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { signLabel, useI18n } from "@/lib/i18n"
import { resolveMinioUrl } from "@/lib/api"
import type { DetectionReview, LocationStatus, M6Detection } from "@/lib/module6-api"

/** Parse an API timestamp; naive values are UTC. */
export function parseApiDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

export function useM6Labels() {
  const { t, locale, lang } = useI18n()
  const tl = (key: string, raw: string) => { const s = t(key); return s === key ? raw : s }
  const typeLabel = (type: string) => tl(`pmap.type.${type}`, type.replace(/_/g, " "))
  const subtypeLabel = (type: string, sub: string | null | undefined) => {
    if (sub == null || sub === "") return ""
    if (type === "pothole" && /^[0-3]$/.test(sub)) return tl(`pmap.val.sev${sub}`, sub)
    if (type === "traffic_sign") return signLabel(sub, lang)
    return tl(`pmap.label.${sub}`, sub.replace(/_/g, " "))
  }
  const statusLabel = (s: string) => tl(`m6.status.${s}`, s)
  const locStatusLabel = (s: string) => tl(`m6.loc.${s}`, s)
  const locSourceLabel = (s: string) => tl(`m6.src.${s}`, s)
  const actionLabel = (a: string) => tl(`m6.action.${a}`, a)
  const fmtDate = (iso: string | null | undefined) =>
    iso ? parseApiDate(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—"
  const fmtShort = (iso: string | null | undefined) =>
    iso ? parseApiDate(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`)
  return { t, locale, lang, tl, typeLabel, subtypeLabel, statusLabel, locStatusLabel, locSourceLabel, actionLabel, fmtDate, fmtShort, pct }
}

export const STATUS_COLORS: Record<string, string> = {
  location_pending: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  pending:          "bg-warning/20 text-warning border-warning/30",
  validated:        "bg-success/20 text-success border-success/30",
  corrected:        "bg-info/15 text-info border-info/30",
  rejected:         "bg-destructive/15 text-destructive border-destructive/30",
  resolved:         "bg-muted text-muted-foreground border-border",
  active:           "bg-destructive/15 text-destructive border-destructive/30",
}

const LOC_COLORS: Record<LocationStatus, string> = {
  confirmed:   "bg-success/15 text-success border-success/30",
  approximate: "bg-warning/20 text-warning border-warning/30",
  missing:     "bg-destructive/15 text-destructive border-destructive/30",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { statusLabel } = useM6Labels()
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_COLORS[status], className)}>
      {statusLabel(status)}
    </Badge>
  )
}

export function LocationBadge({ status, source }: { status: LocationStatus | null | undefined; source?: string | null }) {
  const { locStatusLabel, locSourceLabel } = useM6Labels()
  const st = status ?? "missing"
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline" className={cn("whitespace-nowrap", LOC_COLORS[st])}>{locStatusLabel(st)}</Badge>
      {source && source !== "none" && (
        <span className="text-xs text-muted-foreground">{locSourceLabel(source)}</span>
      )}
    </span>
  )
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-14 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
      <span className="text-sm tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  )
}

/** Small thumbnail; clicking it opens the in-app lightbox (not the row). */
export function Thumb({ url, className }: { url: string | null; className?: string }) {
  const src = resolveMinioUrl(url)
  const lightbox = useImageLightbox()
  const { t } = useI18n()
  if (!src) {
    return (
      <div className={cn("relative h-12 w-16 overflow-hidden rounded bg-muted", className)}>
        <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
      </div>
    )
  }
  return (
    <button type="button" title={t("pmap.map.openImage")} aria-label={t("pmap.map.openImage")}
      onClick={(e) => { e.stopPropagation(); lightbox.open({ src }) }}
      className={cn("relative block h-12 w-16 cursor-zoom-in overflow-hidden rounded bg-muted ring-primary/50 hover:ring-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
    </button>
  )
}

/** Annotated frame with the detection's bounding box (pixel coords) overlaid. */
export function EvidenceFrame({ d }: { d: Pick<M6Detection, "image_url" | "bbox_x1" | "bbox_y1" | "bbox_x2" | "bbox_y2"> }) {
  const { t } = useI18n()
  const lightbox = useImageLightbox()
  const src = resolveMinioUrl(d.image_url)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [showBox, setShowBox] = useState(true)
  const hasBox = d.bbox_x1 != null && d.bbox_y1 != null && d.bbox_x2 != null && d.bbox_y2 != null
  const openFull = () => lightbox.open({
    src, title: t("m6.ev.frame"),
    bbox: hasBox && showBox ? { x1: d.bbox_x1!, y1: d.bbox_y1!, x2: d.bbox_x2!, y2: d.bbox_y2! } : null,
  })
  if (!src) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <ImageIcon className="h-12 w-12 text-muted-foreground" />
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="group relative overflow-hidden rounded-lg bg-black/90">
        {/* Wrapper sized to the image so % positions map to pixels. */}
        <div className="relative mx-auto w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={t("m6.ev.frame")}
            onClick={() => openFull()}
            className="block max-h-[22rem] w-auto max-w-full cursor-zoom-in"
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {hasBox && size && showBox && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-red-500 shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
              style={{
                left: `${(d.bbox_x1! / size.w) * 100}%`,
                top: `${(d.bbox_y1! / size.h) * 100}%`,
                width: `${((d.bbox_x2! - d.bbox_x1!) / size.w) * 100}%`,
                height: `${((d.bbox_y2! - d.bbox_y1!) / size.h) * 100}%`,
              }}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => openFull()}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 focus:opacity-100"
          title={t("pmap.val.fullScreen")}
          aria-label={t("pmap.val.fullScreen")}
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>
      {hasBox && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showBox} onChange={(e) => setShowBox(e.target.checked)} />
          {t("m6.ev.showBox")}
          <span className="font-mono">
            [{Math.round(d.bbox_x1!)}, {Math.round(d.bbox_y1!)}, {Math.round(d.bbox_x2!)}, {Math.round(d.bbox_y2!)}]
          </span>
        </label>
      )}
    </div>
  )
}

/** Review history, newest first. */
export function HistoryTimeline({ items }: { items: DetectionReview[] }) {
  const { t, tl, statusLabel, actionLabel, fmtDate, subtypeLabel } = useM6Labels()
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("m6.hist.empty")}</p>
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((h) => {
        const details = h.details ?? {}
        const extra: string[] = []
        const d = details as Record<string, unknown>
        if (d.previous_type || d.new_type) extra.push(`${d.previous_type ?? "?"}${d.previous_subtype ? `/${subtypeLabel(String(d.previous_type ?? ""), String(d.previous_subtype))}` : ""} → ${d.new_type ?? "?"}${d.new_subtype ? `/${subtypeLabel(String(d.new_type ?? ""), String(d.new_subtype))}` : ""}`)
        if (d.new_latitude != null || d.latitude != null) {
          const fmt = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? `${a.toFixed(5)}, ${b.toFixed(5)}` : "—")
          extra.push(`${fmt(d.previous_latitude, d.previous_longitude)} → ${fmt(d.new_latitude ?? d.latitude, d.new_longitude ?? d.longitude)}`)
        }
        if (typeof d.method === "string") extra.push(t("m6.hist.method", { method: d.method }))
        if (typeof d.reason_code === "string") extra.push(t("m6.hist.reason", { reason: tl(`rej.code.${d.reason_code}`, d.reason_code) }))
        return (
          <li key={h.id} className="relative">
            <span className={cn(
              "absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background",
              h.actor_type === "system" ? "text-muted-foreground" : "text-primary",
            )}>
              {h.actor_type === "system" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium">{actionLabel(h.action)}</span>
              {h.from_status && <span className="text-xs text-muted-foreground">{statusLabel(h.from_status)} →</span>}
              <StatusBadge status={h.to_status} className="text-[10px]" />
            </div>
            <p className="text-xs text-muted-foreground">
              {h.actor_type === "system" ? t("m6.hist.system") : (h.actor ?? "—")} · {fmtDate(h.created_at)}
            </p>
            {extra.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{extra.join(" · ")}</p>}
            {h.note && <p className="mt-0.5 text-xs italic">&ldquo;{h.note}&rdquo;</p>}
          </li>
        )
      })}
    </ol>
  )
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{t("m6.common.total", { n: total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}
          aria-label={t("m6.common.prev")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">{t("common.page", { page, pages: Math.max(1, pages) })}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => onPage(page + 1)}
          aria-label={t("m6.common.next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/** Header cell toggling `sort` between `key` and `-key`. */
export function SortHead({ label, k, sort, onSort, className }: {
  label: string; k: string; sort: string; onSort: (s: string) => void; className?: string
}) {
  const active = sort === k || sort === `-${k}`
  const desc = sort === `-${k}`
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp
  return (
    <TableHead className={className} aria-sort={active ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(active && desc ? k : `-${k}`)}>
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  )
}

/** Small "label / value" cell for detail grids. */
export function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}
