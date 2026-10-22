"use client"

/** Behaviour risk scoring: driver / vehicle ranking + profile drawer (Module 5). */
import { useEffect, useMemo, useState } from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Filter, Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { TablePagination } from "@/components/table-pagination"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AXIS_TICK, ScoreBadge, SeverityBadge, TOOLTIP_STYLE, useDates } from "@/components/driver-behaviour/shared"
import {
  BEHAVIOUR_TYPES, TYPE_COLORS, getEntity, getRanking,
  type BehaviourFilters, type EntityDetail, type EntityList, type EntityRow,
} from "@/lib/behaviour-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Kind = "driver" | "vehicle"

export function TrendArrow({ row }: { row: Pick<EntityRow, "trend" | "score_delta"> }) {
  const { t } = useI18n()
  if (!row.trend) return <span className="text-xs text-muted-foreground">—</span>
  const Icon = row.trend === "worse" ? ArrowUpRight : row.trend === "better" ? ArrowDownRight : ArrowRight
  const cls = row.trend === "worse" ? "text-red-600" : row.trend === "better" ? "text-emerald-600" : "text-muted-foreground"
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", cls)} title={t(`dba.trend.${row.trend}`)}>
      <Icon className="h-3.5 w-3.5" />
      {row.score_delta != null ? `${row.score_delta > 0 ? "+" : ""}${row.score_delta}` : ""}
    </span>
  )
}

