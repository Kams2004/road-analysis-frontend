"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Upload, Radio, AlertTriangle, CheckCircle, ArrowRight,
  Briefcase, RefreshCw, TrendingUp, Clock, XCircle, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface Stats {
  total_detections: number
  pending_validations: number
  validated_zones: number
  rejected: number
  detection_rate: number
  total_jobs: number
  active_jobs: number
  by_type: Record<string, number>
  by_status: Record<string, number>
  recent_jobs: {
    id: string
    filename: string
    status: string
    detections: number
    created_at: string
    finished_at: string | null
  }[]
}

const TYPE_LABELS: Record<string, string> = {
  pothole: "Potholes",
  traffic_sign: "Traffic Signs",
  speed_bump: "Speed Bumps",
  speed_hump: "Speed Humps",
  crack: "Cracks",
  debris: "Debris",
  road_damage: "Road Damage",
  missing_sign: "Missing Signs",
}

const TYPE_COLORS: Record<string, string> = {
  pothole:      "bg-red-500",
  traffic_sign: "bg-blue-500",
  speed_bump:   "bg-yellow-500",
  speed_hump:   "bg-orange-400",
  crack:        "bg-green-500",
  debris:       "bg-purple-500",
  road_damage:  "bg-pink-500",
  missing_sign: "bg-cyan-500",
}

