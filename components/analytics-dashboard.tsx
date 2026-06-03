"use client"

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AnalyticsSummary, DetectionType } from "@/lib/types"
import { mockAnalytics } from "@/lib/mock-data"

const typeLabels: Record<DetectionType, string> = {
  pothole: "Potholes",
  traffic_sign: "Traffic Signs",
  speed_bump: "Speed Bumps",
  speed_hump: "Speed Humps",
  crack: "Cracks",
  debris: "Debris",
  road_damage: "Road Damage",
  missing_sign: "Missing Signs",
}

const typeColors: Record<DetectionType, string> = {
  pothole: "bg-destructive",
  traffic_sign: "bg-info",
  speed_bump: "bg-warning",
  speed_hump: "bg-chart-3",
  crack: "bg-chart-2",
  debris: "bg-chart-5",
  road_damage: "bg-chart-4",
  missing_sign: "bg-muted-foreground",
}

export function AnalyticsDashboard() {
  const analytics: AnalyticsSummary = mockAnalytics

  const stats = [
    {
      name: "Total Detections",
      value: analytics.totalDetections.toLocaleString(),
      icon: AlertTriangle,
      change: "+12%",
      changeType: "positive" as const,
      description: "All-time detected hazards",
    },
    {
      name: "Pending Validations",
      value: analytics.pendingValidations.toLocaleString(),
      icon: Clock,
      change: "-5%",
      changeType: "negative" as const,
      description: "Awaiting user review",
    },
    {
      name: "Validated Risk Zones",
      value: analytics.validatedRiskZones.toLocaleString(),
      icon: CheckCircle,
      change: "+8%",
      changeType: "positive" as const,
      description: "Confirmed hazard locations",
    },
    {
      name: "Detection Rate",
      value: "94.2%",
      icon: TrendingUp,
      change: "+2.3%",
      changeType: "positive" as const,
      description: "Model accuracy rate",
    },
  ]

  const maxTypeCount = Math.max(...Object.values(analytics.detectionsByType))
  const maxSeverityCount = Math.max(...Object.values(analytics.detectionsBySeverity))
  const maxActivityCount = Math.max(...analytics.recentActivity.map((a) => a.count))

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    stat.changeType === "positive" ? "bg-success/10" : "bg-warning/10"
                  )}
                >
                  <stat.icon
                    className={cn(
                      "h-5 w-5",
                      stat.changeType === "positive"
                        ? "text-success"
                        : "text-warning"
                    )}
                  />
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    stat.changeType === "positive"
                      ? "text-success"
                      : "text-warning"
                  )}
                >
                  {stat.changeType === "positive" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {stat.change}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm font-medium text-foreground">{stat.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Detection by Type */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Detections by Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(analytics.detectionsByType).map(([type, count]) => (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {typeLabels[type as DetectionType]}
                  </span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      typeColors[type as DetectionType]
                    )}
                    style={{ width: `${(count / maxTypeCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Detection by Severity */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Detections by Severity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(analytics.detectionsBySeverity).map(
              ([severity, count]) => {
                const colors: Record<string, string> = {
                  low: "bg-info",
                  medium: "bg-warning",
                  high: "bg-chart-3",
                  critical: "bg-destructive",
                }
                return (
                  <div key={severity} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize text-foreground">{severity}</span>
                      <span className="font-medium text-foreground">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          colors[severity]
                        )}
                        style={{
                          width: `${(count / maxSeverityCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              }
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Recent Activity (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-2">
            {analytics.recentActivity.map((day, index) => {
              const height = (day.count / maxActivityCount) * 100
              const date = new Date(day.date)
              const dayName = date.toLocaleDateString("en-US", { weekday: "short" })
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-[40px] rounded-t-md bg-primary transition-all hover:bg-primary/80"
                      style={{ height: `${height}%` }}
                    />
                    <span className="absolute -top-6 text-xs font-medium text-foreground">
                      {day.count}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{dayName}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
