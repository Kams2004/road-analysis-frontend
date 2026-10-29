"use client"

/** Shared bits of the analytics pages (Module 4 historical, Module 9 exception patterns). */
import { useEffect, useState } from "react"
import { AlertTriangle, Calendar, CheckCircle2, Database, Globe, Signal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseUtc } from "@/components/dashboard/types"
import {
  PERIODS, SEVERITIES, getCountries, getDataStatus, getSources, type CountryCount, type DataStatus, type Period,
  type Severity, type SourceCount,
} from "@/lib/exception-patterns-api"
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

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useI18n()
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.unknown)}>
      {t(`xp.sev.${severity}`)}
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

/** Up to which day the daily event files are all imported, and the missing days — a missing file
 *  must not read as a day without incidents. Nothing when no event source exists. */
export function DataCompleteness() {
  const { t, locale } = useI18n()
  const [list, setList] = useState<DataStatus[]>([])
  useEffect(() => { getDataStatus().then(setList).catch(() => setList([])) }, [])
  if (!list.length) return null
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { day: "2-digit", month: "short", timeZone: "UTC" })
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {list.map((s) => {
        const late = [...s.missing, ...s.failed].sort()
        return (
          <span key={s.name} className={cn("inline-flex items-center gap-1.5", late.length ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {late.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            <span>
              {list.length > 1 && <span className="font-medium">{s.name}: </span>}
              {s.complete_until ? t("xp.data.completeUntil", { day: day(s.complete_until) }) : t("xp.data.none")}
              {late.length > 0 && ` — ${t("xp.data.missing", { days: late.slice(-3).map(day).join(", ") + (late.length > 3 ? " …" : "") })}`}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** Country filter (every country by default), listed with their event counts. */
export function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [list, setList] = useState<CountryCount[]>([])
  useEffect(() => { getCountries().then(setList).catch(() => setList([])) }, [])
  if (!list.length && !value) return null
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Globe className="h-3 w-3" />{t("xp.country")}</span>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("xp.countryAll")}</SelectItem>
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

/** Source / provider filter (every source by default: ymane, besafe …), listed with their exception counts. */
export function SourcePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [list, setList] = useState<SourceCount[]>([])
  useEffect(() => { getSources().then(setList).catch(() => setList([])) }, [])
  if (!list.length && !value) return null
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Database className="h-3 w-3" />{t("xp.source")}</span>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("xp.sourceAll")}</SelectItem>
          {list.map((s) => (
            <SelectItem key={s.source} value={s.source}>
              {s.source} <span className="text-muted-foreground">· {s.events.toLocaleString()}</span>
            </SelectItem>
          ))}
          {value && !list.some((s) => s.source === value) && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Normalised severity filter (every severity by default). */
export function SeverityPicker({ value, onChange }: { value: Severity | ""; onChange: (v: Severity | "") => void }) {
  const { t } = useI18n()
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Signal className="h-3 w-3" />{t("xp.severity")}</span>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : (v as Severity))}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("xp.severityAll")}</SelectItem>
          {SEVERITIES.map((k) => (
            <SelectItem key={k} value={k}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[k] }} />{t(`xp.sev.${k}`)}
              </span>
            </SelectItem>
          ))}
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
            {PERIODS.map((p) => <SelectItem key={p} value={p}>{t(`xp.period.${p}`)}</SelectItem>)}
            <SelectItem value="custom">{t("xp.period.custom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {custom && (
        <div className="flex items-end gap-1.5">
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Calendar className="h-3 w-3" />{t("xp.from")}</span>
            <Input type="date" className="h-9 w-40" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => onChange({ period, dateFrom: e.target.value, dateTo })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">{t("xp.to")}</span>
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
