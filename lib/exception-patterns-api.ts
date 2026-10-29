/**
 * Client for Module 9 — Exception patterns (/exception-patterns, formerly Driver behaviour) and
 * the Module 4 dashboard endpoints (/historical/overview, heatmap, zones, trends, imports). Both
 * read the same historical event store on the backend. Anonymous: no driver or vehicle anywhere —
 * only what happens, where, when, how fast and from which provider.
 */
import { request } from "@/lib/auth-api"

const P = "/api/proxy"

export const EXCEPTION_TYPES = [
  "SPEEDING", "HARD_BRAKING", "HARD_ACCELERATION", "HARSH_CORNERING", "ACCIDENT", "IDLE_VIOLATION", "OTHER",
] as const
export type ExceptionType = (typeof EXCEPTION_TYPES)[number]
export const PERIODS = ["7d", "30d", "90d", "12m", "all"] as const
export type Period = (typeof PERIODS)[number]
export const SEVERITIES = ["low", "medium", "high", "unknown"] as const
export type Severity = (typeof SEVERITIES)[number]

export const TYPE_COLORS: Record<ExceptionType, string> = {
  SPEEDING: "#dc2626",
  HARD_BRAKING: "#f97316",
  HARD_ACCELERATION: "#7c3aed",
  HARSH_CORNERING: "#0891b2",
  ACCIDENT: "#111827",
  IDLE_VIOLATION: "#65a30d",
  OTHER: "#94a3b8",
}

export interface PatternFilters {
  period?: Period | null
  date_from?: string | null
  date_to?: string | null
  types?: ExceptionType[]
  bbox?: string | null
  /** Country (customer affiliate as sent by the source, e.g. CAMEROUN); none = every country. */
  country?: string | null
  /** Source / provider (e.g. ymane, besafe); none = every source. */
  source?: string | null
  /** Normalised severity; none = every severity. */
  severity?: Severity | null
}

export function filterQuery(f: PatternFilters, extra: Record<string, string | number | null | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f.date_from || f.date_to) {
    if (f.date_from) p.set("date_from", f.date_from)
    if (f.date_to) p.set("date_to", f.date_to)
  } else if (f.period) p.set("period", f.period)
  if (f.types && f.types.length && f.types.length < EXCEPTION_TYPES.length) for (const t of f.types) p.append("types", t)
  if (f.bbox) p.set("bbox", f.bbox)
  if (f.country) p.set("country", f.country)
  if (f.source) p.set("source", f.source)
  if (f.severity) p.set("severity", f.severity)
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ""
}

export interface WindowOut { label: string; start: string | null; end: string; previous_start: string | null }

export interface TypeSummary {
  event_type: ExceptionType
  count: number
  share: number
  by_severity: Record<Severity, number>
  high_severity: number
  avg_speed_kmh: number | null
  max_speed_kmh: number | null
  avg_limit_kmh: number | null
  avg_excess_pct: number | null
  peak_hour: number | null
  top_roads: { road_name: string; count: number }[]
}

export interface Overview {
  window: WindowOut
  total_events: number
  previous_total_events: number | null
  change_pct: number | null
  high_severity_events: number
  high_severity_share: number
  avg_speed_kmh: number | null
  max_speed_kmh: number | null
  avg_excess_pct: number | null
  places: number
  sources: number
  countries: number
  first_event_at: string | null
  last_event_at: string | null
  data_first_event_at: string | null
  data_last_event_at: string | null
  by_type: TypeSummary[]
}

export interface BreakdownRow {
  /** Source name, country ("" = not sent), severity or band ("50-70" km/h, "10-20" % …). */
  key: string
  count: number
  share: number
  high_severity: number
  by_type: Record<ExceptionType, number>
}

export interface Breakdowns {
  window: WindowOut
  by_source: BreakdownRow[]
  by_country: BreakdownRow[]
  by_severity: BreakdownRow[]
  by_speed_band: BreakdownRow[]
  by_excess_band: BreakdownRow[]
}

export interface HeatCell {
  cell_id: string
  latitude: number
  longitude: number
  count: number
  high_severity: number
  by_type: Record<ExceptionType, number>
}

export interface Heatmap { window: WindowOut; cell_size_m: number; max_count: number; cells: HeatCell[] }

export type Bucket = { bucket: string; total: number; high_severity: number } & Partial<Record<ExceptionType, number>>
export type HourRow = { hour: number; total: number } & Partial<Record<ExceptionType, number>>
export type WeekdayRow = { weekday: number; total: number } & Partial<Record<ExceptionType, number>>

