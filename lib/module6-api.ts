/**
 * Typed client for Module 6 — hazard validation, hazards (persisted
 * clusters), cluster areas and validation settings.
 * Contract: docs/spec-module6-hazard-validation.md §7.
 *
 * Errors are thrown as ApiError (see lib/auth-api.ts) so screens can use
 * errorText(t, err, "m6") to translate `{code}` values such as
 * `invalid_transition`.
 */
import { ApiError, request } from "@/lib/auth-api"

const P = "/api/proxy"

// ── Shared types ─────────────────────────────────────────────────────────────

export type ReviewStatus = "location_pending" | "pending" | "validated" | "corrected" | "rejected" | "resolved"
export type LocationStatus = "confirmed" | "approximate" | "missing"
export type LocationSource = "ocr" | "interpolated" | "map_pin" | "trajectory" | "ocr_text" | "none"
/**
 * Cluster-first lifecycle. Hazard screens (GET /hazards/…) only ever see
 * confirmed hazards: `active` / `resolved`. `candidate` (CL- code, not
 * validated yet) and `dismissed` only appear in the Validations review queue
 * and on detections (`hazard_status`, queue `cluster`).
 */
export type HazardStatus = "candidate" | "active" | "resolved" | "dismissed"
export const HAZARD_STATUSES: HazardStatus[] = ["candidate", "active", "resolved", "dismissed"]
/** Still on the road (candidate or confirmed) — not resolved / dismissed. */
export const isOpenHazard = (s: string | null | undefined) => s === "active" || s === "candidate"

export interface ListOut<T> { total: number; items: T[] }

export interface ClusterHint {
  hazard_id: string
  hazard_code: string
  detection_count: number
  /** The hazard the detection belongs to (cluster-first). */
  status?: HazardStatus | string | null
  confirmed?: boolean | null
}

export interface M6Detection {
  id: string
  job_id: string
  type: string
  subtype: string | null
  predicted_type: string | null
  predicted_subtype: string | null
  confidence: number
  frame_number: number
  video_time_s: number | null
  raw_gps_text: string | null
  latitude: number | null
  longitude: number | null
  speed_kmh: number | null
  vehicle_id: string | null
  captured_at: string | null
  image_url: string | null
  crop_url: string | null
  context_clip_url: string | null
  location_name: string | null
  country: string | null
  city: string | null
  /** Structured reverse-geocoded address (street, quartier, arrondissement, town, region). */
  road?: string | null
  locality?: string | null
  district?: string | null
  town?: string | null
  region?: string | null
  /** Short readable place: "Rue Joss, Akwa, Douala". */
  display_location?: string | null
  location_status: LocationStatus
  location_source: LocationSource | null
  gps_interpolated?: boolean | null
  bbox_x1: number | null
  bbox_y1: number | null
  bbox_x2: number | null
  bbox_y2: number | null
  model_name: string | null
  model_version: string | null
  /** Two-stage pipeline / AI validation mode (see lib/ai-models-api.ts). */
  model_card_version?: string | null
  verifier_score?: number | null
  /** Traffic signs: the sign classifier's top-3 sign codes (score 0–1, descending). */
  class_candidates?: { code: string; score: number }[] | null
  verifier_model?: string | null
  verifier_card_version?: string | null
  ai_decision?: "auto_accept" | "auto_reject" | "review" | null
  ai_decision_reason?: string | null
  audit_sample?: boolean | null
  /** Evidence of rule-based pipelines (parked vehicles): verdict, score, reasons … */
  ai_details?: AiDetails | null
  /** Video recording time (OSD date-time of the frame, timezone-aware); null = unknown. */
  recorded_at?: string | null
  review_status: ReviewStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  rejection_code: string | null
  rejection_source: "human" | "auto" | null
  resolved_at: string | null
  hazard_id: string | null
  hazard_code: string | null
  /** Status of the hazard (cluster) the detection belongs to. */
  hazard_status?: HazardStatus | string | null
  created_at: string
  /** Only on GET /detections/queue. */
  cluster?: ClusterHint | null
}

/** One rule of a rule-based pipeline: `passed` null = skipped / unknown (never a failure). */
export interface AiReason {
  code: string
  value: unknown
  threshold: unknown
  passed: boolean | null
  detail?: string
}

