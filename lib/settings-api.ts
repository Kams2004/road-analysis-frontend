/**
 * Typed client for the settings sections added by Module 5 (`parked_vehicle`)
 * and Module 6 (`hazard_lifecycle`), plus generic helpers for any section
 * (GET /platform-settings/, PUT /platform-settings/{section}).
 *
 * Defaults mirror the backend models (app/services/detection/parked_vehicle/
 * settings.py, app/services/hazards/lifecycle/settings.py): they back the
 * "Default …" hints and the per-group "Reset to defaults" buttons.
 */
import { ApiError, request } from "@/lib/auth-api"

const P = "/api/proxy"

// ── Generic ──────────────────────────────────────────────────────────────────

export const getAllSettings = () => request<Record<string, Record<string, unknown>>>(`${P}/platform-settings/`)
export const getSettingsSection = <T,>(section: string) =>
  getAllSettings().then((all) => (all[section] ?? null) as T | null)
export const saveSettingsSection = <T,>(section: string, patch: Record<string, unknown>) =>
  request<T>(`${P}/platform-settings/${section}`, { method: "PUT", body: JSON.stringify(patch) })

/**
 * 422 `invalid_settings` → { "camera.horizon_y": "…" }. Model-level errors
 * have an empty field: they are attributed to the first known field named in
 * the message (e.g. "score_weights must be ≥ 0"), else kept under "".
 */
export function settingsErrors(err: unknown, knownFields: string[] = []): Record<string, string> {
  const out: Record<string, string> = {}
  if (!(err instanceof ApiError) || !Array.isArray(err.detail.errors)) return out
  for (const e of err.detail.errors as { field?: string; message?: string }[]) {
    const msg = (e.message ?? "").replace(/^Value error, /, "")
    let field = (e.field ?? "").replace(/^body\./, "")
    if (!field) field = knownFields.find((f) => msg.includes(f)) ?? ""
    out[field] = out[field] ? `${out[field]} ${msg}` : msg
  }
  return out
}

/** Key-order-insensitive JSON text (NaN kept distinct from null). */
function stable(v: unknown): string {
  if (typeof v === "number" && Number.isNaN(v)) return "NaN"
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(v ?? null)
}

/** Deep equality for JSON values (settings drafts). */
export const same = (a: unknown, b: unknown) => stable(a) === stable(b)

// ── Parked vehicles (Module 5) ───────────────────────────────────────────────

export const VEHICLE_CLASSES = ["car", "bus", "truck", "motorcycle"] as const
export const PV_SUBTYPES = ["blocking", "wrong_side", "roadside"] as const
export const PV_VERDICTS = ["parked", "moving", "traffic_queue", "off_road", "not_grounded", "insufficient_evidence", "too_far"] as const
export const REVIEWABLE_VERDICTS = ["off_road", "not_grounded", "traffic_queue", "moving"] as const
export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const
export const SCORE_COMPONENTS = ["detector", "evidence", "target_speed", "ego_motion", "ground_contact", "road_distance", "proximity"] as const

export interface CameraCalibration {
  horizon_y: number
  center_offset: number
  camera_height_m: number
  vertical_fov_deg: number
  corridor_halfwidth_at_horizon: number
  corridor_halfwidth_at_bottom: number
}
export type CameraOverride = Partial<Record<keyof CameraCalibration, number | null>>

export interface ParkedVehicleSettings {
  vehicle_classes: string[]
  detector_confidence: number
  mask_regions: number[][]
  hood_mask_bottom_ratio: number
  tracker_max_gap: number
  tracker_match_iou: number
  min_sightings: number
  min_track_seconds: number
  min_mean_confidence: number
  min_box_area_at_closest: number
  min_ego_distance_m: number
  min_ego_speed_kmh: number
  max_target_speed_kmh: number
  max_world_drift_m: number
  range_error_ratio: number
  max_range_m: number
  fallback_min_lateral_drift: number
  fallback_edge_margin: number
  fallback_max_growth_rate: number
  fallback_min_scale_growth: number
  fallback_score_cap: number
  ground_contact_tolerance: number
  min_ground_contact_ratio: number
  ground_contact_max_range_m: number
  class_heights_m: Record<string, number>
  road_check: boolean
  max_road_distance_m: number
  queue_ego_speed_kmh: number
  queue_min_vehicles: number
  camera: CameraCalibration
  camera_profiles: Record<string, CameraOverride>
  drive_side: "right" | "left"
  score_weights: Record<string, number>
  auto_accept_score: number | null
  auto_reject_score: number | null
  severity_by_subtype: Record<string, string>
  heavy_vehicle_classes: string[]
  heavy_vehicle_bump: number
  store_rejected_for_review: boolean
  review_verdicts: string[]
}