const JOB_STATUS_STYLE: Record<string, string> = {
  done:       "bg-success/10 text-success border-success/30",
  processing: "bg-primary/10 text-primary border-primary/30",
  pending:    "bg-warning/10 text-warning border-warning/30",
  failed:     "bg-destructive/10 text-destructive border-destructive/30",
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/stats/", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load stats")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // auto-refresh while jobs are active
  useEffect(() => {
    if (!stats?.active_jobs) return
    const t = setTimeout(load, 5000)
    return () => clearTimeout(t)
  }, [stats, load])

  const typeMax = stats ? Math.max(1, ...Object.values(stats.by_type)) : 1
  const totalTyped = stats ? Object.values(stats.by_type).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="mt-1 text-muted-foreground">Overview of road risk analysis and detections</p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Quick Actions */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/upload",      icon: Upload,        color: "bg-primary/10",    ic: "text-primary",     label: "Upload Video",    sub: "Analyze new footage" },
              { href: "/streams",     icon: Radio,         color: "bg-accent/10",     ic: "text-accent",      label: "Stream Sources",  sub: "Manage live feeds" },
              { href: "/detections",  icon: AlertTriangle, color: "bg-warning/10",    ic: "text-warning",     label: "View Detections", sub: `${stats?.total_detections ?? "—"} total` },
              { href: "/validations", icon: CheckCircle,   color: "bg-success/10",    ic: "text-success",     label: "Validate Zones",  sub: `${stats?.pending_validations ?? "—"} pending`, badge: stats?.pending_validations },
            ].map(({ href, icon: Icon, color, ic, label, sub, badge }) => (
              <Link key={href} href={href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", color)}>
                      <Icon className={cn("h-6 w-6", ic)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-sm text-muted-foreground">{sub}</p>
                    </div>
                    {badge != null && badge > 0 && (
                      <Badge className="bg-warning text-warning-foreground">{badge}</Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* KPI Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={AlertTriangle} iconColor="text-warning" bgColor="bg-warning/10"
              value={stats?.total_detections ?? 0} label="Total Detections" sub="All-time detected hazards"
              loading={loading}
            />
            <StatCard
              icon={Clock} iconColor="text-orange-400" bgColor="bg-orange-400/10"
              value={stats?.pending_validations ?? 0} label="Pending Validations" sub="Awaiting user review"
              loading={loading}
            />
            <StatCard
              icon={CheckCircle2} iconColor="text-success" bgColor="bg-success/10"
              value={stats?.validated_zones ?? 0} label="Validated Risk Zones" sub="Confirmed hazard locations"
              loading={loading}
            />
            <StatCard
              icon={TrendingUp} iconColor="text-primary" bgColor="bg-primary/10"
              value={`${stats?.detection_rate ?? 0}%`} label="Validation Rate" sub="Validated vs reviewed"
              loading={loading}
            />
          </div>

          {/* Charts row */}
          <div className="mb-8 grid gap-6 lg:grid-cols-2">

            {/* Detections by Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Detections by Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-2 rounded-full bg-muted animate-pulse" />
                    </div>
                  ))}</div>
                ) : totalTyped === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No detections yet</p>
                ) : (
                  Object.entries(stats!.by_type)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{TYPE_LABELS[type] ?? type}</span>
                          <span className="tabular-nums text-muted-foreground">{count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-all", TYPE_COLORS[type] ?? "bg-primary")}
                            style={{ width: `${(count / typeMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* Validation breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Validation Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                  ))}</div>
                ) : (
                  <>
                    {[
                      { label: "Pending",   key: "pending",   color: "bg-warning",     val: stats!.pending_validations },
                      { label: "Validated", key: "validated", color: "bg-success",      val: stats!.validated_zones },
                      { label: "Rejected",  key: "rejected",  color: "bg-destructive",  val: stats!.rejected },
                    ].map(({ label, color, val }) => {
                      const pct = stats!.total_detections > 0
                        ? Math.round((val / stats!.total_detections) * 100) : 0
                      return (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{label}</span>
                            <span className="tabular-nums text-muted-foreground">{val} <span className="text-xs">({pct}%)</span></span>
                          </div>
                          <Progress value={pct} className={cn("h-2 [&>div]:", color)} />
                        </div>
                      )
                    })}

                    <div className="mt-4 rounded-lg bg-muted/40 p-3 text-center">
                      <p className="text-2xl font-bold">{stats!.detection_rate}%</p>
                      <p className="text-xs text-muted-foreground">Validation rate</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Jobs + Recent Detections */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
                <Link href="/jobs">
                  <Button variant="ghost" size="sm" className="gap-1">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                  ))
                ) : stats!.recent_jobs.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No jobs yet</p>
                ) : (
                  stats!.recent_jobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Briefcase className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at + "Z"), { addSuffix: true })}
                          {job.detections > 0 && ` · ${job.detections} detections`}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs capitalize shrink-0", JOB_STATUS_STYLE[job.status])}>
                        {job.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Stats summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">System Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Total Jobs",         value: stats?.total_jobs ?? 0,         icon: Briefcase,     color: "bg-primary/10",     ic: "text-primary" },
                  { label: "Active Jobs",         value: stats?.active_jobs ?? 0,        icon: RefreshCw,     color: "bg-warning/10",     ic: "text-warning" },
                  { label: "Total Detections",    value: stats?.total_detections ?? 0,   icon: AlertTriangle, color: "bg-destructive/10", ic: "text-destructive" },
                  { label: "Validated Zones",     value: stats?.validated_zones ?? 0,    icon: CheckCircle2,  color: "bg-success/10",     ic: "text-success" },
                  { label: "Rejected",            value: stats?.rejected ?? 0,           icon: XCircle,       color: "bg-muted",          ic: "text-muted-foreground" },
                ].map(({ label, value, icon: Icon, color, ic }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", color)}>
                        <Icon className={cn("h-4 w-4", ic)} />
                      </div>
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {loading ? <span className="inline-block h-4 w-10 rounded bg-muted animate-pulse" /> : value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  )
}

function StatCard({
  icon: Icon, iconColor, bgColor, value, label, sub, loading,
}: {
  icon: React.ElementType
  iconColor: string
  bgColor: string
  value: number | string
  label: string
  sub: string
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", bgColor)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
        </div>
        {loading
          ? <div className="h-8 w-24 rounded bg-muted animate-pulse mb-1" />
          : <p className="text-3xl font-bold tabular-nums">{value}</p>
        }
        <p className="text-sm font-medium mt-1">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  )
}
