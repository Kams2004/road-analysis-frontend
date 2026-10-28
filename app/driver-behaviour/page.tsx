"use client"

/**
 * Module 5 — Driver Behaviour Analytics (RRAP-09). Sub-modules on this page:
 * speeding / harsh braking / acceleration / cornering analysis (type cards),
 * driving event storage (events table), behaviour risk scoring (driver and
 * vehicle rankings + profiles), driver behaviour heatmaps, statistics &
 * trends, high-risk behaviour zones, and the documented scoring method.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Activity, AlertTriangle, Download, Flame, Gauge, Info, Loader2, MapPin, RotateCcw, Users, X,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageShell } from "@/components/dashboard/page-shell"
import { PageHeader } from "@/components/page-header"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MapCell, MapCircle, LatLon } from "@/components/analytics-cell-map"
import {
  AXIS_TICK, CountryPicker, DataCompleteness, PeriodPicker, TOOLTIP_STYLE, SEVERITY_COLOR, intensityColor, useDates,
} from "@/components/driver-behaviour/shared"
import { Ranking } from "@/components/driver-behaviour/ranking"
import { EventsTable } from "@/components/driver-behaviour/events-table"
import { MethodologyPanel } from "@/components/driver-behaviour/methodology"
import {
  BEHAVIOUR_TYPES, TYPE_COLORS, eventsExportUrl, getHeatmap, getOverview, getTrends, getZones,
  type BehaviourFilters, type BehaviourType, type Heatmap, type Overview, type Period, type Trends,
  type TypeSummary, type ZoneList,
} from "@/lib/behaviour-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const CellMap = dynamic(() => import("@/components/analytics-cell-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

export default function DriverBehaviourPage() {
  return (
    <PageShell module="driver_behaviour">
      <Suspense fallback={null}>
        <DriverBehaviour />
      </Suspense>
    </PageShell>
  )
}

function parseTypes(raw: string | null): BehaviourType[] {
  if (!raw) return [...BEHAVIOUR_TYPES]
  const out = raw.split(",").map((s) => s.trim().toUpperCase()).filter((s): s is BehaviourType =>
    (BEHAVIOUR_TYPES as readonly string[]).includes(s))
  return out.length ? out : [...BEHAVIOUR_TYPES]
}

function DriverBehaviour() {
  const { t } = useI18n()
  const sp = useSearchParams()
  const { date, bucket } = useDates()

  const [period, setPeriod] = useState<Period>((sp.get("period") as Period) || "90d")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [types, setTypes] = useState<BehaviourType[]>(() => parseTypes(sp.get("types")))
  const [driver, setDriver] = useState(sp.get("driver") ?? "")
  const [vehicle, setVehicle] = useState(sp.get("vehicle") ?? "")
  const [country, setCountry] = useState(sp.get("country") ?? "")
  const [driverInput, setDriverInput] = useState(driver)
  const [vehicleInput, setVehicleInput] = useState(vehicle)
  const center = useMemo<LatLon | null>(() => {
    const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"))
    return sp.get("lat") && sp.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
  }, [sp])

  const filters = useMemo<BehaviourFilters>(() => ({
    period, date_from: dateFrom || null, date_to: dateTo || null, types,
    driver: driver || null, vehicle: vehicle || null, country: country || null,
  }), [period, dateFrom, dateTo, types, driver, vehicle, country])

  const [overview, setOverview] = useState<Overview | null>(null)
  const [heat, setHeat] = useState<Heatmap | null>(null)
  const [trends, setTrends] = useState<Trends | null>(null)
  const [zones, setZones] = useState<ZoneList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showZones, setShowZones] = useState(true)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([getOverview(filters), getHeatmap(filters), getTrends(filters), getZones(filters)])
      .then(([o, h, tr, z]) => {
        if (!alive) return
        setOverview(o); setHeat(h); setTrends(tr); setZones(z)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters])

  const toggleType = (tp: BehaviourType) =>
    setTypes((cur) => {
      if (cur.length === BEHAVIOUR_TYPES.length) return [tp]
      const next = cur.includes(tp) ? cur.filter((x) => x !== tp) : [...cur, tp]
      return next.length ? BEHAVIOUR_TYPES.filter((x) => next.includes(x)) : [...BEHAVIOUR_TYPES]
    })
  const onlyType = (tp: BehaviourType) => setTypes((cur) => (cur.length === 1 && cur[0] === tp ? [...BEHAVIOUR_TYPES] : [tp]))
  const reset = () => {
    setPeriod("90d"); setDateFrom(""); setDateTo(""); setTypes([...BEHAVIOUR_TYPES])
    setDriver(""); setVehicle(""); setDriverInput(""); setVehicleInput("")
  }
  const applyEntity = (e?: React.FormEvent) => {
    e?.preventDefault()
    setDriver(driverInput.trim())
    setVehicle(vehicleInput.trim())
  }
  const pickEntity = useCallback((kind: "driver" | "vehicle", id: string) => {
    if (kind === "driver") { setDriver(id); setDriverInput(id) } else { setVehicle(id); setVehicleInput(id) }
  }, [])

  const typeLabel = useCallback((tp: string) => t(`dash.hist.type.${tp}`), [t])
  const tName = (k: string) => typeLabel(k)

  const mapCells = useMemo<MapCell[]>(() => {
    if (!heat) return []
    const max = heat.max_count || 1
    return heat.cells.map((c) => {
      const parts = BEHAVIOUR_TYPES.filter((tp) => c.by_type[tp]).map((tp) => `${typeLabel(tp)}: ${c.by_type[tp]}`)
      return {
        id: c.cell_id, lat: c.latitude, lon: c.longitude, sizeM: heat.cell_size_m,
        color: intensityColor(c.count / max), fillOpacity: 0.25 + 0.45 * (c.count / max),
        tooltip: `<b>${t("dba.map.events", { n: c.count })}</b><br/>${parts.join("<br/>")}`,
      }
    })
  }, [heat, t, typeLabel])
  const mapCircles = useMemo<MapCircle[]>(() => (!showZones || !zones) ? [] : zones.items.map((z) => ({
    id: `zone:${z.cell_id}`, lat: z.latitude, lon: z.longitude, radiusM: z.radius_m * 1.3,
    color: TYPE_COLORS[z.dominant_type] ?? "#dc2626",
    tooltip: `<b>${t("dba.zones.zone", { n: z.rank })}</b> · ${z.place ?? z.road_name ?? ""}<br/>${t("dba.zones.dominant")}: ${typeLabel(z.dominant_type)}<br/>${t("dba.map.events", { n: z.events })}`,
  })), [zones, showZones, t, typeLabel])

  const series = useMemo(() => (trends?.series ?? []).map((b) => ({ ...b, label: bucket(b.bucket, trends!.unit) })), [trends, bucket])
  const weekdays = useMemo(() => (trends?.by_weekday ?? []).map((w) => ({ ...w, label: t(`dba.weekday.${w.weekday}`) })), [trends, t])
  const empty = !loading && overview && overview.total_events === 0

  return (
    <>
      <PageHeader title={t("dash.nav.driverBehaviour")} description={t("dba.subtitle")} />

      {/* ── Filters ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker period={period} dateFrom={dateFrom} dateTo={dateTo}
            onChange={(p) => { setPeriod(p.period); setDateFrom(p.dateFrom); setDateTo(p.dateTo) }} />
          <CountryPicker value={country} onChange={setCountry} />
          <form onSubmit={applyEntity} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("dba.driver")}</span>
              <Input className="h-9 w-40" value={driverInput} placeholder={t("dba.anyDriver")}
                onChange={(e) => setDriverInput(e.target.value)} onBlur={() => applyEntity()} />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("dba.vehicle")}</span>
              <Input className="h-9 w-40" value={vehicleInput} placeholder={t("dba.anyVehicle")}
                onChange={(e) => setVehicleInput(e.target.value)} onBlur={() => applyEntity()} />
            </label>
            <button type="submit" className="hidden" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />{t("dba.reset")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <a href={eventsExportUrl(filters)} download><Download className="h-3.5 w-3.5" />{t("dba.exportCsv")}</a>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("dba.types")}</span>
          {BEHAVIOUR_TYPES.map((tp) => {
            const on = types.includes(tp)
            return (
              <button key={tp} type="button" onClick={() => toggleType(tp)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-transparent text-white" : "border-border bg-background text-muted-foreground hover:bg-muted")}
                style={on ? { background: TYPE_COLORS[tp] } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : TYPE_COLORS[tp] }} />
                {typeLabel(tp)}
              </button>
            )
          })}
          {(driver || vehicle) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {driver ? `${t("dba.driver")}: ${driver}` : ""}{driver && vehicle ? " · " : ""}{vehicle ? `${t("dba.vehicle")}: ${vehicle}` : ""}
              <button type="button" aria-label={t("dba.clear")} onClick={() => { setDriver(""); setVehicle(""); setDriverInput(""); setVehicleInput("") }}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{t("dba.loadFailed")} ({error})</p>}
        {overview && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("dba.window", { from: overview.window.start ? date(overview.window.start) : t("dba.firstEvent"), to: date(overview.window.end) })}
            {overview.data_last_event_at && ` · ${t("dba.dataRange", { from: date(overview.data_first_event_at), to: date(overview.data_last_event_at) })}`}
          </p>
        )}
        <div className="mt-3"><DataCompleteness /></div>
      </section>

      {empty && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{overview?.data_last_event_at ? t("dba.emptyPeriod") : t("dba.emptyAll")}</span>
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Activity} tone="blue" value={overview?.total_events ?? "—"} label={t("dba.kpi.events")}
          trend={overview?.change_pct ?? null} />
        <StatCard icon={AlertTriangle} tone="red" value={overview?.high_severity_events ?? "—"} label={t("dba.kpi.high")} />
        <StatCard icon={Users} tone="teal"
          value={overview ? `${overview.drivers} / ${overview.vehicles}` : "—"}
          label={overview ? t("dba.kpi.entities", { pct: Math.round(overview.identified_share * 100) }) : t("dba.kpi.entitiesShort")} />
        <StatCard icon={Flame} tone="orange" value={overview?.high_risk_drivers ?? "—"}
          label={overview?.avg_driver_score != null ? t("dba.kpi.highRiskAvg", { avg: Math.round(overview.avg_driver_score) }) : t("dba.kpi.highRisk")} />
      </div>
      {overview?.change_pct != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">{t("dba.kpi.vsPrevious", { n: overview.previous_total_events ?? 0 })}</p>
      )}

      {/* ── Behaviour analysis cards ────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BEHAVIOUR_TYPES.map((tp) => {
          const s = overview?.by_type.find((x) => x.event_type === tp)
          return <TypeCard key={tp} type={tp} summary={s ?? null} active={types.length === 1 && types[0] === tp}
            dimmed={!types.includes(tp)} onClick={() => onlyType(tp)} />
        })}
      </div>

      {/* ── Heatmap + zones ─────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("dba.heatmap.title")} className="xl:col-span-3" bodyClassName="p-0">
          <div className="relative h-[28rem] w-full overflow-hidden">
            <CellMap cells={mapCells} circles={mapCircles} center={center} focus={focus}
              onSelect={(id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))} />
            {heat && heat.cells.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
                <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">{t("dba.heatmap.empty")}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{t("dba.heatmap.legend", { size: heat?.cell_size_m ?? "—" })}</span>
            {[["#fde047", "< 25%"], ["#f59e0b", "25–50%"], ["#ea580c", "50–75%"], ["#b91c1c", "≥ 75%"]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l}
              </span>
            ))}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
              {t("dba.heatmap.showZones")}
            </label>
          </div>
          <p className="flex items-start gap-1.5 px-4 pb-3 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />{t("dba.heatmap.note")}
          </p>
        </Panel>

        <Panel title={t("dba.zones.title")} className="xl:col-span-2" bodyClassName="pb-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            {zones ? t("dba.zones.criteria", {
              n: String(zones.criteria.zone_min_events ?? ""), size: String(zones.criteria.zone_cell_size_m ?? ""),
              d: String(zones.criteria.zone_min_drivers ?? ""),
            }) : ""}
          </p>
          {!zones || zones.items.length === 0 ? (
            <EmptyState>{t("dba.zones.empty")}</EmptyState>
          ) : (
            <div className="-mx-4 max-h-[24rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">{t("dba.zones.place")}</th>
                    <th className="px-2 py-2 font-medium">{t("dba.zones.dominant")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("dba.col.events")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("dba.zones.drivers")}</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.items.map((z) => (
                    <tr key={z.cell_id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                      onClick={() => setFocus((f) => ({ id: `zone:${z.cell_id}`, n: (f?.n ?? 0) + 1 }))}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{z.rank}</td>
                      <td className="px-2 py-2">
                        <p className="truncate text-foreground" title={z.place && z.road_name ? z.road_name : undefined}>{z.place || z.road_name || `${z.latitude.toFixed(4)}, ${z.longitude.toFixed(4)}`}</p>
                        <Link href={`/historical?lat=${z.latitude.toFixed(5)}&lon=${z.longitude.toFixed(5)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-medium text-primary hover:underline">
                          {t("dba.zones.module4")}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[z.dominant_type] }} />
                          {typeLabel(z.dominant_type)} <span className="text-muted-foreground">{Math.round(z.dominant_share * 100)}%</span>
                        </span>
                        {z.multi_behaviour && <p className="text-[10px] text-muted-foreground">{t("dba.zones.multi")}</p>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{z.events}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{z.drivers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Statistics & trends ─────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title={t("dba.trends.title", { unit: t(`dba.unit.${trends?.unit ?? "day"}`) })} className="xl:col-span-3">
          {series.every((b) => !b.total) ? <EmptyState>{t("dba.noData")}</EmptyState> : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {types.map((tp) => <Bar key={tp} dataKey={tp} name={tName(tp)} stackId="a" fill={TYPE_COLORS[tp]} maxBarSize={28} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={t("dba.trends.byHour")} className="xl:col-span-2">
          {!trends || trends.by_hour.every((h) => !h.total) ? <EmptyState>{t("dba.noData")}</EmptyState> : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.by_hour} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="hour" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(h) => `${h}:00–${h}:59`} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  {types.map((tp) => <Bar key={tp} dataKey={tp} name={tName(tp)} stackId="h" fill={TYPE_COLORS[tp]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{t("dba.trends.localTime")}</p>
        </Panel>
        <Panel title={t("dba.trends.byWeekday")}>
          {weekdays.every((w) => !w.total) ? <EmptyState>{t("dba.noData")}</EmptyState> : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdays} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  {types.map((tp) => <Bar key={tp} dataKey={tp} name={tName(tp)} stackId="w" fill={TYPE_COLORS[tp]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Behaviour risk scoring ──────────────────────────────── */}
      <Ranking filters={filters} onFilterEntity={pickEntity} />

      {/* ── Driving event storage ───────────────────────────────── */}
      <EventsTable filters={filters} />

      <MethodologyPanel />

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("dba.module4Note")}{" "}
        <Link href="/historical" className="font-medium text-primary hover:underline">{t("dash.nav.historical")}</Link>
      </p>
    </>
  )
}