export const CAMERA_DEFAULTS: CameraCalibration = {
  horizon_y: 0.45, center_offset: 0.0, camera_height_m: 1.4, vertical_fov_deg: 60,
  corridor_halfwidth_at_horizon: 0.08, corridor_halfwidth_at_bottom: 0.42,
}

export const PARKED_VEHICLE_DEFAULTS: ParkedVehicleSettings = {
  vehicle_classes: ["car", "bus", "truck"],
  detector_confidence: 0.35,
  mask_regions: [[0, 0, 1, 0.235]],
  hood_mask_bottom_ratio: 0.1,
  tracker_max_gap: 3,
  tracker_match_iou: 0.1,
  min_sightings: 5,
  min_track_seconds: 2.5,
  min_mean_confidence: 0.5,
  min_box_area_at_closest: 0.008,
  min_ego_distance_m: 30,
  min_ego_speed_kmh: 15,
  max_target_speed_kmh: 3,
  max_world_drift_m: 8,
  range_error_ratio: 0.25,
  max_range_m: 80,
  fallback_min_lateral_drift: 0.12,
  fallback_edge_margin: 0.18,
  fallback_max_growth_rate: 2.0,
  fallback_min_scale_growth: 3.0,
  fallback_score_cap: 0.6,
  ground_contact_tolerance: 0.4,
  min_ground_contact_ratio: 0.5,
  ground_contact_max_range_m: 40,
  class_heights_m: { car: 1.5, bus: 3.0, truck: 3.2, motorcycle: 1.2 },
  road_check: true,
  max_road_distance_m: 12,
  queue_ego_speed_kmh: 5,
  queue_min_vehicles: 2,
  camera: { ...CAMERA_DEFAULTS },
  camera_profiles: {},
  drive_side: "right",
  score_weights: { detector: 0.25, evidence: 0.15, target_speed: 0.25, ego_motion: 0.1, ground_contact: 0.1, road_distance: 0.1, proximity: 0.05 },
  auto_accept_score: 0.8,
  auto_reject_score: null,
  severity_by_subtype: { blocking: "high", wrong_side: "medium", roadside: "low" },
  heavy_vehicle_classes: ["bus", "truck"],
  heavy_vehicle_bump: 1,
  store_rejected_for_review: false,
  review_verdicts: ["off_road", "not_grounded", "traffic_queue"],
}

// ── Hazard lifecycle (Module 6) ──────────────────────────────────────────────

export const ALERT_PRIORITIES = ["low", "normal", "high"] as const

export interface TypePolicy {
  expiry_hours: number | null
  heavy_vehicle_expiry_hours: number | null
  absence_resolution: boolean
  absences_to_resolve: number
  require_same_direction: boolean
  pass_daylight_only: boolean
  votes_enabled: boolean
  not_there_to_resolve: number
  still_there_extends: boolean
  reopen_on_sighting: boolean
  reopen_window_hours: number | null
  recurring_enabled: boolean
  show_to_drivers: boolean
  alert_priority: "low" | "normal" | "high"
  subtype_overrides: Record<string, Partial<Omit<TypePolicy, "subtype_overrides">>>
}
export type PolicyField = Exclude<keyof TypePolicy, "subtype_overrides">
export const POLICY_FIELDS: PolicyField[] = [
  "expiry_hours", "heavy_vehicle_expiry_hours", "absence_resolution", "absences_to_resolve", "require_same_direction",
  "pass_daylight_only", "votes_enabled", "not_there_to_resolve", "still_there_extends", "reopen_on_sighting",
  "reopen_window_hours", "recurring_enabled", "show_to_drivers", "alert_priority",
]
/** Kind of each policy field (editor widgets). */
export const POLICY_FIELD_KIND: Record<PolicyField, "hours" | "int" | "bool" | "priority"> = {
  expiry_hours: "hours", heavy_vehicle_expiry_hours: "hours", absence_resolution: "bool", absences_to_resolve: "int",
  require_same_direction: "bool", pass_daylight_only: "bool", votes_enabled: "bool", not_there_to_resolve: "int",
  still_there_extends: "bool", reopen_on_sighting: "bool", reopen_window_hours: "hours", recurring_enabled: "bool",
  show_to_drivers: "bool", alert_priority: "priority",
}

