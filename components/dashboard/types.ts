/** Shape of GET /stats/dashboard (app/api/routes/stats.py → DashboardOut). */
import type { Period } from "./period"

export type RiskLevel = "very_high" | "high" | "medium" | "low"

export interface KpiValue { value: number; previous: number | null }

export interface DashboardData {
  period: Period
  bucket_unit: "day" | "week" | "month"
  start: string
  end: string
  kpis: {
    detected: KpiValue
    validated: KpiValue
    active_vehicles: KpiValue
    processing_jobs: KpiValue
  }
  trends: { bucket: string; detected: number; validated: number; reports: number }[]
  hazard_types: { type: string; count: number }[]
  risk_distribution: { level: RiskLevel; count: number }[]
  recent_jobs: {
    id: string
    filename: string
    source_type: string
    source_name: string | null
    status: string
    progress: number
    detections: number
    created_at: string
  }[]
  map_hazards: {
    id: string
    code: string
    type: string
    lat: number
    lon: number
    risk_level: RiskLevel
    detection_count: number
  }[]
}

/** Status colours (reserved for risk, always shown with a text label). */
export const RISK_COLORS: Record<RiskLevel, string> = {
  very_high: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
}

/** Fixed categorical order for hazard types (validated palette). */
export const CATEGORY_COLORS = ["#2563eb", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6"]
export const OTHER_COLOR = "#94a3b8"

/** % change vs the previous period; null when there is nothing to compare. */
export function trendPct(k: KpiValue): number | null {
  if (k.previous == null) return null
  if (k.previous === 0) return k.value === 0 ? 0 : null
  return Math.round(((k.value - k.previous) / k.previous) * 100)
}

/** Backend timestamps are naive UTC. */
export function parseUtc(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
}
