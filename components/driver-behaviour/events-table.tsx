"use client"

/** Driving event storage: paginated behaviour events (Module 5). */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Search } from "lucide-react"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { TablePagination } from "@/components/table-pagination"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SeverityBadge, useDates } from "@/components/driver-behaviour/shared"
import { TYPE_COLORS, getEvents, type BehaviourEvent, type BehaviourFilters } from "@/lib/behaviour-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function EventsTable({ filters }: { filters: BehaviourFilters }) {
  const { t } = useI18n()
  const { dateTime } = useDates()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [severity, setSeverity] = useState("all")
  const [sort, setSort] = useState("-occurred_at")
  const [data, setData] = useState<{ total: number; items: BehaviourEvent[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(h) }, [search])
  useEffect(() => { setPage(1) }, [filters, q, severity, sort])
  useEffect(() => {
    let alive = true
    setLoading(true)
    getEvents(filters, { search: q || undefined, severity: severity === "all" ? undefined : severity, sort,
      offset: (page - 1) * pageSize, limit: pageSize })
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters, q, severity, sort, page, pageSize])

  return (
    <Panel className="mt-4" bodyClassName="p-0" title={
      <span className="flex items-center gap-2">{t("dba.events.title")}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}</span>
    }>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 w-64 pl-8" value={search} placeholder={t("dba.events.search")} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dba.events.allSeverities")}</SelectItem>
            {["high", "medium", "low", "unknown"].map((s) => <SelectItem key={s} value={s}>{t(`dba.sev.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="-occurred_at">{t("dba.events.newest")}</SelectItem>
            <SelectItem value="occurred_at">{t("dba.events.oldest")}</SelectItem>
            <SelectItem value="-speed">{t("dba.events.fastest")}</SelectItem>
            <SelectItem value="event_type">{t("dba.events.byType")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!data || data.items.length === 0 ? (
        <EmptyState>{t("dba.events.empty")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("dba.col.when")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.type")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.severity")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("dba.col.speed")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.driver")} / {t("dba.vehicle")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.location")}</th>
                  <th className="px-4 py-2 font-medium">{t("dba.col.source")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-2 text-xs">{dateTime(e.occurred_at)}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[e.event_type] }} />
                        {t(`dash.hist.type.${e.event_type}`)}
                      </span>
                    </td>
                    <td className="px-2 py-2"><SeverityBadge severity={e.severity} /></td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums">
                      {e.speed_kmh != null ? `${Math.round(e.speed_kmh)}` : "—"}
                      {e.speed_limit_kmh != null && <span className="text-muted-foreground"> / {Math.round(e.speed_limit_kmh)}</span>}
                      {e.speed_kmh != null && " km/h"}
                      {e.excess_pct != null && e.excess_pct > 0 && <span className="ml-1 text-red-600">+{e.excess_pct}%</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <p className="text-foreground">{e.driver_external_id ?? "—"}</p>
                      <p className="text-muted-foreground">{e.vehicle_external_id ?? ""}</p>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <Link href={`/driver-behaviour?lat=${e.latitude.toFixed(5)}&lon=${e.longitude.toFixed(5)}`}
                        title={`${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`}
                        className={cn("block max-w-[16rem] truncate text-primary hover:underline", !e.place && !e.road_name && "font-mono text-[11px]")}>
                        {e.place || e.road_name || `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`}
                      </Link>
                      {e.place && e.road_name && !e.place.includes(e.road_name) && (
                        <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground">{e.road_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-muted-foreground">{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }} />
        </>
      )}
    </Panel>
  )
}
