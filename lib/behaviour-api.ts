/**
 * Client for Module 5 — Driver Behaviour Analytics (/driver-behaviour) and the
 * Module 4 dashboard endpoints (/historical/overview, heatmap, zones, trends,
 * imports). Both read the same historical event store on the backend.
 */
import { request } from "@/lib/auth-api"

const P = "/api/proxy"

export const BEHAVIOUR_TYPES = ["SPEEDING", "HARD_BRAKING", "HARD_ACCELERATION", "HARSH_CORNERING"] as const
export type BehaviourType = (typeof BEHAVIOUR_TYPES)[number]
export const PERIODS = ["7d", "30d", "90d", "12m", "all"] as const
export type Period = (typeof PERIODS)[number]

export const TYPE_COLORS: Record<BehaviourType, string> = {
  SPEEDING: "#dc2626",
  HARD_BRAKING: "#f97316",
  HARD_ACCELERATION: "#7c3aed",
  HARSH_CORNERING: "#0891b2",
}

export interface BehaviourFilters {
  period?: Period | null
  date_from?: string | null
  date_to?: string | null
  types?: BehaviourType[]
  driver?: string | null
  vehicle?: string | null
  bbox?: string | null
}

export function filterQuery(f: BehaviourFilters, extra: Record<string, string | number | null | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f.date_from || f.date_to) {
    if (f.date_from) p.set("date_from", f.date_from)
    if (f.date_to) p.set("date_to", f.date_to)
  } else if (f.period) p.set("period", f.period)
  if (f.types && f.types.length && f.types.length < BEHAVIOUR_TYPES.length) for (const t of f.types) p.append("types", t)
  if (f.driver) p.set("driver", f.driver)
  if (f.vehicle) p.set("vehicle", f.vehicle)
  if (f.bbox) p.set("bbox", f.bbox)
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ""
}

export interface WindowOut { label: string; start: string | null; end: string; previous_start: string | null }

export interface TypeSummary {
  event_type: BehaviourType
  count: number
  share: number
  points: number
  by_severity: Record<string, number>
  high_severity: number
  avg_speed_kmh: number | null
  max_speed_kmh: number | null
  avg_limit_kmh: number | null
  avg_excess_pct: number | null
  peak_hour: number | null
  drivers: number
  vehicles: number
  top_roads: { road_name: string; count: number }[]
}

export interface Overview {
  window: WindowOut
  total_events: number
  previous_total_events: number | null
  change_pct: number | null
  points: number
  high_severity_events: number
  drivers: number
  vehicles: number
  identified_share: number
  high_risk_drivers: number
  avg_driver_score: number | null
  first_event_at: string | null
  last_event_at: string | null
  data_first_event_at: string | null
  data_last_event_at: string | null
  by_type: TypeSummary[]
}

export interface BehaviourEvent {
  id: string
  source: string
  source_event_id: string
  event_type: BehaviourType
  occurred_at: string
  latitude: number
  longitude: number
  driver_external_id: string | null
  vehicle_external_id: string | null
  speed_kmh: number | null
  speed_limit_kmh: number | null
  excess_pct: number | null
  severity_raw: string | null
  severity: "low" | "medium" | "high" | "unknown"
  points: number
  road_name: string | null
  grid_cell_id: string
}

export interface EntityRow {
  rank: number
  id: string
  events: number
  by_type: Record<BehaviourType, number>
  high_severity: number
  points: number
  score: number
  level: "low" | "medium" | "high" | "very_high"
  previous_score: number | null
  previous_events: number | null
  score_delta: number | null
  trend: "worse" | "better" | "stable" | null
  linked: string[]
  last_event_at: string
  top_road: string | null
}

export interface EntityList { window: WindowOut; total: number; unidentified_events: number; items: EntityRow[] }

export interface HeatCell {
  cell_id: string
  latitude: number
  longitude: number
  count: number
  points: number
  by_type: Record<BehaviourType, number>
}

export interface Heatmap { window: WindowOut; cell_size_m: number; max_count: number; cells: HeatCell[] }

