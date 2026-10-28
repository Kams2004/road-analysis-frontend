"use client"

/** Shared bits of the analytics pages (Module 4 historical, Module 5 driver behaviour). */
import { useEffect, useState } from "react"
import { Calendar, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseUtc } from "@/components/dashboard/types"
import { PERIODS, getCountries, type CountryCount, type Period } from "@/lib/behaviour-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
  unknown: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
}
export const SEVERITY_COLOR: Record<string, string> = {
  low: "#10b981", medium: "#f59e0b", high: "#dc2626", unknown: "#94a3b8",
}
export const LEVEL_STYLE: Record<string, string> = {
  low: "bg-emerald-500 text-white",
  medium: "bg-amber-400 text-amber-950",
  high: "bg-orange-500 text-white",
  very_high: "bg-red-600 text-white",
}

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useI18n()
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.unknown)}>
      {t(`dba.sev.${severity}`)}
    </span>
  )
}

export function ScoreBadge({ score, level }: { score: number; level: string }) {
  const { t } = useI18n()
  return (
    <span title={t(`dba.level.${level}`)}
      className={cn("inline-flex min-w-[2.75rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", LEVEL_STYLE[level] ?? LEVEL_STYLE.low)}>
      {Math.round(score)}
    </span>
  )
}

export function useDates() {
  const { locale } = useI18n()
  const date = (s: string | null | undefined) =>
    s ? parseUtc(s).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—"
  const dateTime = (s: string | null | undefined) =>
    s ? parseUtc(s).toLocaleString(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
  const bucket = (s: string, unit: string) => {
    const d = parseUtc(s)
    if (unit === "month") return d.toLocaleDateString(locale, { month: "short", year: "2-digit" })
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short" })
  }
  return { date, dateTime, bucket }
}

/** Country filter (every country by default), listed with their event counts. */
export function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [list, setList] = useState<CountryCount[]>([])
  useEffect(() => { getCountries().then(setList).catch(() => setList([])) }, [])
  if (!list.length && !value) return null
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Globe className="h-3 w-3" />{t("dba.country")}</span>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("dba.countryAll")}</SelectItem>
          {list.map((c) => (
            <SelectItem key={c.country} value={c.country}>
              {c.country} <span className="text-muted-foreground">· {c.events.toLocaleString()}</span>
            </SelectItem>
          ))}
          {value && !list.some((c) => c.country === value) && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Period select (7d … all) + custom date range. */
export function PeriodPicker({ period, dateFrom, dateTo, onChange }: {
  period: Period
  dateFrom: string
  dateTo: string
  onChange: (p: { period: Period; dateFrom: string; dateTo: string }) => void
}) {
  const { t } = useI18n()
  const custom = !!(dateFrom || dateTo)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">{t("dash.period.label")}</span>
        <Select value={custom ? "custom" : period}
          onValueChange={(v) => v === "custom"
            ? onChange({ period, dateFrom: dateFrom || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), dateTo: dateTo || new Date().toISOString().slice(0, 10) })
            : onChange({ period: v as Period, dateFrom: "", dateTo: "" })}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p} value={p}>{t(`dba.period.${p}`)}</SelectItem>)}
            <SelectItem value="custom">{t("dba.period.custom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {custom && (
        <div className="flex items-end gap-1.5">
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Calendar className="h-3 w-3" />{t("dba.from")}</span>
            <Input type="date" className="h-9 w-40" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => onChange({ period, dateFrom: e.target.value, dateTo })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">{t("dba.to")}</span>
            <Input type="date" className="h-9 w-40" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => onChange({ period, dateFrom, dateTo: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  )
}

export const TOOLTIP_STYLE = {
  background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12,
  color: "var(--popover-foreground)",
}
export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" }

/** Sequential ramp for event-count intensity (light → dark red). */
export function intensityColor(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio))
  if (r >= 0.75) return "#b91c1c"
  if (r >= 0.5) return "#ea580c"
  if (r >= 0.25) return "#f59e0b"
  return "#fde047"
}
