"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Activity, ArrowLeftRight, ChevronRight, Database, Flag, Grid3x3, Info, Loader2, MapPin, Route as RouteIcon,
  Search, ShieldAlert, Tag, TriangleAlert,
} from "lucide-react"
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { RouteSectionSelect, sectionPlaces, useRouteSections } from "@/components/route-search-bar"
import { fetchRoutePreview, type Place, type RouteSection } from "@/lib/routes-api"
import { PageShell } from "@/components/dashboard/page-shell"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { parseUtc } from "@/components/dashboard/types"
import { HIGH_RISK, riskColor, type LatLon } from "@/components/historical-route-map"
import type { MapCell } from "@/components/analytics-cell-map"
import { AXIS_TICK, CountryPicker, DataCompleteness, PeriodPicker, TOOLTIP_STYLE, useDates } from "@/components/driver-behaviour/shared"
import {
  getHistHeatmap, getHistImports, getHistOverview, getHistTrends, getHistZones,
  type BehaviourFilters, type HistCell, type HistOverview, type HistTrend, type ImportBatch, type Period,
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

const RouteMap = dynamic(() => import("@/components/historical-route-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

// POST /historical/risk/route → ZoneRiskProfile[] (app/services/historical/models.py)
interface ZoneRiskProfile {
  grid_cell_id: string
  center_latitude: number
  center_longitude: number
  total_events: number
  events_by_type: { event_type: string; count: number }[]
  earliest_event_at: string | null
  latest_event_at: string | null
  historical_risk_score: number
  road_name: string | null
}

// GET /routes/preview → { routes: [{ geometry: [lat, lon][], distance_m, duration_s }] }
interface RoutePreview { geometry: LatLon[]; distance_m: number; duration_s: number }

const EVENT_TYPES = ["SPEEDING", "HARD_BRAKING", "HARD_ACCELERATION", "HARSH_CORNERING", "ACCIDENT", "IDLE_VIOLATION", "OTHER"]

function scoreStyle(s: number) {
  if (s >= 0.75) return "bg-red-600 text-white"
  if (s >= 0.5) return "bg-orange-500 text-white"
  if (s >= 0.25) return "bg-amber-400 text-amber-950"
  return "bg-emerald-500 text-white"
}

/** Distance along the route to the vertex nearest a point (orders cells along the route). */
function alongRoute(route: LatLon[], p: LatLon): number {
  let best = Infinity, bestAt = 0, acc = 0
  const k = Math.PI / 180
  const d = (a: LatLon, b: LatLon) => {
    const x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k)
    const y = (b[0] - a[0]) * k
    return Math.sqrt(x * x + y * y) * 6371000
  }
  for (let i = 0; i < route.length; i++) {
    if (i > 0) acc += d(route[i - 1], route[i])
    const dd = d(route[i], p)
    if (dd < best) { best = dd; bestAt = acc }
  }
  return bestAt
}

export default function HistoricalPage() {
  return (
    <PageShell module="historical">
      <Suspense fallback={null}>
        <Historical />
      </Suspense>
    </PageShell>
  )
}

/** Route Safety Evaluation (Module 4 sub-module): historical risk along a planned route. */
function RouteSafety() {
  const { t, locale } = useI18n()
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [routes, setRoutes] = useState<RoutePreview[]>([])
  const [rows, setRows] = useState<ZoneRiskProfile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const { sections } = useRouteSections()
  const [sectionId, setSectionId] = useState<string | null>(null)

  const pickSection = (sec: RouteSection | null) => {
    setSectionId(sec?.id ?? null)
    if (!sec) return
    const [a, b] = sectionPlaces(sec)
    setFrom(a)
    setTo(b)
    run(undefined, a, b)
  }

  const run = async (e?: React.FormEvent, a: Place | null = from, b: Place | null = to) => {
    e?.preventDefault()
    const from = a, to = b
    if (!from || !to) { setError(t("hist.route.pickBoth")); return }
    setLoading(true)
    setError(null)
    setFocus(null)
    try {
      const previewRoutes: RoutePreview[] = await fetchRoutePreview([from.lat, from.lon], [to.lat, to.lon])
        .catch((err: Error) => { throw new Error(err.message === "no_route" ? t("hist.route.noRoute") : err.message) })
      setRoutes(previewRoutes)
      const main = previewRoutes[0]
      const res = await fetch(`/api/proxy/historical/risk/route`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints: main.geometry }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ZoneRiskProfile[] = await res.json()
      setRows([...data].sort((a, b) =>
        alongRoute(main.geometry, [a.center_latitude, a.center_longitude]) -
        alongRoute(main.geometry, [b.center_latitude, b.center_longitude])))
    } catch (err: unknown) {
      setRows(null)
      setError(`${t("hist.route.failed")} (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      setLoading(false)
    }
  }

  const select = useCallback((id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })), [])

  const byType = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const z of rows ?? []) for (const e of z.events_by_type) acc[e.event_type] = (acc[e.event_type] ?? 0) + e.count
    return EVENT_TYPES.filter((k) => acc[k]).map((k) => ({ key: k, type: t(`dash.hist.type.${k}`), count: acc[k] }))
  }, [rows, t])

  const searched = rows !== null
  const withData = (rows ?? []).filter((z) => z.total_events > 0)
  const totalEvents = (rows ?? []).reduce((s, z) => s + z.total_events, 0)
  const maxScore = (rows ?? []).reduce((m, z) => Math.max(m, z.historical_risk_score), 0)
  const highCount = (rows ?? []).filter((z) => z.historical_risk_score >= HIGH_RISK).length
  const dominant = byType.length ? [...byType].sort((a, b) => b.count - a.count)[0] : null
  const date = (s: string | null) => (s ? parseUtc(s).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—")
  const period = (z: ZoneRiskProfile) =>
    z.earliest_event_at || z.latest_event_at ? `${date(z.earliest_event_at)} → ${date(z.latest_event_at)}` : "—"

  const main = routes[0] ?? null
  const mapLabels = useMemo(() => ({
    start: t("hist.route.from"), end: t("hist.route.to"),
    events: t("dash.hist.col.events"), risk: t("dash.hist.col.score"),
  }), [t])
  const alternatives = useMemo(() => routes.slice(1).map((r) => r.geometry), [routes])
  const cells = useMemo(() => rows ?? [], [rows])
  const startPt = useMemo<LatLon | null>(() => (from ? [from.lat, from.lon] : null), [from])
  const endPt = useMemo<LatLon | null>(() => (to ? [to.lat, to.lon] : null), [to])

  return (
    <>
      <h2 id="route-safety" className="mt-8 mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
        <RouteIcon className="h-4 w-4 text-muted-foreground" />{t("hist.m4.routeSafety")}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("hist.route.subtitle")}</p>

      <Panel title={t("hist.route.query")}>
        <form onSubmit={run} className="grid grid-cols-1 gap-3 lg:grid-cols-[14rem_1fr_auto_1fr_auto] lg:items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t("rt.section")}</Label>
            <RouteSectionSelect sections={sections} value={sectionId} onPick={pickSection} />
          </div>
          <PlaceAutocomplete
            id="h-from" label={t("hist.route.from")} value={from}
            onChange={(p) => { setFrom(p); setSectionId(null) }}
            placeholder={t("hist.route.fromPh")} withMyPosition
          />
          <Button
            type="button" variant="ghost" size="icon" className="h-9 w-9 justify-self-center"
            title={t("rt.swap")} aria-label={t("rt.swap")}
            onClick={() => { setFrom(to); setTo(from) }}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <PlaceAutocomplete
            id="h-to" label={t("hist.route.to")} value={to}
            onChange={(p) => { setTo(p); setSectionId(null) }}
            placeholder={t("hist.route.toPh")}
          />
          <Button type="submit" disabled={loading || !from || !to} className="h-9 gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("hist.route.search")}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {main && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("hist.route.summary", {
              km: (main.distance_m / 1000).toFixed(1),
              min: Math.max(1, Math.round(main.duration_s / 60)),
              alt: routes.length - 1,
            })}
          </p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          {t("dash.hist.coverage")}
        </p>
      </Panel>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={MapPin} tone="blue" value={searched ? withData.length : "—"} label={t("hist.route.cellsWithData")} />
        <StatCard icon={TriangleAlert} tone="red"
                  value={searched && rows!.length ? `${Math.round(maxScore * 100)}%` : "—"}
                  label={searched && highCount ? t("hist.route.maxScoreHigh", { n: highCount }) : t("dash.hist.maxScore")} />
        <StatCard icon={Activity} tone="teal" value={searched ? totalEvents : "—"} label={t("dash.hist.events")} />
        <StatCard icon={Tag} tone="orange" value={dominant ? dominant.type : "—"} label={t("hist.route.dominant")} />
      </div>

      <Panel title={t("hist.route.map")} className="mt-4" bodyClassName="p-0">
        <div className="relative h-[26rem] w-full overflow-hidden rounded-b-xl">
          <RouteMap
            route={main?.geometry ?? null}
            alternatives={alternatives}
            cells={cells}
            start={startPt}
            end={endPt}
            focus={focus}
            onSelect={select}
            labels={mapLabels}
          />
          {!searched && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
              <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
                {t("hist.route.mapEmpty")}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted-foreground">
          {[["#10b981", "< 25%"], ["#f59e0b", "25–50%"], ["#f97316", "50–75%"], ["#dc2626", "≥ 75%"], ["#64748b", t("hist.route.noData")]].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-5 rounded-full" style={{ background: c }} />{l}
            </span>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("hist.route.cells")} className="xl:col-span-3" bodyClassName="pb-1">
          {!searched ? (
            <EmptyState>{t("hist.route.emptyBefore")}</EmptyState>
          ) : rows!.length === 0 ? (
            <EmptyState>{t("hist.route.emptyAfter")}</EmptyState>
          ) : (
            <div className="-mx-4 max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("dash.hist.col.cell")}</th>
                    <th className="px-2 py-2 font-medium">{t("dash.hist.col.score")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("dash.hist.col.events")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("hist.route.period")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows!.map((z) => (
                    <tr
                      key={z.grid_cell_id}
                      onClick={() => select(z.grid_cell_id)}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-0 hover:bg-muted/50",
                        focus?.id === z.grid_cell_id && "bg-muted",
                        z.historical_risk_score >= HIGH_RISK && "font-medium",
                      )}
                    >
                      <td className="px-4 py-2">
                        <p className="flex items-center gap-1.5 truncate text-foreground">
                          {z.historical_risk_score >= HIGH_RISK && <Flag className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                          {z.road_name || z.grid_cell_id}
                        </p>
                        <p className="font-mono text-[11px] font-normal text-muted-foreground">
                          {z.center_latitude.toFixed(5)}, {z.center_longitude.toFixed(5)}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", scoreStyle(z.historical_risk_score))}>
                          {Math.round(z.historical_risk_score * 100)}%
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{z.total_events}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs font-normal text-muted-foreground">{period(z)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={t("hist.m4.routeEvents")} className="xl:col-span-2">
          {byType.length === 0 ? (
            <EmptyState>{searched ? t("hist.route.emptyAfter") : t("hist.route.emptyBefore")}</EmptyState>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm">
                {byType.map((b) => (
                  <li key={b.key} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">{b.type}</span>
                    <span className="tabular-nums text-muted-foreground">{b.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{t("hist.m4.behaviourHint")}</p>
              <Link href="/driver-behaviour?period=all" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                {t("hist.m4.seeBehaviour")}<ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </Panel>
      </div>
    </>
  )
}


const COVERAGE_STYLE: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
}

/**
 * Module 4 — Historical Risk Analysis: driving event collection (import
 * history), risk aggregation / score calculation (grid cells 0–1), risk zone
 * identification, road safety heatmap, historical trend analysis, route
 * safety evaluation and this risk reporting dashboard. Per-behaviour
 * analytics (speeding, harsh braking…) live in Module 5 (/driver-behaviour).
 */
function Historical() {
  const { t } = useI18n()
  const sp = useSearchParams()
  const { date, dateTime, bucket } = useDates()
  const [period, setPeriod] = useState<Period>((sp.get("period") as Period) || "all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [country, setCountry] = useState(sp.get("country") ?? "")
  const center = useMemo<LatLon | null>(() => {
    const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"))
    return sp.get("lat") && sp.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
  }, [sp])
  const filters = useMemo<BehaviourFilters>(() => ({ period, date_from: dateFrom || null, date_to: dateTo || null,
    country: country || null }), [period, dateFrom, dateTo, country])

  const [overview, setOverview] = useState<HistOverview | null>(null)
  const [cells, setCells] = useState<HistCell[] | null>(null)
  const [zones, setZones] = useState<HistCell[] | null>(null)
  const [trend, setTrend] = useState<HistTrend | null>(null)
  const [imports, setImports] = useState<ImportBatch[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([getHistOverview(filters), getHistHeatmap(filters), getHistZones(filters, HIGH_RISK, 50), getHistTrends(filters)])
      .then(([o, c, z, tr]) => { if (alive) { setOverview(o); setCells(c); setZones(z); setTrend(tr) } })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters])
  useEffect(() => { getHistImports().then(setImports).catch(() => setImports([])) }, [])

  const size = overview?.cell_size_m ?? 150
  const mapCells = useMemo<MapCell[]>(() => (cells ?? []).map((c) => {
    const low = c.coverage === "low"
    return {
      id: c.grid_cell_id, lat: c.center_latitude, lon: c.center_longitude, sizeM: size,
      color: low ? "#64748b" : riskColor(c.historical_risk_score),
      fillOpacity: low ? 0.15 : 0.5, dashed: low, weight: low ? 1.5 : 1,
      tooltip: `<b>${c.road_name ?? c.grid_cell_id}</b><br/>${t("dash.hist.col.score")}: ${Math.round(c.historical_risk_score * 100)}% · ${t("dash.hist.col.events")}: ${c.total_events}<br/>${t("hist.m4.coverage")}: ${t(`hist.m4.cov.${c.coverage}`)}`,
    }
  }), [cells, size, t])
  const series = useMemo(() => (trend?.series ?? []).map((p) => ({ ...p, label: bucket(p.bucket, trend!.unit) })), [trend, bucket])
  const empty = !loading && overview && overview.total_events === 0

  return (
    <>
      <PageHeader title={t("dash.nav.historical")} description={t("hist.m4.subtitle")} />

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <PeriodPicker period={period} dateFrom={dateFrom} dateTo={dateTo}
          onChange={(p) => { setPeriod(p.period); setDateFrom(p.dateFrom); setDateTo(p.dateTo) }} />
        <CountryPicker value={country} onChange={setCountry} />
        {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <a href="#route-safety" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 font-medium hover:bg-muted">
            <RouteIcon className="h-3.5 w-3.5" />{t("hist.m4.routeSafety")}
          </a>
          <Link href="/driver-behaviour" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 font-medium hover:bg-muted">
            {t("hist.m4.seeBehaviour")}<ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {error && <p className="w-full text-sm text-destructive">{t("hist.m4.loadFailed")} ({error})</p>}
        <div className="basis-full"><DataCompleteness /></div>
      </section>

      {empty && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />{t("hist.m4.empty")}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Activity} tone="blue" value={overview?.total_events ?? "—"}
          label={overview ? t("hist.m4.kpiEvents", { n: overview.accidents }) : t("dash.hist.events")} />
        <StatCard icon={Grid3x3} tone="teal" value={overview?.cells ?? "—"}
          label={overview ? t("hist.m4.kpiCells", { size: overview.cell_size_m }) : t("dash.hist.cells")} />
        <StatCard icon={ShieldAlert} tone="red" value={overview?.high_risk_cells ?? "—"}
          label={overview ? t("hist.m4.kpiHigh", { max: Math.round(overview.max_score * 100) }) : t("hist.m4.kpiHighShort")} />
        <StatCard icon={Database} tone="slate" value={overview?.low_coverage_cells ?? "—"}
          label={t("hist.m4.kpiLow")} />
      </div>
      {overview && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("hist.m4.freshness", {
            from: date(overview.first_event_at), to: date(overview.last_event_at),
            imp: overview.last_import_at ? dateTime(overview.last_import_at) : "—",
          })}
          {Object.keys(overview.sources).length > 0 && ` · ${t("hist.m4.sources")}: ${Object.entries(overview.sources).map(([k, v]) => `${k} (${v})`).join(", ")}`}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("hist.m4.heatmap")} className="xl:col-span-3" bodyClassName="p-0">
          <div className="relative h-[28rem] w-full overflow-hidden">
            <CellMap cells={mapCells} center={center} focus={focus}
              onSelect={(id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))} />
            {cells && cells.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
                <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">{t("hist.m4.heatmapEmpty")}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{t("dash.hist.col.score")}:</span>
            {[["#10b981", "< 25%"], ["#f59e0b", "25–50%"], ["#f97316", "50–75%"], ["#dc2626", "≥ 75%"]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-slate-500 bg-slate-500/20" />{t("hist.m4.lowCoverageLegend")}
            </span>
          </div>
          <p className="flex items-start gap-1.5 px-4 pb-3 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            {overview ? t("hist.m4.method", {
              w: Object.entries(overview.weights).map(([k, v]) => `${t(`dash.hist.type.${k}`)} ${v}`).join(", "),
              sat: overview.saturation_weight,
            }) : t("dash.hist.coverage")}
          </p>
        </Panel>

        <Panel title={t("hist.m4.zones")} className="xl:col-span-2" bodyClassName="pb-2">
          {!zones || zones.length === 0 ? (
            <EmptyState>{t("hist.m4.zonesEmpty")}</EmptyState>
          ) : (
            <div className="-mx-4 max-h-[30rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("dash.hist.col.cell")}</th>
                    <th className="px-2 py-2 font-medium">{t("dash.hist.col.score")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("dash.hist.col.events")}</th>
                    <th className="px-4 py-2 font-medium">{t("hist.m4.coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => (
                    <tr key={z.grid_cell_id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                      onClick={() => setFocus((f) => ({ id: z.grid_cell_id, n: (f?.n ?? 0) + 1 }))}>
                      <td className="px-4 py-2">
                        <p className="truncate text-foreground">{z.road_name || `${z.center_latitude.toFixed(4)}, ${z.center_longitude.toFixed(4)}`}</p>
                        <Link onClick={(e) => e.stopPropagation()}
                          href={`/driver-behaviour?lat=${z.center_latitude.toFixed(5)}&lon=${z.center_longitude.toFixed(5)}&period=all`}
                          className="text-[11px] font-medium text-primary hover:underline">
                          {t("hist.m4.behaviourDetails")}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", scoreStyle(z.historical_risk_score))}>
                          {Math.round(z.historical_risk_score * 100)}%
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{z.total_events}</td>
                      <td className="px-4 py-2">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", COVERAGE_STYLE[z.coverage])}>
                          {t(`hist.m4.cov.${z.coverage}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title={t("hist.m4.trend", { unit: t(`dba.unit.${trend?.unit ?? "month"}`) })} className="mt-4">
        {series.every((p) => !p.events) ? <EmptyState>{t("hist.m4.trendEmpty")}</EmptyState> : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis yAxisId="l" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="events" name={t("dash.hist.col.events")} fill="#2563eb" maxBarSize={26} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="accidents" name={t("dash.hist.type.ACCIDENT")} fill="#dc2626" maxBarSize={26} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="risk_points" name={t("hist.m4.riskPoints")} stroke="#f97316" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">{t("hist.m4.trendNote")}</p>
      </Panel>

      <RouteSafety />

      <Panel title={t("hist.m4.imports")} className="mt-4" bodyClassName="pb-2">
        {!imports || imports.length === 0 ? (
          <EmptyState>{t("hist.m4.importsEmpty")}</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("hist.m4.importedAt")}</th>
                  <th className="px-2 py-2 font-medium">{t("dba.col.source")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("dash.hist.col.events")}</th>
                  <th className="px-2 py-2 font-medium">{t("hist.route.period")}</th>
                  <th className="px-4 py-2 font-medium">{t("hist.m4.types")}</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((b, i) => (
                  <tr key={`${b.source}-${b.imported_at}-${i}`} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs">{b.imported_at ? dateTime(b.imported_at) : "—"}</td>
                    <td className="px-2 py-2 text-xs">{b.source}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{b.events}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{date(b.first_event_at)} → {date(b.last_event_at)}</td>
                    <td className="px-4 py-2 text-[11px] text-muted-foreground">
                      {Object.entries(b.by_type).map(([k, v]) => `${t(`dash.hist.type.${k}`)} ${v}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