/**
 * `ai_details` of a detection (spec-module5-parked-vehicle.md §5). Generic:
 * any pipeline may fill `verdict`, `score`, `score_components`, `reasons`.
 */
export interface AiDetails {
  pipeline?: string
  rules_version?: string
  verdict?: string
  subtype?: string | null
  severity?: "low" | "medium" | "high" | "critical" | string | null
  vehicle_class?: string | null
  score?: number | null
  score_components?: Record<string, number | null> | null
  motion?: "stationary" | "same_direction" | "oncoming" | "unknown" | string | null
  fallback?: boolean | null
  camera_profile?: string | null
  target_position?: { latitude: number; longitude: number } | null
  road_distance_m?: number | null
  reasons?: AiReason[] | null
  features?: Record<string, unknown> | null
  [k: string]: unknown
}

export interface DetectionReview {
  id: string
  detection_id: string
  from_status: string | null
  to_status: string
  action: "accept" | "correct" | "reject" | "reopen" | "location_fix" | "auto_reject" | "auto_accept" | "resolve" | "create" | "resight" | string
  actor_type: "user" | "system"
  actor: string | null
  note: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface HazardRef {
  id: string
  code: string
  status: HazardStatus
  confirmed?: boolean
  type?: string
  detection_count?: number
  latitude?: number | null
  longitude?: number | null
}

export interface DetectionDetail extends M6Detection {
  history: DetectionReview[]
  hazard: HazardRef | null
}

export interface TrackPoint {
  id: string | number
  video_time_s: number
  frame_number: number
  latitude: number
  longitude: number
  speed_kmh: number | null
}

export interface Trajectory {
  detection_time_s: number | null
  points: TrackPoint[]
}

export interface Hazard {
  id: string
  code: string
  type: string
  subtype: string | null
  status: HazardStatus
  /** true for active / resolved (validated at least once). */
  confirmed?: boolean
  /** Members by review status (all keys present on recent backends). */
  member_counts?: MemberCounts | null
  /** Unreviewed members (pending + location_pending). */
  pending_count?: number
  latitude: number
  longitude: number
  radius_m: number | null
  country: string | null
  city: string | null
  location_name: string | null
  /** Structured reverse-geocoded address (street, quartier, arrondissement, town, region). */
  road?: string | null
  locality?: string | null
  district?: string | null
  town?: string | null
  region?: string | null
  /** Short readable place: "Rue Joss, Akwa, Douala". */
  display_location?: string | null
  /** Cluster zone / environment, when the cluster configuration provides them. */
  cluster_zone_id?: number | string | null
  cluster_zone_name?: string | null
  /** "urban" | "rural" */
  cluster_environment?: string | null
  detection_count: number
  avg_confidence: number | null
  max_confidence: number | null
  first_detected_at: string | null
  last_detected_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  /** Hazard lifecycle (spec-module6-hazard-lifecycle.md). */
  resolution_source?: ResolutionSource | null
  last_seen_at?: string | null
  expires_at?: string | null
  absence_count?: number
  recurring_spot?: boolean
  recurrence_count?: number
  created_at: string
  updated_at: string
  /** Best evidence (most confident member): clean crop / annotated frame. */
  cover_crop_url?: string | null
  cover_image_url?: string | null
}

export interface MemberCounts {
  pending: number
  location_pending: number
  validated: number
  corrected: number
  resolved: number
  rejected: number
}

export type ResolutionSource = "manual" | "video_absence" | "votes" | "expiry"
export const RESOLUTION_SOURCES: ResolutionSource[] = ["manual", "video_absence", "votes", "expiry"]

export type HazardEventKind =
  | "seen" | "not_seen" | "vote_still_there" | "vote_not_there" | "expired" | "resolved" | "reopened"
  | "confirmed" | "merged"
export const HAZARD_EVENT_KINDS: HazardEventKind[] =
  ["seen", "not_seen", "confirmed", "vote_still_there", "vote_not_there", "expired", "resolved", "reopened", "merged"]

export interface HazardEvent {
  id: string
  hazard_id: string
  kind: HazardEventKind | string
  /** `video`, `review`, `vote`, `expiry`, `sighting`, `manual` … */
  source: string | null
  job_id: string | null
  detection_id: string | null
  user_id: string | null
  /** Kind-specific, e.g. a pass's `distance_m`, `speed_kmh`, `heading_deg`. */
  details: Record<string, unknown> | null
  recorded_at: string | null
  created_at: string
}

export interface RecurringSpot {
  type: string
  latitude: number
  longitude: number
  occurrences: number
  active: boolean
  last_occurrence_at: string | null
  location_name: string | null
  hazard_ids: string[]
  hazard_codes: string[]
}

export interface RecurringSpotList {
  window_days: number
  min_occurrences: number
  total: number
  items: RecurringSpot[]
}

export interface HazardMember {
  id: string
  type?: string
  subtype?: string | null
  review_status: ReviewStatus
  status?: ReviewStatus
  confidence: number
  captured_at: string | null
  created_at?: string
  recorded_at?: string | null
  crop_url: string | null
  image_url: string | null
  context_clip_url?: string | null
  job_id?: string
  latitude?: number | null
  longitude?: number | null
  location_status?: LocationStatus | null
  location_name?: string | null
  ai_decision?: "auto_accept" | "auto_reject" | "review" | null
  ai_decision_reason?: string | null
  verifier_score?: number | null
  audit_sample?: boolean | null
  reviewed_by?: string | null
  rejection_code?: string | null
  rejection_source?: "human" | "auto" | null
  /** Structured reverse-geocoded address (street, quartier, arrondissement, town, region). */
  road?: string | null
  locality?: string | null
  district?: string | null
  town?: string | null
  region?: string | null
  /** Short readable place: "Rue Joss, Akwa, Douala". */
  display_location?: string | null
}

export interface HazardDetail extends Hazard {
  detections?: HazardMember[]
  members?: HazardMember[]
}

export interface HazardSummary {
  by_status?: Record<string, number>
  by_type?: Record<string, number>
  [k: string]: unknown
}

export interface ClusterArea {
  id: string
  name: string
  country: string | null
  city: string | null
  center_lat: number
  center_lon: number
  area_radius_km: number
  cluster_radius_m: number
  type_radius: Record<string, number> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ClusterAreaInput = Omit<ClusterArea, "id" | "created_at" | "updated_at">

export interface ValidationSettings {
  auto_reject_below: number
  auto_accept_above: number | null
  type_overrides: Record<string, { auto_reject_below?: number | null; auto_accept_above?: number | null }>
  clip_seconds: number
  distinct_subtype_types: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Query = Record<string, string | number | boolean | null | undefined>

function qs(q: Query): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || v === "all") continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ""
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) })

