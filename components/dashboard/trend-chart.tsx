"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useI18n } from "@/lib/i18n"
import { parseUtc, type DashboardData } from "./types"
import { EmptyState } from "./panel"

const SERIES = [
  { key: "detected", color: "#2563eb", label: "dash.trends.detected" },
  { key: "validated", color: "#10b981", label: "dash.trends.validated" },
  { key: "reports", color: "#f59e0b", label: "dash.trends.reports" },
] as const

/** Grouped bars per day / week / month: detected, validated, community reports. */
export function TrendChart({ data }: { data: DashboardData }) {
  const { t, locale } = useI18n()
  const unit = data.bucket_unit
  const fmt = (iso: string) => {
    const d = parseUtc(iso)
    return unit === "month"
      ? d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" })
      : d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })
  }
  const rows = data.trends.map((b) => ({ ...b, label: fmt(b.bucket) }))
  const total = rows.reduce((s, r) => s + r.detected + r.validated + r.reports, 0)

  return (
    <div className="flex h-full flex-col">
      {/* legend — identity never by colour alone */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {t(s.label)}
          </span>
        ))}
      </div>
      {total === 0 ? (
        <EmptyState>{t("dash.empty")}</EmptyState>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={44}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
              />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={t(s.label)} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