export function Ranking({ filters, onFilterEntity }: {
  filters: BehaviourFilters
  onFilterEntity: (kind: Kind, id: string) => void
}) {
  const { t } = useI18n()
  const { date } = useDates()
  const [kind, setKind] = useState<Kind>("driver")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [data, setData] = useState<EntityList | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => { setPage(1) }, [filters, kind])
  useEffect(() => {
    let alive = true
    setLoading(true)
    getRanking(kind, filters, (page - 1) * pageSize, pageSize)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [kind, filters, page, pageSize])

  return (
    <Panel className="mt-4" bodyClassName="p-0" title={
      <span className="flex flex-wrap items-center gap-3">
        {t("dba.rank.title")}
        <span className="inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
          {(["driver", "vehicle"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={cn("rounded-md px-2.5 py-1", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t(`dba.rank.${k}s`)}
            </button>
          ))}
        </span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </span>
    }>
      <p className="px-4 pb-2 text-[11px] text-muted-foreground">
        {t("dba.rank.note")}
        {data && data.unidentified_events > 0 && ` ${t("dba.rank.unidentified", { n: data.unidentified_events })}`}
      </p>
      {!data || data.items.length === 0 ? (
        <EmptyState>{t(kind === "driver" ? "dba.rank.emptyDrivers" : "dba.rank.emptyVehicles")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">{t(kind === "driver" ? "dba.driver" : "dba.vehicle")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.score")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.trend")}</th>
                  {BEHAVIOUR_TYPES.map((tp) => (
                    <th key={tp} className="px-2 py-2 text-right font-medium" title={t(`dash.hist.type.${tp}`)}>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[tp] }} />
                        {t(`dba.short.${tp}`)}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">{t("dba.col.events")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("dba.col.last")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r.id)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.rank}</td>
                    <td className="px-2 py-2">
                      <p className="font-medium text-foreground">{r.id}</p>
                      {r.linked.length > 0 && <p className="truncate text-[11px] text-muted-foreground">{r.linked.join(", ")}</p>}
                    </td>
                    <td className="px-2 py-2"><ScoreBadge score={r.score} level={r.level} /></td>
                    <td className="px-2 py-2"><TrendArrow row={r} /></td>
                    {BEHAVIOUR_TYPES.map((tp) => (
                      <td key={tp} className={cn("px-2 py-2 text-right tabular-nums", !r.by_type[tp] && "text-muted-foreground/50")}>{r.by_type[tp] ?? 0}</td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums">{r.events}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted-foreground">{date(r.last_event_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }} />
        </>
      )}
      <EntityDrawer kind={kind} id={open} filters={filters} onClose={() => setOpen(null)}
        onFilter={(id) => { onFilterEntity(kind, id); setOpen(null) }} />
    </Panel>
  )
}

function EntityDrawer({ kind, id, filters, onClose, onFilter }: {
  kind: Kind
  id: string | null
  filters: BehaviourFilters
  onClose: () => void
  onFilter: (id: string) => void
}) {
  const { t } = useI18n()
  const { date, dateTime, bucket } = useDates()
  const [data, setData] = useState<EntityDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    setData(null)
    setError(null)
    getEntity(kind, id, filters)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
    return () => { alive = false }
  }, [kind, id, filters])

  const series = useMemo(() => (data?.trends.series ?? []).map((b) => ({ ...b, label: bucket(b.bucket, data!.trends.unit) })), [data, bucket])
  const r = data?.ranking

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t(kind === "driver" ? "dba.profile.driver" : "dba.profile.vehicle", { id: id ?? "" })}</SheetTitle>
          <SheetDescription>{t("dba.profile.desc")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!data && !error && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {data && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("dba.col.score")}</p>
                  <div className="mt-1">{r ? <ScoreBadge score={r.score} level={r.level} /> : "—"}</div>
                  {r && <p className="mt-1 text-[11px] text-muted-foreground">{t(`dba.level.${r.level}`)}</p>}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("dba.col.rank")}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{r ? `${r.rank} / ${data.rank_of}` : "—"}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("dba.col.trend")}</p>
                  <div className="mt-1">{r ? <TrendArrow row={r} /> : "—"}</div>
                  {r?.previous_score != null && <p className="mt-1 text-[11px] text-muted-foreground">{t("dba.profile.prev", { s: Math.round(r.previous_score) })}</p>}
                </div>
              </div>
              {!r && <p className="text-xs text-muted-foreground">{t("dba.profile.noEventsInPeriod")}</p>}

              <div>
                <p className="mb-1.5 text-xs font-semibold text-foreground">{t("dba.profile.byType")}</p>
                <div className="space-y-1">
                  {data.by_type.map((s) => (
                    <div key={s.event_type} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[s.event_type] }} />
                      <span className="w-36 shrink-0 text-foreground">{t(`dash.hist.type.${s.event_type}`)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full" style={{
                          width: `${Math.max(...data.by_type.map((x) => x.count)) ? (s.count / Math.max(...data.by_type.map((x) => x.count))) * 100 : 0}%`,
                          background: TYPE_COLORS[s.event_type],
                        }} />
                      </span>
                      <span className="w-8 text-right tabular-nums">{s.count}</span>
                      <span className="w-14 text-right text-[11px] text-red-600 tabular-nums">{s.high_severity ? `${s.high_severity} ${t("dba.sev.highShort")}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>

              {series.some((b) => b.total) && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">{t("dba.profile.trend")}</p>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={10} />
                        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                        {BEHAVIOUR_TYPES.map((tp) => <Bar key={tp} dataKey={tp} name={t(`dash.hist.type.${tp}`)} stackId="p" fill={TYPE_COLORS[tp]} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {data.zones.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">{t("dba.profile.locations")}</p>
                  <ul className="space-y-1 text-xs">
                    {data.zones.slice(0, 8).map((z) => (
                      <li key={z.cell_id} className="flex items-center justify-between gap-2">
                        <a className="font-mono text-primary hover:underline"
                          href={`/driver-behaviour?lat=${z.latitude.toFixed(5)}&lon=${z.longitude.toFixed(5)}`}>
                          {z.latitude.toFixed(4)}, {z.longitude.toFixed(4)}
                        </a>
                        <span className="tabular-nums text-muted-foreground">{t("dba.map.events", { n: z.count })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold text-foreground">{t("dba.profile.recent")}</p>
                {data.recent_events.length === 0 ? <p className="text-xs text-muted-foreground">{t("dba.noData")}</p> : (
                  <ul className="divide-y divide-border rounded-lg border border-border text-xs">
                    {data.recent_events.slice(0, 20).map((e) => (
                      <li key={e.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[e.event_type] }} />
                        <span className="w-28 shrink-0 truncate">{t(`dash.hist.type.${e.event_type}`)}</span>
                        <SeverityBadge severity={e.severity} />
                        <span className="flex-1 truncate text-muted-foreground">{e.road_name ?? ""}</span>
                        {e.speed_kmh != null && <span className="tabular-nums">{Math.round(e.speed_kmh)}{e.speed_limit_kmh ? `/${Math.round(e.speed_limit_kmh)}` : ""} km/h</span>}
                        <span className="whitespace-nowrap text-muted-foreground">{dateTime(e.occurred_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => id && onFilter(id)}>
                  <Filter className="h-3.5 w-3.5" />{t("dba.profile.filterPage")}
                </Button>
                {r && <span className="self-center text-[11px] text-muted-foreground">{t("dba.col.last")}: {date(r.last_event_at)}</span>}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