// ── Detections ───────────────────────────────────────────────────────────────

export interface DetectionFilters {
  review_status?: string
  type?: string
  subtype?: string
  job_id?: string
  hazard_id?: string
  country?: string
  city?: string
  town?: string
  locality?: string
  location_status?: string
  date_from?: string
  date_to?: string
  min_confidence?: number
  search?: string
  /** Comma list: auto_accept, auto_reject, review. */
  ai_decision?: string
  /** true = only automatic decisions drawn for a human audit. */
  audit_sample?: boolean
  /** Queue only: true = detections in a hazard, false = not in any hazard yet. */
  clustered?: boolean
  sort?: string
  skip?: number
  limit?: number
}

export const listDetections = (f: DetectionFilters = {}) =>
  request<ListOut<M6Detection>>(`${P}/detections/${qs({ ...f })}`)

export const getQueue = (f: Omit<DetectionFilters, "review_status"> & { status?: string } = {}) =>
  request<ListOut<M6Detection>>(`${P}/detections/queue${qs({ ...f })}`)

export const getDetection = (id: string) => request<DetectionDetail>(`${P}/detections/${id}`)

export const acceptDetection = (id: string, body: { label?: string; severity_score?: number; note?: string } = {}) =>
  post<M6Detection>(`${P}/detections/${id}/accept`, body)

export const correctDetection = (id: string, body: {
  type: string; subtype?: string | null; label?: string; severity_score?: number; note?: string
}) => post<M6Detection>(`${P}/detections/${id}/correct`, body)

export const rejectDetection = (id: string, body: { reason_code: string; note?: string }) =>
  post<M6Detection>(`${P}/detections/${id}/reject`, body)

