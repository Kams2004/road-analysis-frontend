"use client"

/**
 * Left column of the explorer — the Cluster list: heading "Clusters (N)",
 * active / resolved switch, search, filters (type, place = town / quartier,
 * recurring, resolution, dates), sort, the cluster cards and pagination.
 * Filter state is owned by the page (shared with the overview map).
 */
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, ArrowDownUp, ChevronLeft, ChevronRight, CheckCircle2, Filter, Loader2, MapPin, RotateCcw, Search, Sparkles, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useHzlLabels } from "@/components/hazard-lifecycle"
import { cn } from "@/lib/utils"
import { DETECTION_TYPES, RESOLUTION_SOURCES, type Hazard, type HazardPlace } from "@/lib/module6-api"
import { ClusterCard } from "./cluster-card"
import { TypeTile } from "./shared"

export type ClusterStatus = "active" | "resolved"

export interface ClusterFilters {
  search: string
  type: string
  /** "" | "t:<town>" | "l:<town>\u0000<locality>" */
  place: string
  recurring: string
  resolution: string
  dateFrom: string
  dateTo: string
}

export const EMPTY_CLUSTER_FILTERS: ClusterFilters = {
  search: "", type: "all", place: "", recurring: "all", resolution: "all", dateFrom: "", dateTo: "",
}

export const SORTS = ["-last_detected_at", "-detection_count", "-avg_confidence", "expires_at", "-code"] as const

/** town / locality query params of a place filter value. */
export function placeQuery(place: string): { town?: string; locality?: string } {
  if (place.startsWith("t:")) return { town: place.slice(2) }
  if (place.startsWith("l:")) {
    const [town, locality] = place.slice(2).split("\u0000")
    return { town, locality }
  }
  return {}
}

