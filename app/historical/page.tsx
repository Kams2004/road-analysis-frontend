"use client"

import { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Activity, ArrowLeftRight, Flag, Info, Loader2, MapPin, Search, Tag, TriangleAlert } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
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
import { HIGH_RISK, type LatLon } from "@/components/historical-route-map"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

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
      <Historical />
    </PageShell>
  )
}

function Historical() {
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
      <PageHeader title={t("dash.nav.historical")} description={t("hist.route.subtitle")} />

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
        <Panel title={t("dash.hist.chart")} className="xl:col-span-2">
          {byType.length === 0 ? (
            <EmptyState>{searched ? t("hist.route.emptyAfter") : t("hist.route.emptyBefore")}</EmptyState>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="type" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
                  />
                  <Bar dataKey="count" name={t("dash.hist.col.events")} fill="#2563eb" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