export const reopenDetection = (id: string, reason: string) =>
  post<M6Detection>(`${P}/detections/${id}/reopen`, { reason })

export type LocationFix =
  | { method: "map_pin"; latitude: number; longitude: number; note?: string }
  | { method: "trajectory_point"; track_point_id: string | number; latitude?: number; longitude?: number; note?: string }
  | { method: "ocr_text"; raw_gps_text: string; note?: string }
  | { method: "accept_proposed"; note?: string }

export const setDetectionLocation = (id: string, body: LocationFix) =>
  post<M6Detection>(`${P}/detections/${id}/location`, body)

export const getTrajectory = (id: string, window_s = 60) =>
  request<Trajectory>(`${P}/detections/${id}/trajectory${qs({ window_s })}`)

export interface RejectedFilters {
  type?: string
  reason_code?: string
  rejection_source?: string
  reviewer?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}

export const listRejected = (f: RejectedFilters = {}) =>
  request<ListOut<M6Detection>>(`${P}/detections/rejected${qs({ ...f })}`)

/** Download the rejected dataset (datasets:view) as a file. */
export async function downloadRejectedExport(format: "csv" | "json", f: Omit<RejectedFilters, "skip" | "limit"> = {}) {
  const res = await fetch(`${P}/detections/rejected/export${qs({ ...f, format })}`, { cache: "no-store" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const raw = data?.detail
    throw new ApiError(res.status, raw && typeof raw === "object" ? raw : { code: "error", message: String(raw ?? "") })
  }
  const blob = await res.blob()
  const cd = res.headers.get("content-disposition") ?? ""
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const name = m ? decodeURIComponent(m[1]) : `rejected-detections-${new Date().toISOString().slice(0, 10)}.${format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Hazards ──────────────────────────────────────────────────────────────────

export interface HazardFilters {
  /** active | resolved (hazard screens only see confirmed hazards). */
  status?: HazardStatus | string
  type?: string
  subtype?: string
  country?: string
  city?: string
  town?: string
  locality?: string
  date_from?: string
  date_to?: string
  search?: string
  resolution_source?: ResolutionSource | string
  recurring_spot?: boolean
  /** true = active / resolved, false = candidate / dismissed. */
  confirmed?: boolean
  /** Hazards with (true) / without (false) unreviewed members. */
  has_pending?: boolean
  sort?: string
  skip?: number
  limit?: number
}

export const listHazards = (f: HazardFilters = {}) => request<ListOut<Hazard>>(`${P}/hazards/${qs({ ...f })}`)
export const getHazard = (id: string) => request<HazardDetail>(`${P}/hazards/${id}`)
export const resolveHazard = (id: string, note?: string) => post<Hazard>(`${P}/hazards/${id}/resolve`, { note })
export const reopenHazard = (id: string, reason: string) => post<Hazard>(`${P}/hazards/${id}/reopen`, { reason })
export const getHazardSummary = () => request<HazardSummary>(`${P}/hazards/summary`)

// ── Cluster review (cluster-first validation) ───────────────────────────────

export interface ReviewQueueItem {
  hazard: Hazard
  /** Unreviewed members (pending / location_pending), highest confidence first. */
  detections: M6Detection[]
}

export interface ReviewQueue {
  total: number
  /** Candidate clusters (CL- code, not hazards yet) with unreviewed detections. */
  candidates: number
  /** Unreviewed detections that belong to no hazard yet (no position). */
  unclustered: number
  items: ReviewQueueItem[]
}

export const REVIEW_QUEUE_SORTS = ["-pending_count", "-last_detected_at", "-max_confidence", "code"] as const

export const getReviewQueue = (f: {
  type?: string; subtype?: string; job_id?: string; search?: string; sort?: string; skip?: number; limit?: number; members?: number
} = {}) => request<ReviewQueue>(`${P}/hazards/review-queue${qs({ ...f })}`).then((r) => ({
  total: r?.total ?? 0, unclustered: r?.unclustered ?? 0, candidates: r?.candidates ?? 0, items: r?.items ?? [],
}))

export interface ClusterDecision {
  hazard_id: string
  /** After a successful accept of a candidate: the new HZ- code (was CL-). */
  hazard_code: string
  /** "deleted" when a rejected candidate lost all its members. */
  hazard_status: HazardStatus | "deleted" | string | null
  accepted: number
  rejected: number
  auto_validated: number
  skipped: number
  hazard: HazardDetail | null
}

/** Validate every pending member and confirm the hazard (validations:edit). */
export const acceptCluster = (id: string, body: { note?: string; label?: string; severity_score?: number } = {}) =>
  post<ClusterDecision>(`${P}/hazards/${id}/accept`, body)

/** Reject every unreviewed member; a candidate left empty is deleted (validations:edit). */
export const rejectCluster = (id: string, body: { reason_code: string; note?: string }) =>
  post<ClusterDecision>(`${P}/hazards/${id}/reject`, body)

/** Lifecycle timeline of a hazard, newest first (detections:view). */
export const getHazardEvents = (id: string, f: { kind?: string[]; skip?: number; limit?: number } = {}) => {
  const p = new URLSearchParams()
  for (const k of f.kind ?? []) p.append("kind", k)
  if (f.skip != null) p.set("skip", String(f.skip))
  if (f.limit != null) p.set("limit", String(f.limit))
  const q = p.toString()
  return request<ListOut<HazardEvent>>(`${P}/hazards/${id}/events${q ? `?${q}` : ""}`)
}

/** Places where hazards of a type keep coming back (detections:view). */
export const listRecurringSpots = (f: { type?: string; bbox?: string; window_days?: number; min_occurrences?: number } = {}) =>
  request<RecurringSpotList>(`${P}/hazards/recurring-spots${qs({ ...f })}`)

export interface HazardPlace {
  town: string
  count: number
  localities: { name: string; count: number }[]
}

/** Towns (with their quartiers) that have hazards — place filter facets. */
export const listHazardPlaces = (f: { status?: string; type?: string } = {}) =>
  request<HazardPlace[]>(`${P}/hazards/places${qs({ ...f })}`)

export interface GeocodeBackfillState {
  running: boolean
  started?: boolean | null
  pending: number
  processed: number
  updated: number
  failed: number
  hazards_updated: number
  stopped_reason: string | null
}

export const getGeocodeBackfill = () => request<GeocodeBackfillState>(`${P}/hazards/geocode/backfill`)
export const startGeocodeBackfill = (limit = 200) =>
  post<GeocodeBackfillState>(`${P}/hazards/geocode/backfill${qs({ limit })}`, {})

/** Members of a hazard detail, whatever key the server used. */
export const hazardMembers = (h: HazardDetail): HazardMember[] => h.detections ?? h.members ?? []

// ── Cluster areas ────────────────────────────────────────────────────────────

export const listClusterAreas = () => request<ClusterArea[] | ListOut<ClusterArea>>(`${P}/cluster-areas/`)
  .then((r) => (Array.isArray(r) ? r : r.items))
export const createClusterArea = (body: ClusterAreaInput) => post<ClusterArea>(`${P}/cluster-areas/`, body)
export const updateClusterArea = (id: string, body: Partial<ClusterAreaInput>) =>
  request<ClusterArea>(`${P}/cluster-areas/${id}`, { method: "PATCH", body: JSON.stringify(body) })
export const deleteClusterArea = (id: string) => request<void>(`${P}/cluster-areas/${id}`, { method: "DELETE" })

// ── Validation settings (platform-settings section "validation") ────────────

export const getValidationSettings = () =>
  request<{ validation?: ValidationSettings }>(`${P}/platform-settings/`).then((all) => all.validation ?? null)
export const saveValidationSettings = (body: Partial<ValidationSettings>) =>
  request<ValidationSettings>(`${P}/platform-settings/validation`, { method: "PUT", body: JSON.stringify(body) })

// ── Constants shared by the screens ──────────────────────────────────────────

export const DETECTION_TYPES = ["pothole", "traffic_sign", "speed_bump", "parked_vehicle"] as const
export const SUBTYPES: Record<string, string[]> = {
  pothole: [],
  traffic_sign: ["speed_limit", "stop", "yield", "no_entry", "warning", "direction", "other"],
  speed_bump: [],
  parked_vehicle: ["blocking", "wrong_side", "roadside"],
}
export const FINAL_STATUSES: ReviewStatus[] = ["validated", "corrected", "rejected", "resolved"]