export function ClusterList(props: {
  status: ClusterStatus
  onStatus: (s: ClusterStatus) => void
  counts: { active: number | null; resolved: number | null }
  filters: ClusterFilters
  onFilter: (k: keyof ClusterFilters, v: string) => void
  onReset: () => void
  places: HazardPlace[]
  sort: string
  onSort: (s: string) => void
  items: Hazard[]
  total: number
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  onPage: (p: number) => void
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  now: number
  className?: string
}) {
  const L = useHzlLabels()
  const { t } = L
  const { filters: f, onFilter } = props
  const [more, setMore] = useState(!!(f.dateFrom || f.dateTo || f.recurring !== "all" || f.resolution !== "all"))
  const activeFilters = [f.type !== "all", !!f.place, f.recurring !== "all", f.resolution !== "all", !!f.dateFrom, !!f.dateTo]
    .filter(Boolean).length
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize))
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Keep the selected / map-hovered card in view.
  useEffect(() => {
    const id = props.hoveredId ?? props.selectedId
    if (id) refs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [props.hoveredId, props.selectedId])

  return (
    <section aria-labelledby="ht-clusters-title" className={cn("flex min-h-0 flex-col", props.className)}>
      {/* Heading */}
      <div className="space-y-3 border-b px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="ht-clusters-title" className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="h-4 w-4" /></span>
            {t("ht.clusters.title")}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{props.total}</span>
          </h2>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium" role="tablist" aria-label={t("common.status")}>
            {(["active", "resolved"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={props.status === s} onClick={() => props.onStatus(s)}
                className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
                  props.status === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {s === "active" ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {t(`ht.status.${s}`)}
                {props.counts[s] != null && <span className="tabular-nums opacity-70">{props.counts[s]}</span>}
              </button>
            ))}
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{t("ht.clusters.hint")}
        </p>

        {/* Search + filters */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={f.search} onChange={(e) => onFilter("search", e.target.value)} className="h-9 pl-8"
            placeholder={t("ht.filter.search")} aria-label={t("ht.filter.search")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={f.type} onValueChange={(v) => onFilter("type", v)}>
            <SelectTrigger className="h-9 w-full" aria-label={t("m6.filter.type")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("pmap.val.allTypes")}</SelectItem>
              {DETECTION_TYPES.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  <span className="flex items-center gap-2"><TypeTile type={ty} size="sm" className="h-5 w-5" />{L.typeLabel(ty)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={f.place || "all"} onValueChange={(v) => onFilter("place", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-full" aria-label={t("ht.filter.place")}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">{t("ht.filter.allPlaces")}</SelectItem>
              {props.places.map((p) => (
                <SelectGroup key={p.town}>
                  <SelectLabel className="text-[11px] uppercase tracking-wide">{p.town}</SelectLabel>
                  <SelectItem value={`t:${p.town}`}>{t("ht.filter.wholeTown", { town: p.town })} ({p.count})</SelectItem>
                  {p.localities.map((l) => (
                    <SelectItem key={l.name} value={`l:${p.town}\u0000${l.name}`}>
                      <span className="pl-2">{l.name} ({l.count})</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.sort} onValueChange={props.onSort}>
            <SelectTrigger className="h-9 w-full" aria-label={t("ht.sort.label")}>
              <span className="flex items-center gap-1.5 truncate"><ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue /></span>
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s} value={s}>{t(`ht.sort.${s.replace("-", "")}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button variant={more ? "secondary" : "outline"} size="sm" className="h-9 flex-1" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              <Filter className="h-3.5 w-3.5" />{t("ht.filter.more")}
              {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilters}</span>}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={props.onReset} title={t("m6.filter.reset")} aria-label={t("m6.filter.reset")}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {more && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-2">
            <Select value={f.recurring} onValueChange={(v) => onFilter("recurring", v)}>
              <SelectTrigger className="h-9 w-full" aria-label={t("hzl.filter.recurring")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("hzl.filter.recurringAll")}</SelectItem>
                <SelectItem value="yes">{t("hzl.filter.recurringOnly")}</SelectItem>
                <SelectItem value="no">{t("hzl.filter.recurringNot")}</SelectItem>
              </SelectContent>
            </Select>
            {props.status === "resolved" ? (
              <Select value={f.resolution} onValueChange={(v) => onFilter("resolution", v)}>
                <SelectTrigger className="h-9 w-full" aria-label={t("hzl.filter.resolution")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hzl.filter.anyResolution")}</SelectItem>
                  {RESOLUTION_SOURCES.map((r) => <SelectItem key={r} value={r}>{L.srcLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <span />}
            <div className="space-y-1">
              <Label htmlFor="ht-from" className="text-[11px] text-muted-foreground">{t("m6.filter.from")}</Label>
              <Input id="ht-from" type="date" className="h-9" value={f.dateFrom} onChange={(e) => onFilter("dateFrom", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ht-to" className="text-[11px] text-muted-foreground">{t("m6.filter.to")}</Label>
              <Input id="ht-to" type="date" className="h-9" value={f.dateTo} onChange={(e) => onFilter("dateTo", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {props.error && <p className="px-4 pt-3 text-sm text-destructive">{props.error}</p>}

      {/* Cards */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3" aria-busy={props.loading}>
        {props.loading && !props.items.length ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[98px] w-full rounded-xl" />)
        ) : !props.items.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><AlertTriangle className="h-6 w-6 text-muted-foreground/60" /></span>
            <p className="text-sm font-medium">{t(`m6.hz.empty.${props.status}`)}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("ht.clusters.emptyHint")}</p>
          </div>
        ) : (
          <>
            {props.loading && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
            {props.items.map((h) => (
              <ClusterCard key={h.id} ref={(el) => { refs.current[h.id] = el }} h={h} now={props.now}
                selected={h.id === props.selectedId} hovered={h.id === props.hoveredId}
                onSelect={() => props.onSelect(h.id)} onHover={(on) => props.onHover(on ? h.id : null)} />
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {props.total === 0 ? "0" : `${(props.page - 1) * props.pageSize + 1}–${Math.min(props.total, props.page * props.pageSize)}`} / {props.total}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}
            aria-label={t("m6.common.prev")} title={t("m6.common.prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 tabular-nums">{props.page} / {pages}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={props.page >= pages} onClick={() => props.onPage(props.page + 1)}
            aria-label={t("m6.common.next")} title={t("m6.common.next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