function TypeCard({ type, summary, active, dimmed, onClick }: {
  type: BehaviourType
  summary: TypeSummary | null
  active: boolean
  dimmed: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  const s = summary
  const sevTotal = s ? Object.values(s.by_severity).reduce((a, b) => a + b, 0) : 0
  return (
    <button type="button" onClick={onClick}
      className={cn("flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40",
        active ? "border-primary ring-1 ring-primary" : "border-border", dimmed && "opacity-50")}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: TYPE_COLORS[type] }}>
          <Gauge className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t(`dba.analysis.${type}`)}</p>
          <p className="text-[11px] text-muted-foreground">{t(`dba.analysisDesc.${type}`)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{s?.count ?? "—"}</span>
        {s && <span className="text-xs text-muted-foreground">{t("dba.card.share", { pct: Math.round(s.share * 100) })}</span>}
      </div>
      {/* severity mix */}
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted" title={t("dba.card.severityMix")}>
        {s && sevTotal > 0 && (["high", "medium", "low", "unknown"] as const).map((k) =>
          s.by_severity[k] ? <span key={k} style={{ width: `${(s.by_severity[k] / sevTotal) * 100}%`, background: SEVERITY_COLOR[k] }} /> : null)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {(["high", "medium", "low", "unknown"] as const).map((k) => s?.by_severity[k] ? (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[k] }} />{t(`dba.sev.${k}`)} {s.by_severity[k]}
          </span>) : null)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {type === "SPEEDING" ? (
          <>
            <dt className="text-muted-foreground">{t("dba.card.avgSpeed")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_speed_kmh != null ? `${s.avg_speed_kmh} km/h` : "—"}</dd>
            <dt className="text-muted-foreground">{t("dba.card.avgLimit")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_limit_kmh != null ? `${s.avg_limit_kmh} km/h` : "—"}</dd>
            <dt className="text-muted-foreground">{t("dba.card.excess")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_excess_pct != null ? `+${s.avg_excess_pct}%` : "—"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">{t("dba.card.avgSpeed")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_speed_kmh != null ? `${s.avg_speed_kmh} km/h` : "—"}</dd>
            <dt className="text-muted-foreground">{t("dba.card.drivers")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s ? `${s.drivers} / ${s.vehicles}` : "—"}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("dba.card.peakHour")}</dt>
        <dd className="text-right tabular-nums text-foreground">{s?.peak_hour != null ? `${s.peak_hour}:00` : "—"}</dd>
      </dl>
      {s && s.top_roads.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("dba.card.topRoads")}</p>
          {s.top_roads.map((r) => (
            <p key={r.road_name} className="flex justify-between gap-2 truncate text-[11px] text-foreground">
              <span className="truncate">{r.road_name}</span><span className="tabular-nums text-muted-foreground">{r.count}</span>
            </p>
          ))}
        </div>
      )}
    </button>
  )
}