export interface HazardLifecycleSettings {
  expiry_check_minutes: number
  timezone: string
  daylight_hours: [number, number] | number[]
  osd_time_is_local: boolean
  pass_max_distance_m: number
  pass_max_speed_kmh: number
  pass_heading_tolerance_deg: number
  pass_require_recording_time: boolean
  type_models: Record<string, string[]>
  vote_max_distance_m: number
  vote_cooldown_minutes: number
  recurring_min_occurrences: number
  recurring_window_days: number
  recurring_radius_m: number | null
  heavy_vehicle_classes: string[]
  default_policy: TypePolicy
  policies: Record<string, TypePolicy>
}

export const TYPE_POLICY_DEFAULTS: TypePolicy = {
  expiry_hours: null, heavy_vehicle_expiry_hours: null, absence_resolution: false, absences_to_resolve: 2,
  require_same_direction: false, pass_daylight_only: false, votes_enabled: true, not_there_to_resolve: 2,
  still_there_extends: false, reopen_on_sighting: false, reopen_window_hours: null, recurring_enabled: false,
  show_to_drivers: true, alert_priority: "normal", subtype_overrides: {},
}

const policy = (p: Partial<TypePolicy>): TypePolicy => ({ ...TYPE_POLICY_DEFAULTS, ...p })
const persistent: Partial<TypePolicy> = { expiry_hours: null, absence_resolution: false, votes_enabled: true, not_there_to_resolve: 3, recurring_enabled: false }

export const DEFAULT_POLICIES: Record<string, TypePolicy> = {
  pothole: policy(persistent),
  speed_bump: policy(persistent),
  traffic_sign: policy({ expiry_hours: null, absence_resolution: true, absences_to_resolve: 3, require_same_direction: true, votes_enabled: true, not_there_to_resolve: 3 }),
  parked_vehicle: policy({
    expiry_hours: 6, heavy_vehicle_expiry_hours: 24, absence_resolution: true, absences_to_resolve: 2, require_same_direction: false,
    votes_enabled: true, not_there_to_resolve: 2, still_there_extends: true, reopen_on_sighting: true, recurring_enabled: true,
    subtype_overrides: {
      blocking: { expiry_hours: 2, alert_priority: "high" },
      wrong_side: { expiry_hours: 4, alert_priority: "high" },
      roadside: { expiry_hours: 6, alert_priority: "low", show_to_drivers: true },
    },
  }),
}

export const HAZARD_LIFECYCLE_DEFAULTS: HazardLifecycleSettings = {
  expiry_check_minutes: 5,
  timezone: "Africa/Douala",
  daylight_hours: [6, 18],
  osd_time_is_local: true,
  pass_max_distance_m: 30,
  pass_max_speed_kmh: 60,
  pass_heading_tolerance_deg: 60,
  pass_require_recording_time: true,
  type_models: { pothole: ["pothole"], traffic_sign: ["signs"], speed_bump: ["speedbump"], parked_vehicle: ["vehicles", "parked_vehicle"] },
  vote_max_distance_m: 300,
  vote_cooldown_minutes: 60,
  recurring_min_occurrences: 3,
  recurring_window_days: 30,
  recurring_radius_m: null,
  heavy_vehicle_classes: ["truck", "bus"],
  default_policy: policy({ expiry_hours: null, absence_resolution: false, votes_enabled: true, not_there_to_resolve: 3 }),
  policies: DEFAULT_POLICIES,
}
