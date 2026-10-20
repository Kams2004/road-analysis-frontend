"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { EmptyState } from "./panel"

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

/** Donut + legend with counts and percentages (legend carries identity). */
export function Donut({ slices, emptyLabel, centerLabel }: { slices: DonutSlice[]; emptyLabel: string; centerLabel?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return <EmptyState>{emptyLabel}</EmptyState>
  const shown = slices.filter((s) => s.value > 0)

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center xl:flex-col 2xl:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {shown.map((s) => <Cell key={s.key} fill={s.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none text-foreground">{total.toLocaleString()}</span>
          {centerLabel && <span className="mt-0.5 text-[10px] text-muted-foreground">{centerLabel}</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate text-foreground">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.value.toLocaleString()}</span>
            <span className="w-9 text-right font-medium tabular-nums text-foreground">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
