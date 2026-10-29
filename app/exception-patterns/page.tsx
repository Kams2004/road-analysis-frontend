"use client"

/**
 * Module 9 — Exception patterns (RRAP-09; replaces Driver behaviour in the same menu slot).
 * Anonymous statistics of the fleet exceptions — no driver or vehicle anywhere: KPIs, one card
 * per exception type, the trend over time, hour-of-day and weekday patterns, breakdowns by
 * source / provider, country, severity, recorded speed and excess over the limit, the heatmap
 * with the top places (reverse-geocoded names), and the method. Filters: period, country,
 * source, severity, types.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Activity, AlertTriangle, Gauge, Info, Loader2, MapPin, RotateCcw, ShieldCheck, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageShell } from "@/components/dashboard/page-shell"
import { PageHeader } from "@/components/page-header"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import type { MapCell, MapCircle, LatLon } from "@/components/analytics-cell-map"
import {
  AXIS_TICK, CountryPicker, DataCompleteness, PeriodPicker, SEVERITY_COLOR, SeverityPicker, SourcePicker,
  TOOLTIP_STYLE, intensityColor, useDates,
} from "@/components/exception-patterns/shared"
import { MethodologyPanel } from "@/components/exception-patterns/methodology"
import {
  EXCEPTION_TYPES, TYPE_COLORS, getBreakdowns, getHeatmap, getOverview, getTrends, getZones,
  type BreakdownRow, type Breakdowns, type ExceptionType, type Heatmap, type Overview, type PatternFilters,
  type Period, type Severity, type Trends, type TypeSummary, type ZoneList,
} from "@/lib/exception-patterns-api"
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

/** Always shown as cards; the other types only when they have exceptions. */
const MAIN_TYPES: readonly ExceptionType[] = ["SPEEDING", "HARD_BRAKING", "HARD_ACCELERATION", "HARSH_CORNERING"]

export default function ExceptionPatternsPage() {
  return (
    <PageShell module="driver_behaviour">
      <Suspense fallback={null}>
        <ExceptionPatterns />
      </Suspense>
    </PageShell>
  )
}

function parseTypes(raw: string | null): ExceptionType[] {
  if (!raw) return [...EXCEPTION_TYPES]
  const out = raw.split(",").map((s) => s.trim().toUpperCase()).filter((s): s is ExceptionType =>
    (EXCEPTION_TYPES as readonly string[]).includes(s))
  return out.length ? out : [...EXCEPTION_TYPES]
}

