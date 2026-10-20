"use client"

/**
 * "All detections" — the flat list of every detection, whatever its
 * cluster or review status, kept apart from the cluster explorer. Clicking
 * a row opens the Evidence viewer; the cluster code opens that cluster.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, List, Loader2, RotateCcw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { StatusBadge as Pill } from "@/components/status-badge"
import { ConfidenceBar, LocationBadge, SortHead, Thumb, useM6Labels } from "@/components/m6-shared"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import { DETECTION_TYPES, listDetections, type M6Detection } from "@/lib/module6-api"
import { placeParts, TypeTile, useDebounced } from "./shared"
import { reviewTone } from "./cluster-detail"

interface Filters { search: string; type: string; status: string; town: string; dateFrom: string; dateTo: string }
const EMPTY: Filters = { search: "", type: "all", status: "all", town: "", dateFrom: "", dateTo: "" }

export function AllDetectionsView({ jobId, onClearJob, onOpenDetection, onOpenCluster, reloadKey }: {
  jobId: string | null
  onClearJob: () => void
  onOpenDetection: (id: string, pageIds: string[]) => void
  onOpenCluster: (hazardId: string) => void
  reloadKey?: number
}) {
  const L = useM6Labels()
  const { t } = L
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const debounced = useDebounced(filters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState("-created_at")
  const [items, setItems] = useState<M6Detection[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setF = (k: keyof Filters, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const f = debounced
    listDetections({
      type: f.type, review_status: f.status, town: f.town.trim() || undefined,
      date_from: f.dateFrom || undefined, date_to: f.dateTo || undefined, search: f.search.trim() || undefined,
      job_id: jobId ?? undefined, sort, skip: (page - 1) * pageSize, limit: pageSize,
    })
      .then((r) => { if (alive) { setItems(r.items); setTotal(r.total) } })
      .catch((err) => { if (alive) { setError(errorText(t, err, "m6")); setItems([]); setTotal(0) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [debounced, page, pageSize, sort, jobId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const ids = items.map((d) => d.id)
  return (
    <section aria-labelledby="ht-flat-title">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id="ht-flat-title" className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><List className="h-4 w-4" /></span>
            {t("ht.flat.title")}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{total}</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("ht.flat.hint")}</p>
        </div>
      </div>
      <DataToolbar
        search={filters.search}
        onSearch={(v) => setF("search", v)}
        placeholder={t("ht.filter.searchDetections")}
        actions={<Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilters(EMPTY); setPage(1) }}><RotateCcw className="h-3.5 w-3.5" />{t("m6.filter.reset")}</Button>}
      >
        <Select value={filters.type} onValueChange={(v) => setF("type", v)}>
          <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("m6.filter.type")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pmap.val.allTypes")}</SelectItem>
            {DETECTION_TYPES.map((ty) => <SelectItem key={ty} value={ty}>{L.typeLabel(ty)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setF("status", v)}>
          <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("common.status")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pmap.val.allStatus")}</SelectItem>
            {["location_pending", "pending", "validated", "corrected", "rejected", "resolved"].map((s) => (
              <SelectItem key={s} value={s}>{L.statusLabel(s)}</SelectItem>
            ))}
            <SelectItem value="validated,corrected">{t("m6.status.accepted")}</SelectItem>
          </SelectContent>
        </Select>
        <Input className="h-9 w-full sm:w-32" placeholder={t("ht.filter.town")} value={filters.town} onChange={(e) => setF("town", e.target.value)} aria-label={t("ht.filter.town")} />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ad-from" className="shrink-0 text-xs text-muted-foreground">{t("m6.filter.from")}</Label>
          <Input id="ad-from" type="date" className="h-9 w-36" value={filters.dateFrom} onChange={(e) => setF("dateFrom", e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ad-to" className="shrink-0 text-xs text-muted-foreground">{t("m6.filter.to")}</Label>
          <Input id="ad-to" type="date" className="h-9 w-36" value={filters.dateTo} onChange={(e) => setF("dateTo", e.target.value)} />
        </div>
      </DataToolbar>

      {jobId && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <Badge variant="secondary" className="gap-1 py-1 pl-2.5 pr-1 text-xs">
            {t("m6.hz.jobChip", { id: jobId.slice(0, 8) })}
            <button type="button" onClick={onClearJob} aria-label={t("m6.hz.jobChipRemove")} title={t("m6.hz.jobChipRemove")}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"><X className="h-3 w-3" /></button>
          </Badge>
        </div>
      )}
      {error && <p className="px-4 pt-3 text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-16 pl-4">{t("pmap.val.thFrame")}</TableHead>
            <SortHead label={t("pmap.val.thType")} k="type" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
            <SortHead label={t("pmap.val.thConfidence")} k="confidence" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
            <TableHead className="hidden md:table-cell">{t("pmap.val.thLocation")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("ht.flat.cluster")}</TableHead>
            <SortHead className="hidden xl:table-cell" label={t("pmap.val.captured")} k="captured_at" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
            <SortHead className="hidden sm:table-cell" label={t("m6.col.detectedAt")} k="created_at" sort={sort} onSort={(s) => { setSort(s); setPage(1) }} />
            <TableHead className="pr-4">{t("common.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
          ) : !items.length ? (
            <TableRow><TableCell colSpan={8} className="h-32 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">{t("ops.det.empty")}</p>
            </TableCell></TableRow>
          ) : items.map((d) => {
            const place = placeParts(d)
            return (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpenDetection(d.id, ids)}>
                <TableCell className="py-1.5 pl-4"><Thumb url={d.crop_url ?? d.image_url} className="h-9 w-12" /></TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TypeTile type={d.type} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium">{L.typeLabel(d.type)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{d.id.slice(0, 8)}{d.subtype ? ` · ${L.subtypeLabel(d.type, d.subtype)}` : ""}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-1.5"><ConfidenceBar value={d.confidence} /></TableCell>
                <TableCell className="hidden py-1.5 md:table-cell">
                  <div className="max-w-[240px]">
                    <p className="truncate text-sm">{place.primary ?? <span className="italic text-muted-foreground">{t("ht.place.unknown")}</span>}</p>
                    <div className="flex items-center gap-1.5">
                      {place.secondary && <span className="truncate text-xs text-muted-foreground">{place.secondary}</span>}
                      <LocationBadge status={d.location_status} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden py-1.5 lg:table-cell" onClick={(e) => e.stopPropagation()}>
                  {d.hazard_id && d.hazard_code ? (
                    <button type="button" className="font-mono text-sm text-primary hover:underline" onClick={() => onOpenCluster(d.hazard_id!)}>{d.hazard_code}</button>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs text-muted-foreground xl:table-cell">{L.fmtShort(d.recorded_at ?? d.captured_at)}</TableCell>
                <TableCell className="hidden py-1.5 text-xs text-muted-foreground sm:table-cell">{L.fmtShort(d.created_at)}</TableCell>
                <TableCell className={cn("py-1.5 pr-4")}><Pill tone={reviewTone(d.review_status)}>{L.statusLabel(d.review_status)}</Pill></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1) }} />
    </section>
  )
}
