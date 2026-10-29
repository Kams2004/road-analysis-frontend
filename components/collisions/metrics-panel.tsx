"use client"

/**
 * Collision-prevention activity and quality over a period (GET /collision/metrics):
 * alerts raised per level and per hour, how many the Context Risk Index raised,
 * detection latency (telemetry fix → alert) and the drivers' "false alert" feedback.
 */
import { useCallback, useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, Gauge, Layers, MessageSquareWarning, Siren, Timer } from "lucide-react"
import { StatCard } from "@/components/stat-card"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { parseUtc } from "@/components/dashboard/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Level = "CRITICAL" | "HIGH_WARNING" | "WARNING" | "MONITOR"
const PERIODS = ["1h", "6h", "24h", "7d"] as const
type Period = (typeof PERIODS)[number]

interface Metrics {
  period: Period
  from: string
  to: string
  alerts_total: number
  by_level: Record<string, number>
  by_hour: { hour: string; total: number; by_level: Record<string, number> }[]
  context_boosts: number
  context_raised: number
  detection_latency_ms: { median: number | null; p90: number | null; samples: number }
  feedback: {
    total: number
    false_alert: number
    useful: number
    false_alert_rate: number | null
    by_level: Record<string, Record<string, number>>
  }
}

// Least to most severe, bottom to top of the stacked bars.
const SERIES: { level: Level; color: string }[] = [
  { level: "MONITOR", color: "#3b82f6" },
  { level: "WARNING", color: "#f59e0b" },
  { level: "HIGH_WARNING", color: "#f97316" },
  { level: "CRITICAL", color: "#dc2626" },
]

export function CollisionMetricsPanel() {
  const { t, locale } = useI18n()
  const [period, setPeriod] = useState<Period>("24h")
  const [data, setData] = useState<Metrics | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/proxy/collision/metrics?period=${period}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      setData(await r.json())
      setError(false)
    } catch {
      setError(true)
    }
  }, [period])

  useEffect(() => {
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [load])

  const m = data?.period === period ? data : null
  const ms = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)} %`)
  const severe = m ? (m.by_level.CRITICAL ?? 0) + (m.by_level.HIGH_WARNING ?? 0) : null
  const hourLabel = (iso: string) => {
    const d = parseUtc(iso)
    return period === "7d"
      ? d.toLocaleString(locale, { weekday: "short", hour: "2-digit" })
      : d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  }
  const rows = (m?.by_hour ?? []).map((h) => ({
    label: hourLabel(h.hour),
    ...Object.fromEntries(SERIES.map((s) => [s.level, h.by_level[s.level] ?? 0])),
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("dash.col.m.subtitle")}</p>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label={t("dash.col.m.period")}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={p === period}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                p === period ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`dash.col.m.p.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {t("dash.col.m.loadFailed")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Siren} tone="orange" value={m ? m.alerts_total : "—"} label={t("dash.col.m.alerts")} />
        <StatCard icon={AlertTriangle} tone="red" value={severe ?? "—"} label={t("dash.col.m.severe")} />
        <StatCard icon={Layers} tone="purple" value={m ? m.context_raised : "—"} label={t("dash.col.m.contextRaised")} />
        <StatCard icon={Timer} tone="teal" value={m ? ms(m.detection_latency_ms.median) : "—"} label={t("dash.col.m.latency")} />
        <StatCard icon={MessageSquareWarning} tone="slate" value={m ? pct(m.feedback.false_alert_rate) : "—"} label={t("dash.col.m.falseRate")} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("dash.col.m.perHour")} className="xl:col-span-3">
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {[...SERIES].reverse().map((s) => (
              <span key={s.level} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {t(`dash.col.lvl.${s.level}`)}
              </span>
            ))}
          </div>
          {!m || m.alerts_total === 0 ? (
            <EmptyState>{m ? t("dash.col.m.none") : "…"}</EmptyState>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="15%">
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16}
                         tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44}
                         tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
                    labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
                  />
                  {SERIES.map((s) => (
                    <Bar key={s.level} dataKey={s.level} stackId="lvl" name={t(`dash.col.lvl.${s.level}`)} fill={s.color} maxBarSize={18} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title={t("dash.col.m.quality")} className="xl:col-span-2">
          <dl className="divide-y divide-border text-sm">
            <Row label={t("dash.col.m.contextBoosts")} hint={t("dash.col.m.contextBoostsHint")} value={m?.context_boosts ?? "—"} />
            <Row label={t("dash.col.m.contextRaised")} hint={t("dash.col.m.contextRaisedHint")} value={m?.context_raised ?? "—"} />
            <Row label={t("dash.col.m.latencyMedian")} value={m ? ms(m.detection_latency_ms.median) : "—"} />
            <Row label={t("dash.col.m.latencyP90")} hint={m ? t("dash.col.m.samples").replace("{n}", String(m.detection_latency_ms.samples)) : undefined}
                 value={m ? ms(m.detection_latency_ms.p90) : "—"} />
            <Row label={t("dash.col.m.answers")} value={m?.feedback.total ?? "—"} />
            <Row label={t("dash.col.m.falseAlerts")} value={m ? `${m.feedback.false_alert} / ${m.feedback.total}` : "—"} />
            <Row label={t("dash.col.m.useful")} value={m?.feedback.useful ?? "—"} />
          </dl>
          {m && m.feedback.total > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("dash.col.m.falseByLevel")}</p>
              <ul className="space-y-1.5">
                {[...SERIES].reverse().map((s) => {
                  const f = m.feedback.by_level[s.level] ?? {}
                  const total = Object.values(f).reduce((a, b) => a + b, 0)
                  if (!total) return null
                  const share = (f.false_alert ?? 0) / total
                  return (
                    <li key={s.level} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0">{t(`dash.col.lvl.${s.level}`)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: s.color }} />
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">{f.false_alert ?? 0} / {total}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Gauge className="h-3.5 w-3.5" /> {t("dash.col.m.note")}
      </p>
    </div>
  )
}

function Row({ label, hint, value }: { label: string; hint?: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt>
        <p className="text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