function ExceptionPatterns() {
  const { t } = useI18n()
  const sp = useSearchParams()
  const { date, bucket } = useDates()

  const [period, setPeriod] = useState<Period>((sp.get("period") as Period) || "90d")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [types, setTypes] = useState<ExceptionType[]>(() => parseTypes(sp.get("types")))
  const [country, setCountry] = useState(sp.get("country") ?? "")
  const [source, setSource] = useState(sp.get("source") ?? "")
  const [severity, setSeverity] = useState<Severity | "">("")
  const center = useMemo<LatLon | null>(() => {
    const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"))
    return sp.get("lat") && sp.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
  }, [sp])

  const filters = useMemo<PatternFilters>(() => ({
    period, date_from: dateFrom || null, date_to: dateTo || null, types,
    country: country || null, source: source || null, severity: severity || null,
  }), [period, dateFrom, dateTo, types, country, source, severity])

  const [overview, setOverview] = useState<Overview | null>(null)
  const [breakdowns, setBreakdowns] = useState<Breakdowns | null>(null)
  const [heat, setHeat] = useState<Heatmap | null>(null)
  const [trends, setTrends] = useState<Trends | null>(null)
  const [zones, setZones] = useState<ZoneList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showZones, setShowZones] = useState(true)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([getOverview(filters), getBreakdowns(filters), getHeatmap(filters), getTrends(filters), getZones(filters)])
      .then(([o, b, h, tr, z]) => {
        if (!alive) return
        setOverview(o); setBreakdowns(b); setHeat(h); setTrends(tr); setZones(z)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters, reload])

  const toggleType = (tp: ExceptionType) =>
    setTypes((cur) => {
      if (cur.length === EXCEPTION_TYPES.length) return [tp]
      const next = cur.includes(tp) ? cur.filter((x) => x !== tp) : [...cur, tp]
      return next.length ? EXCEPTION_TYPES.filter((x) => next.includes(x)) : [...EXCEPTION_TYPES]
    })
  const onlyType = (tp: ExceptionType) => setTypes((cur) => (cur.length === 1 && cur[0] === tp ? [...EXCEPTION_TYPES] : [tp]))
  const reset = () => {
    setPeriod("90d"); setDateFrom(""); setDateTo(""); setTypes([...EXCEPTION_TYPES])
    setCountry(""); setSource(""); setSeverity("")
  }

  const typeLabel = useCallback((tp: string) => t(`dash.hist.type.${tp}`), [t])
  const counts = useMemo(() => new Map((overview?.by_type ?? []).map((s) => [s.event_type, s] as const)), [overview])
  // Types drawn in the charts / shown as cards: the selected ones with exceptions (main ones always as cards).
  const chartTypes = useMemo(() => types.filter((tp) => (counts.get(tp)?.count ?? 0) > 0), [types, counts])
  const cardTypes = useMemo(() => EXCEPTION_TYPES.filter((tp) => MAIN_TYPES.includes(tp) || (counts.get(tp)?.count ?? 0) > 0), [counts])

  const mapCells = useMemo<MapCell[]>(() => {
    if (!heat) return []
    const max = heat.max_count || 1
    return heat.cells.map((c) => {
      const parts = EXCEPTION_TYPES.filter((tp) => c.by_type[tp]).map((tp) => `${typeLabel(tp)}: ${c.by_type[tp]}`)
      const high = c.high_severity ? `<br/>${t("xp.map.high", { n: c.high_severity })}` : ""
      return {
        id: c.cell_id, lat: c.latitude, lon: c.longitude, sizeM: heat.cell_size_m,
        color: intensityColor(c.count / max), fillOpacity: 0.25 + 0.45 * (c.count / max),
        tooltip: `<b>${t("xp.map.events", { n: c.count })}</b>${high}<br/>${parts.join("<br/>")}`,
      }
    })
  }, [heat, t, typeLabel])
  const mapCircles = useMemo<MapCircle[]>(() => (!showZones || !zones) ? [] : zones.items.map((z) => ({
    id: `zone:${z.cell_id}`, lat: z.latitude, lon: z.longitude, radiusM: z.radius_m * 1.3,
    color: TYPE_COLORS[z.dominant_type] ?? "#dc2626",
    tooltip: `<b>${t("xp.zones.zone", { n: z.rank })}</b> · ${z.place ?? z.road_name ?? ""}<br/>${t("xp.zones.dominant")}: ${typeLabel(z.dominant_type)}<br/>${t("xp.map.events", { n: z.events })}`,
  })), [zones, showZones, t, typeLabel])

  const series = useMemo(() => (trends?.series ?? []).map((b) => ({ ...b, label: bucket(b.bucket, trends!.unit) })), [trends, bucket])
  const weekdays = useMemo(() => (trends?.by_weekday ?? []).map((w) => ({ ...w, label: t(`xp.weekday.${w.weekday}`) })), [trends, t])
  const empty = !loading && overview && overview.total_events === 0

  return (
    <>
      <PageHeader title={t("dash.nav.exceptionPatterns")} description={t("xp.subtitle")} />

      {/* ── Filters ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker period={period} dateFrom={dateFrom} dateTo={dateTo}
            onChange={(p) => { setPeriod(p.period); setDateFrom(p.dateFrom); setDateTo(p.dateTo) }} />
          <CountryPicker value={country} onChange={setCountry} />
          <SourcePicker value={source} onChange={setSource} />
          <SeverityPicker value={severity} onChange={setSeverity} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />{t("xp.reset")}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("xp.types")}</span>
          {EXCEPTION_TYPES.map((tp) => {
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
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{t("xp.loadFailed")} ({error})</p>}
        {overview && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("xp.window", { from: overview.window.start ? date(overview.window.start) : t("xp.firstEvent"), to: date(overview.window.end) })}
            {overview.data_last_event_at && ` · ${t("xp.dataRange", { from: date(overview.data_first_event_at), to: date(overview.data_last_event_at) })}`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <DataCompleteness />
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{t("xp.anonymous")}
          </span>
        </div>
      </section>

      {empty && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{overview?.data_last_event_at ? t("xp.emptyPeriod") : t("xp.emptyAll")}</span>
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Activity} tone="blue" value={overview?.total_events.toLocaleString() ?? "—"} label={t("xp.kpi.events")}
          trend={overview?.change_pct ?? null} />
        <StatCard icon={AlertTriangle} tone="red" value={overview?.high_severity_events.toLocaleString() ?? "—"}
          label={overview ? t("xp.kpi.high", { pct: Math.round(overview.high_severity_share * 100) }) : t("xp.kpi.highShort")} />
        <StatCard icon={Gauge} tone="orange"
          value={overview?.avg_speed_kmh != null ? `${overview.avg_speed_kmh} km/h` : "—"}
          label={overview?.max_speed_kmh != null ? t("xp.kpi.speed", { max: overview.max_speed_kmh }) : t("xp.kpi.speedShort")} />
        <StatCard icon={MapPin} tone="teal" value={overview?.places.toLocaleString() ?? "—"}
          label={overview ? t("xp.kpi.places", { sources: overview.sources, countries: overview.countries }) : t("xp.kpi.placesShort")} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {overview?.change_pct != null && `${t("xp.kpi.vsPrevious", { n: overview.previous_total_events ?? 0 })} `}
        {overview?.avg_excess_pct != null && <><TrendingUp className="inline h-3 w-3" /> {t("xp.kpi.excess")}: +{overview.avg_excess_pct}%</>}
      </p>

      {/* ── One card per exception type ─────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cardTypes.map((tp) => (
          <TypeCard key={tp} type={tp} summary={counts.get(tp) ?? null} active={types.length === 1 && types[0] === tp}
            dimmed={!types.includes(tp)} onClick={() => onlyType(tp)} />
        ))}
      </div>

      {/* ── Over time, hour of day, day of week ─────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title={t("xp.trends.title", { unit: t(`xp.unit.${trends?.unit ?? "day"}`) })} className="xl:col-span-3">
          {series.every((b) => !b.total) ? <EmptyState>{t("xp.noData")}</EmptyState> : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartTypes.map((tp) => <Bar key={tp} dataKey={tp} name={typeLabel(tp)} stackId="a" fill={TYPE_COLORS[tp]} maxBarSize={28} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={t("xp.trends.byHour")} className="xl:col-span-2">
          {!trends || trends.by_hour.every((h) => !h.total) ? <EmptyState>{t("xp.noData")}</EmptyState> : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.by_hour} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="hour" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(h) => `${h}:00–${h}:59`} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  {chartTypes.map((tp) => <Bar key={tp} dataKey={tp} name={typeLabel(tp)} stackId="h" fill={TYPE_COLORS[tp]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{t("xp.trends.localTime")}</p>
        </Panel>
        <Panel title={t("xp.trends.byWeekday")}>
          {weekdays.every((w) => !w.total) ? <EmptyState>{t("xp.noData")}</EmptyState> : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdays} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                  {chartTypes.map((tp) => <Bar key={tp} dataKey={tp} name={typeLabel(tp)} stackId="w" fill={TYPE_COLORS[tp]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Breakdowns: provider, country, severity, speed ──────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title={t("xp.bd.source")}>
          <CategoryChart rows={breakdowns?.by_source ?? []} types={chartTypes} typeLabel={typeLabel} label={(k) => k} />
        </Panel>
        <Panel title={t("xp.bd.country")}>
          <CategoryChart rows={breakdowns?.by_country ?? []} types={chartTypes} typeLabel={typeLabel}
            label={(k) => k || t("xp.bd.unknownCountry")} />
        </Panel>
        <Panel title={t("xp.bd.severity")} className="lg:col-span-2 xl:col-span-1">
          <SeverityChart rows={breakdowns?.by_severity ?? []} />
        </Panel>
        <Panel title={t("xp.bd.speed")} className="xl:col-span-2">
          <BandChart rows={breakdowns?.by_speed_band ?? []} types={chartTypes} typeLabel={typeLabel}
            note={(n) => t("xp.bd.speedNote", { n })} />
        </Panel>
        <Panel title={t("xp.bd.excess")}>
          <BandChart rows={breakdowns?.by_excess_band ?? []} types={["SPEEDING"]} typeLabel={typeLabel}
            note={(n) => t("xp.bd.excessNote", { n })} suffix="%" />
        </Panel>
      </div>

      {/* ── Heatmap + top places ────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("xp.heatmap.title")} className="xl:col-span-3" bodyClassName="p-0">
          <div className="relative h-[28rem] w-full overflow-hidden">
            <CellMap cells={mapCells} circles={mapCircles} center={center} focus={focus}
              onSelect={(id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))} />
            {heat && heat.cells.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
                <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">{t("xp.heatmap.empty")}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{t("xp.heatmap.legend", { size: heat?.cell_size_m ?? "—" })}</span>
            {[["#fde047", "< 25%"], ["#f59e0b", "25–50%"], ["#ea580c", "50–75%"], ["#b91c1c", "≥ 75%"]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l}
              </span>
            ))}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
              {t("xp.heatmap.showZones")}
            </label>
          </div>
          <p className="flex items-start gap-1.5 px-4 pb-3 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />{t("xp.heatmap.note")}
          </p>
        </Panel>

        <Panel title={t("xp.zones.title")} className="xl:col-span-2" bodyClassName="pb-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            {zones ? t("xp.zones.criteria", {
              n: String(zones.criteria.zone_min_events ?? ""), size: String(zones.criteria.zone_cell_size_m ?? ""),
              total: zones.total,
            }) : ""}
          </p>
          {!zones || zones.items.length === 0 ? (
            <EmptyState>{t("xp.zones.empty")}</EmptyState>
          ) : (
            <div className="-mx-4 max-h-[24rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">{t("xp.zones.place")}</th>
                    <th className="px-2 py-2 font-medium">{t("xp.zones.dominant")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("xp.col.events")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("xp.zones.high")}</th>
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
                          {t("xp.zones.module4")}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[z.dominant_type] }} />
                          {typeLabel(z.dominant_type)} <span className="text-muted-foreground">{Math.round(z.dominant_share * 100)}%</span>
                        </span>
                        {z.multi_type && <p className="text-[10px] text-muted-foreground">{t("xp.zones.multi")}</p>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{z.events}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {z.high_severity} <span className="text-[10px] text-muted-foreground">{Math.round(z.high_severity_share * 100)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <MethodologyPanel onSaved={() => setReload((n) => n + 1)} />

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("xp.module4Note")}{" "}
        <Link href="/historical" className="font-medium text-primary hover:underline">{t("dash.nav.historical")}</Link>
      </p>
    </>
  )
}

/** Horizontal bars, stacked by type: one row per source / country, most exceptions first. */
function CategoryChart({ rows, types, typeLabel, label }: {
  rows: BreakdownRow[]
  types: ExceptionType[]
  typeLabel: (tp: string) => string
  label: (key: string) => string
}) {
  const { t } = useI18n()
  const data = rows.slice(0, 10).map((r) => ({ ...r.by_type, name: label(r.key), count: r.count, high: r.high_severity }))
  if (!data.length) return <EmptyState>{t("xp.noData")}</EmptyState>
  return (
    <div className="w-full" style={{ height: Math.max(140, 34 * data.length + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={96} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          {types.map((tp) => <Bar key={tp} dataKey={tp} name={typeLabel(tp)} stackId="c" fill={TYPE_COLORS[tp]} maxBarSize={22} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** One bar per normalised severity, in its colour. */
function SeverityChart({ rows }: { rows: BreakdownRow[] }) {
  const { t } = useI18n()
  const data = rows.map((r) => ({ key: r.key, name: t(`xp.sev.${r.key}`), count: r.count, share: r.share }))
  if (!data.some((d) => d.count)) return <EmptyState>{t("xp.noData")}</EmptyState>
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            formatter={(v, _n, p) => [`${v} (${Math.round(((p?.payload as { share?: number })?.share ?? 0) * 100)}%)`, t("xp.col.events")]} />
          <Bar dataKey="count" maxBarSize={48} radius={[3, 3, 0, 0]}>
            {data.map((d) => <Cell key={d.key} fill={SEVERITY_COLOR[d.key] ?? SEVERITY_COLOR.unknown} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Ordered bands (speed km/h, excess %), stacked by type. */
function BandChart({ rows, types, typeLabel, note, suffix = "" }: {
  rows: BreakdownRow[]
  types: readonly ExceptionType[]
  typeLabel: (tp: string) => string
  note: (n: number) => string
  suffix?: string
}) {
  const { t } = useI18n()
  const total = rows.reduce((a, r) => a + r.count, 0)
  if (!total) return <EmptyState>{t("xp.noData")}</EmptyState>
  const data = rows.map((r) => ({ ...r.by_type, name: `${r.key}${suffix}` }))
  return (
    <>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            {types.map((tp) => <Bar key={tp} dataKey={tp} name={typeLabel(tp)} stackId="b" fill={TYPE_COLORS[tp]} maxBarSize={40} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{note(total)}</p>
    </>
  )
}

function TypeCard({ type, summary, active, dimmed, onClick }: {
  type: ExceptionType
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
          <p className="text-sm font-semibold text-foreground">{t(`xp.analysis.${type}`)}</p>
          <p className="text-[11px] text-muted-foreground">{t(`xp.analysisDesc.${type}`)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{s?.count.toLocaleString() ?? "—"}</span>
        {s && <span className="text-xs text-muted-foreground">{t("xp.card.share", { pct: Math.round(s.share * 100) })}</span>}
      </div>
      {/* severity mix */}
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted" title={t("xp.card.severityMix")}>
        {s && sevTotal > 0 && (["high", "medium", "low", "unknown"] as const).map((k) =>
          s.by_severity[k] ? <span key={k} style={{ width: `${(s.by_severity[k] / sevTotal) * 100}%`, background: SEVERITY_COLOR[k] }} /> : null)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {(["high", "medium", "low", "unknown"] as const).map((k) => s?.by_severity[k] ? (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[k] }} />{t(`xp.sev.${k}`)} {s.by_severity[k]}
          </span>) : null)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">{t("xp.card.avgSpeed")}</dt>
        <dd className="text-right tabular-nums text-foreground">{s?.avg_speed_kmh != null ? `${s.avg_speed_kmh} km/h` : "—"}</dd>
        {type === "SPEEDING" ? (
          <>
            <dt className="text-muted-foreground">{t("xp.card.avgLimit")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_limit_kmh != null ? `${s.avg_limit_kmh} km/h` : "—"}</dd>
            <dt className="text-muted-foreground">{t("xp.card.excess")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.avg_excess_pct != null ? `+${s.avg_excess_pct}%` : "—"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">{t("xp.card.maxSpeed")}</dt>
            <dd className="text-right tabular-nums text-foreground">{s?.max_speed_kmh != null ? `${s.max_speed_kmh} km/h` : "—"}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("xp.card.peakHour")}</dt>
        <dd className="text-right tabular-nums text-foreground">{s?.peak_hour != null ? `${s.peak_hour}:00` : "—"}</dd>
      </dl>
      {s && s.top_roads.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("xp.card.topRoads")}</p>
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
