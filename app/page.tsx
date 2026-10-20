"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Car, ListChecks, Loader2, RefreshCw, ScanSearch, ShieldCheck } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { RequirePermission } from "@/components/require-permission"
import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { usePeriod } from "@/components/dashboard/period"
import { Panel } from "@/components/dashboard/panel"
import { TrendChart } from "@/components/dashboard/trend-chart"
import { Donut, type DonutSlice } from "@/components/dashboard/donut"
import { RecentJobs } from "@/components/dashboard/recent-jobs"
import {
  CATEGORY_COLORS, OTHER_COLOR, RISK_COLORS, trendPct, type DashboardData, type RiskLevel,
} from "@/components/dashboard/types"

const RiskMap = dynamic(() => import("@/components/dashboard/risk-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="dashboard">
          <Dashboard />
        </RequirePermission>
      </main>
    </div>
  )
}

function Dashboard() {
  const { t } = useI18n()
  const { can } = useAuth()
  const router = useRouter()
  const period = usePeriod()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/proxy/stats/dashboard?period=${period}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  // Keep live numbers fresh: every 15 s while jobs run, else every minute.
  useEffect(() => {
    const iv = setInterval(load, data?.kpis.processing_jobs.value ? 15_000 : 60_000)
    return () => clearInterval(iv)
  }, [load, data?.kpis.processing_jobs.value])

  const typeSlices = useMemo<DonutSlice[]>(() => {
    if (!data) return []
    const sorted = [...data.hazard_types].sort((a, b) => b.count - a.count)
    const top = sorted.slice(0, CATEGORY_COLORS.length - 1)
    const rest = sorted.slice(CATEGORY_COLORS.length - 1)
    const slices = top.map((h, i) => ({
      key: h.type,
      label: typeLabel(t, h.type),
      value: h.count,
      color: CATEGORY_COLORS[i],
    }))
    if (rest.length === 1) {
      slices.push({ key: rest[0].type, label: typeLabel(t, rest[0].type), value: rest[0].count, color: CATEGORY_COLORS[slices.length] })
    } else if (rest.length > 1) {
      slices.push({ key: "__other", label: t("dash.types.other"), value: rest.reduce((s, h) => s + h.count, 0), color: OTHER_COLOR })
    }
    return slices
  }, [data, t])

  const riskSlices = useMemo<DonutSlice[]>(() => {
    if (!data) return []
    return data.risk_distribution.map((r) => ({
      key: r.level,
      label: t(`dash.risk.${r.level}`),
      value: r.count,
      color: RISK_COLORS[r.level],
    }))
  }, [data, t])

  const go = (module: string, href: string) => (can(module) ? () => router.push(href) : undefined)
  const k = data?.kpis

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t("dash.title")}
        description={t("dash.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 gap-2">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("ops.common.refresh")}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {t("dash.loadFailed")} ({error})
        </div>
      )}

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ScanSearch}
          tone="blue"
          value={fmt(k?.detected.value)}
          label={t("dash.kpi.detected")}
          trend={k ? trendPct(k.detected) : null}
          onClick={go("detections", "/detections")}
        />
        <StatCard
          icon={ShieldCheck}
          tone="green"
          value={fmt(k?.validated.value)}
          label={t("dash.kpi.validated")}
          trend={k ? trendPct(k.validated) : null}
          onClick={go("validations", "/validations")}
        />
        <StatCard
          icon={Car}
          tone="purple"
          value={fmt(k?.active_vehicles.value)}
          label={t("dash.kpi.vehicles")}
          onClick={go("collisions", "/collisions")}
        />
        <StatCard
          icon={ListChecks}
          tone="orange"
          value={fmt(k?.processing_jobs.value)}
          label={t("dash.kpi.jobs")}
          onClick={go("jobs", "/jobs")}
        />
      </div>
      {k && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t("dash.kpi.trendNote", { period: t(`dash.period.${period}`) })}</p>
      )}

      {/* Row 2 — charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel
          title={t("dash.trends.title")}
          href={can("detections") ? "/detections" : undefined}
          linkLabel={t("dash.viewAll")}
          className="xl:col-span-2"
        >
          {data ? <TrendChart data={data} /> : <Skeleton />}
        </Panel>
        <Panel title={t("dash.types.title")} href={can("detections") ? "/detections" : undefined} linkLabel={t("dash.viewAll")}>
          {data ? <Donut slices={typeSlices} emptyLabel={t("dash.empty")} centerLabel={t("dash.types.center")} /> : <Skeleton />}
        </Panel>
        <Panel title={t("dash.risk.title")} href={can("map") ? "/map" : undefined} linkLabel={t("dash.viewAll")}>
          {data ? (
            <>
              <Donut slices={riskSlices} emptyLabel={t("dash.map.empty")} centerLabel={t("dash.risk.center")} />
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{t("dash.risk.note")}</p>
            </>
          ) : <Skeleton />}
        </Panel>
      </div>

      {/* Row 3 — jobs + map */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel
          title={t("dash.jobs.title")}
          href={can("jobs") ? "/jobs" : undefined}
          linkLabel={t("dash.viewAll")}
          className="xl:col-span-3"
          bodyClassName="pb-1"
        >
          {data ? <RecentJobs jobs={data.recent_jobs} /> : <Skeleton />}
        </Panel>
        <Panel
          title={t("dash.map.title")}
          href={can("map") ? "/map" : undefined}
          linkLabel={t("dash.map.viewFull")}
          className="xl:col-span-2"
        >
          <div className="relative h-64 overflow-hidden rounded-lg border border-border">
            {/* The map always shows (Cameroon by default); with no hazards a
                small note sits over it instead of replacing it. */}
            <RiskMap hazards={data?.map_hazards ?? []} />
            {data && data.map_hazards.length === 0 && (
              <span className="pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow">
                {t("dash.map.empty")}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {(Object.keys(RISK_COLORS) as RiskLevel[]).map((lvl) => (
              <span key={lvl} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-card" style={{ background: RISK_COLORS[lvl] }} />
                {t(`dash.risk.${lvl}`)}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="h-48 animate-pulse rounded-lg bg-muted/60" />
}

function fmt(v: number | undefined) {
  return v == null ? "—" : v.toLocaleString()
}

function typeLabel(t: (k: string) => string, type: string) {
  const key = `ops.dashboard.type.${type}`
  const label = t(key)
  return label === key ? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : label
}