export type Bucket = { bucket: string; total: number; points: number } & Partial<Record<BehaviourType, number>>
export type HourRow = { hour: number; total: number } & Partial<Record<BehaviourType, number>>
export type WeekdayRow = { weekday: number; total: number } & Partial<Record<BehaviourType, number>>

export interface Trends {
  window: WindowOut
  unit: "day" | "week" | "month"
  types: BehaviourType[]
  series: Bucket[]
  by_hour: HourRow[]
  by_weekday: WeekdayRow[]
}

export interface BehaviourZone {
  rank: number
  cell_id: string
  latitude: number
  longitude: number
  radius_m: number
  events: number
  points: number
  score: number
  by_type: Record<BehaviourType, number>
  dominant_type: BehaviourType
  dominant_share: number
  multi_behaviour: boolean
  drivers: number
  high_severity: number
  road_name: string | null
  first_event_at: string
  last_event_at: string
}

export interface ZoneList { window: WindowOut; criteria: Record<string, unknown>; items: BehaviourZone[] }

export interface EntityDetail {
  window: WindowOut
  kind: "driver" | "vehicle"
  id: string
  ranking: EntityRow | null
  rank_of: number
  by_type: TypeSummary[]
  trends: Omit<Trends, "window" | "types">
  zones: HeatCell[]
  recent_events: BehaviourEvent[]
}

export interface DriverBehaviourSettings {
  type_weights: Record<string, number>
  severity_multipliers: Record<string, number>
  saturation_points: number
  speeding_medium_excess_pct: number
  speeding_high_excess_pct: number
  high_risk_score: number
  zone_cell_size_m: number
  zone_min_events: number
  zone_min_drivers: number
  default_period: Period
  timezone: string
}

export interface Methodology { version: string; formula: string; settings: DriverBehaviourSettings; notes: string[] }

const DB = `${P}/driver-behaviour`
export const getOverview = (f: BehaviourFilters) => request<Overview>(`${DB}/overview${filterQuery(f)}`)
export const getEvents = (f: BehaviourFilters, extra: { search?: string; severity?: string; sort?: string; offset: number; limit: number }) =>
  request<{ total: number; items: BehaviourEvent[] }>(`${DB}/events${filterQuery(f, extra)}`)
export const eventsExportUrl = (f: BehaviourFilters) => `${DB}/events/export${filterQuery(f)}`
export const getRanking = (kind: "driver" | "vehicle", f: BehaviourFilters, offset: number, limit: number) =>
  request<EntityList>(`${DB}/${kind === "driver" ? "drivers" : "vehicles"}${filterQuery(f, { offset, limit })}`)
export const getEntity = (kind: "driver" | "vehicle", id: string, f: BehaviourFilters) =>
  request<EntityDetail>(`${DB}/${kind === "driver" ? "drivers" : "vehicles"}/${encodeURIComponent(id)}${filterQuery({ ...f, driver: null, vehicle: null })}`)
export const getHeatmap = (f: BehaviourFilters) => request<Heatmap>(`${DB}/heatmap${filterQuery(f)}`)
export const getTrends = (f: BehaviourFilters) => request<Trends>(`${DB}/trends${filterQuery(f)}`)
export const getZones = (f: BehaviourFilters) => request<ZoneList>(`${DB}/zones${filterQuery(f)}`)
export const getMethodology = () => request<Methodology>(`${DB}/methodology`)

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
const hq = (f: BehaviourFilters, extra: Record<string, string | number | null | undefined> = {}) =>
  filterQuery({ period: f.period, date_from: f.date_from, date_to: f.date_to, bbox: f.bbox }, extra)
export const getHistOverview = (f: BehaviourFilters) => request<HistOverview>(`${H}/overview${hq(f)}`)
export const getHistHeatmap = (f: BehaviourFilters) => request<HistCell[]>(`${H}/heatmap${hq(f)}`)
export const getHistZones = (f: BehaviourFilters, minScore = 0.5, limit = 50) =>
  request<HistCell[]>(`${H}/zones${hq(f, { min_score: minScore, limit })}`)
export const getHistTrends = (f: BehaviourFilters) => request<HistTrend>(`${H}/trends${hq(f)}`)
export const getHistImports = () => request<ImportBatch[]>(`${H}/imports`)