export interface Trends {
  window: WindowOut
  unit: "day" | "week" | "month"
  types: ExceptionType[]
  series: Bucket[]
  by_hour: HourRow[]
  by_weekday: WeekdayRow[]
}

export interface PatternZone {
  rank: number
  cell_id: string
  latitude: number
  longitude: number
  radius_m: number
  events: number
  by_type: Record<ExceptionType, number>
  dominant_type: ExceptionType
  dominant_share: number
  multi_type: boolean
  high_severity: number
  high_severity_share: number
  road_name: string | null
  /** Place name (reverse geocoding; null until looked up). */
  place?: string | null
  first_event_at: string
  last_event_at: string
}

export interface ZoneList { window: WindowOut; criteria: Record<string, unknown>; total: number; items: PatternZone[] }

/** Settings section `driver_behaviour` (key kept for stored settings) — the Exception patterns rules. */
export interface ExceptionPatternSettings {
  severity_multipliers: Record<Severity, number>
  speeding_medium_excess_pct: number
  speeding_high_excess_pct: number
  zone_cell_size_m: number
  zone_min_events: number
  default_period: Period
  timezone: string
}

export interface Methodology {
  version: string
  severity_rule: string
  speed_bands_kmh: string[]
  excess_bands_pct: string[]
  settings: ExceptionPatternSettings
  notes: string[]
}

const XP = `${P}/exception-patterns`
export const getOverview = (f: PatternFilters) => request<Overview>(`${XP}/overview${filterQuery(f)}`)
export const getBreakdowns = (f: PatternFilters) => request<Breakdowns>(`${XP}/breakdowns${filterQuery(f)}`)
export const getHeatmap = (f: PatternFilters) => request<Heatmap>(`${XP}/heatmap${filterQuery(f)}`)
export const getTrends = (f: PatternFilters) => request<Trends>(`${XP}/trends${filterQuery(f)}`)
export const getZones = (f: PatternFilters, limit = 50) => request<ZoneList>(`${XP}/zones${filterQuery(f, { limit })}`)
export const getMethodology = () => request<Methodology>(`${XP}/methodology`)
export interface CountryCount { country: string; events: number }
export interface SourceCount { source: string; events: number }
export interface DataStatus {
  name: string
  first_day: string | null
  complete_until: string | null
  due_until: string
  missing: string[]
  failed: string[]
}
export const getDataStatus = () => request<DataStatus[]>(`${XP}/data-status`)
export const getCountries = () => request<CountryCount[]>(`${XP}/countries`)
export const getSources = () => request<SourceCount[]>(`${XP}/sources`)

// ── Module 4 (historical) ────────────────────────────────────────────────────

export interface HistCell {
  grid_cell_id: string
  center_latitude: number
  center_longitude: number
  total_events: number
  events_by_type: { event_type: string; count: number }[]
  earliest_event_at: string | null
  latest_event_at: string | null
  historical_risk_score: number
  road_name: string | null
  /** Place name (reverse geocoding; null until looked up). */
  place?: string | null
  coverage: "low" | "medium" | "good"
}

export interface HistOverview {
  window: WindowOut
  total_events: number
  cells: number
  high_risk_cells: number
  low_coverage_cells: number
  max_score: number
  accidents: number
  sources: Record<string, number>
  first_event_at: string | null
  last_event_at: string | null
  last_import_at: string | null
  cell_size_m: number
  saturation_weight: number
  weights: Record<string, number>
}

export interface HistTrendPoint { bucket: string; events: number; risk_points: number; accidents: number; cells: number }
export interface HistTrend { window: WindowOut; unit: string; series: HistTrendPoint[] }
export interface ImportBatch {
  source: string
  imported_at: string | null
  events: number
  first_event_at: string
  last_event_at: string
  by_type: Record<string, number>
}

const H = `${P}/historical`
const hq = (f: PatternFilters, extra: Record<string, string | number | null | undefined> = {}) =>
  filterQuery({ period: f.period, date_from: f.date_from, date_to: f.date_to, bbox: f.bbox, country: f.country }, extra)
export const getHistOverview = (f: PatternFilters) => request<HistOverview>(`${H}/overview${hq(f)}`)
export const getHistHeatmap = (f: PatternFilters) => request<HistCell[]>(`${H}/heatmap${hq(f)}`)
export const getHistZones = (f: PatternFilters, minScore = 0.5, limit = 50) =>
  request<HistCell[]>(`${H}/zones${hq(f, { min_score: minScore, limit })}`)
export const getHistTrends = (f: PatternFilters) => request<HistTrend>(`${H}/trends${hq(f)}`)
export const getHistImports = () => request<ImportBatch[]>(`${H}/imports`)
