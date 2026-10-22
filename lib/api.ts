const API_BASE = "/api/proxy"

export interface ApiDetection {
  id: string
  job_id: string
  type: string
  subtype: string | null
  /** Traffic signs: the sign classifier's top-3 sign codes (score 0–1, descending). */
  class_candidates?: { code: string; score: number }[] | null
  confidence: number
  frame_number: number
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
  rpm: number | null
  review_status: "pending" | "validated" | "rejected" | "resolved"
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  resolved_at: string | null
  created_at: string
  // Also returned by GET /detections/ (DetectionOut) — readable address,
  // hazard membership, bounding box and recording time.
  display_location?: string | null
  road?: string | null
  locality?: string | null
  district?: string | null
  town?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  hazard_id?: string | null
  hazard_code?: string | null
  bbox_x1?: number | null
  bbox_y1?: number | null
  bbox_x2?: number | null
  bbox_y2?: number | null
  recorded_at?: string | null
  ai_details?: { vehicle_class?: string | null; severity?: string | null; [k: string]: unknown } | null
}

export interface DetectionListOut {
  total: number
  items: ApiDetection[]
}

export async function fetchDetections(params: {
  job_id?: string
  review_status?: string
  skip?: number
  limit?: number
}): Promise<DetectionListOut> {
  const q = new URLSearchParams()
  if (params.job_id) q.set("job_id", params.job_id)
  if (params.review_status) q.set("review_status", params.review_status)
  if (params.skip !== undefined) q.set("skip", String(params.skip))
  if (params.limit !== undefined) q.set("limit", String(params.limit))
  const res = await fetch(`${API_BASE}/detections/?${q}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch detections")
  return res.json()
}

/** The API serves at most this many detections per page. */
const DETECTIONS_PAGE_MAX = 200

/** Up to `max` detections, fetched page by page (the API caps a page at 200). */
export async function fetchAllDetections(
  params: { job_id?: string; review_status?: string } = {},
  max = 1000,
): Promise<DetectionListOut> {
  const first = await fetchDetections({ ...params, skip: 0, limit: Math.min(DETECTIONS_PAGE_MAX, max) })
  const items = [...first.items]
  while (items.length < Math.min(first.total, max)) {
    const page = await fetchDetections({
      ...params, skip: items.length, limit: Math.min(DETECTIONS_PAGE_MAX, max - items.length),
    })
    if (!page.items.length) break
    items.push(...page.items)
  }
  return { ...first, items }
}

export async function correctLocation(id: string, raw_gps_text: string): Promise<ApiDetection> {
  const res = await fetch(`${API_BASE}/detections/${id}/location`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_gps_text, reviewed_by: "validator" }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to update location")
  }
  return res.json()
}

export async function reviewDetection(
  id: string,
  status: "validated" | "rejected",
  opts: { label?: string; severity_score?: number; note?: string } = {}
): Promise<ApiDetection> {
  const res = await fetch(`${API_BASE}/detections/${id}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      reviewed_by: "validator",
      label: opts.label,
      severity_score: opts.severity_score,
      note: opts.note,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to review detection")
  }
  return res.json()
}

export interface JobOut {
  id: string
  filename: string
  status: "pending" | "processing" | "done" | "failed" | "cancelled"
  enabled_models: string | null
  total_frames: number
  processed: number
  detections: number
  error: string | null
  created_at: string
  finished_at: string | null
}

export async function submitJob(file: File, models: string[]): Promise<JobOut> {
  const form = new FormData()
  form.append("file", file)
  const q = models.length ? `?models=${models.join(",")}` : ""
  const res = await fetch(`${API_BASE}/jobs/${q}`, { method: "POST", body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.detail === "string" ? err.detail : err.detail?.message || "Failed to submit job")
  }
  return res.json()
}

export async function getJob(jobId: string): Promise<JobOut> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch job")
  return res.json()
}

export async function fetchJobs(skip = 0, limit = 50): Promise<JobOut[]> {
  const res = await fetch(`${API_BASE}/jobs/?skip=${skip}&limit=${Math.min(200, limit)}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch jobs")
  // GET /jobs/ returns {total, items} (Module 7); older servers returned a plain array.
  const data = await res.json()
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to delete job")
  }
}

/**
 * What a rejection teaches the training set:
 *  - false_positive: AI mistake → the crop becomes a negative example;
 *  - real_redundant: the object is real (duplicate / already validated) → positive sample;
 *  - unusable: can't judge → excluded from training.
 */
export type RejectionKind = "false_positive" | "real_redundant" | "unusable"
export const REJECTION_KINDS: RejectionKind[] = ["false_positive", "real_redundant", "unusable"]

export interface RejectionReason {
  id: string
  detection_type: string
  code: string
  label: string
  description: string
  /** Older servers omit it: treat as false_positive. */
  kind?: RejectionKind
  is_custom: boolean
  created_at: string
}

export async function fetchRejectionReasons(detection_type?: string): Promise<RejectionReason[]> {
  const q = detection_type ? `?detection_type=${detection_type}` : ""
  const res = await fetch(`${API_BASE}/rejection-reasons/${q}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch rejection reasons")
  return res.json()
}

export interface RejectionReasonPage { total: number; items: RejectionReason[] }

/** One page of the reasons of exactly one detection type (settings page). */
export async function fetchRejectionReasonPage(detection_type: string, opts: {
  skip?: number; limit?: number; q?: string; kind?: RejectionKind
} = {}): Promise<RejectionReasonPage> {
  const qs = new URLSearchParams({ detection_type, skip: String(opts.skip ?? 0), limit: String(opts.limit ?? 10) })
  if (opts.q?.trim()) qs.set("q", opts.q.trim())
  if (opts.kind) qs.set("kind", opts.kind)
  const res = await fetch(`${API_BASE}/rejection-reasons/page?${qs}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch rejection reasons")
  return res.json()
}

/** Number of reasons per detection type. */
export async function fetchRejectionReasonTypes(): Promise<{ detection_type: string; total: number }[]> {
  const res = await fetch(`${API_BASE}/rejection-reasons/types`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch rejection reasons")
  return res.json()
}

export async function createRejectionReason(body: {
  detection_type: string; code: string; label: string; description: string; kind?: RejectionKind
}): Promise<RejectionReason> {
  const res = await fetch(`${API_BASE}/rejection-reasons/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to create reason")
  }
  return res.json()
}

/** Edit a custom reason (system reasons answer 409). Changing `kind` re-files its past training samples. */
export async function updateRejectionReason(id: string, body: {
  label?: string; description?: string; kind?: RejectionKind
}): Promise<RejectionReason> {
  const res = await fetch(`${API_BASE}/rejection-reasons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to update reason")
  }
  return res.json()
}

// ─── Signalements ─────────────────────────────────────────────────────────────

export type SignalementType =
  | "embouteillage" | "police" | "accident" | "danger"
  | "route_fermee" | "voie_bloquee" | "probleme_de_carte"
  | "mauvais_temps" | "prix_carburant" | "assistance_route" | "debogage"
  | "nid_de_poule" | "obstacle" | "inondation" | "autre"
  | "vehicule_panne" | "dos_d_ane" | "route_glissante" | "eboulement"
  | "travaux" | "animaux" | "vehicule_dangereux"

export type SignalementStatus = "actif" | "annule" | "rejete"

export interface ApiSignalement {
  id: string
  type: SignalementType
  status: SignalementStatus
  latitude: number
  longitude: number
  description: string | null
  image_url: string | null
  reported_by: string | null
  moderated_by: string | null
  moderated_at: string | null
  moderation_note: string | null
  reported_at: string
  // Community votes — counted votes only (cast near the report, one per voter)
  present_count?: number
  absent_count?: number
  invalid_vote_count?: number
  ignore_count?: number          // devices that passed nearby without voting
  uncertain?: boolean
  last_confirmed_at?: string | null
  expires_at?: string | null
  expired?: boolean
}

export type VoteReason = "too_far" | "duplicate" | "no_position"

export interface SignalementVote {
  id: string
  vote: "present" | "absent"
  voter_user_id: string | null
  voter_email: string | null
  voter_device_id: string | null
  voter: string | null
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  counted: boolean
  reason: VoteReason | null
  created_at: string
}

export interface SignalementPass {
  id: string
  device_id: string | null
  user_id: string | null
  voter: string | null
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  counted: boolean
  voted: boolean
  created_at: string
}

export interface SignalementVoteList {
  total: number
  present_count: number
  absent_count: number
  invalid_vote_count: number
  vote_max_distance_m: number
  ignore_count: number
  uncertain: boolean
  items: SignalementVote[]
  passes: SignalementPass[]
}

export interface FlaggedVoter {
  voter: string | null
  voter_user_id: string | null
  voter_email: string | null
  voter_device_id: string | null
  invalid_votes: number
  too_far_votes: number
  total_votes: number
  reports: number
  last_vote_at: string
}

export async function fetchSignalementVotes(id: string): Promise<SignalementVoteList> {
  const res = await fetch(`${API_BASE}/signalements/${id}/votes`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch votes")
  return res.json()
}

export async function fetchFlaggedVoters(limit = 20): Promise<FlaggedVoter[]> {
  const res = await fetch(`${API_BASE}/signalements/votes/flagged?limit=${limit}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch flagged voters")
  return res.json()
}

export interface SignalementListOut {
  total: number
  items: ApiSignalement[]
}

export async function fetchSignalements(params: {
  status?: SignalementStatus | "all"
  type?: SignalementType | "all"
  skip?: number
  limit?: number
}): Promise<SignalementListOut> {
  const q = new URLSearchParams()
  if (params.status && params.status !== "all") q.set("status", params.status)
  if (params.type   && params.type   !== "all") q.set("type",   params.type)
  if (params.skip  !== undefined) q.set("skip",  String(params.skip))
  if (params.limit !== undefined) q.set("limit", String(params.limit))
  const res = await fetch(`${API_BASE}/signalements/?${q}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch signalements")
  return res.json()
}

export async function moderateSignalement(
  id: string,
  status: "annule" | "rejete" | "actif",   // "actif" restores a hidden report
  moderated_by: string,
  note?: string,
): Promise<ApiSignalement> {
  const res = await fetch(`${API_BASE}/signalements/${id}/moderate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, moderated_by, note }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((typeof err.detail === "string" ? err.detail : err.detail?.message) || "Failed to moderate signalement")
  }
  return res.json()
}

export async function deleteSignalement(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/signalements/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to delete signalement")
  }
}

// ─── Cluster config ──────────────────────────────────────────────────────────

export interface ClusterConfig {
  radius_m: number
}

export async function fetchClusterConfig(): Promise<ClusterConfig> {
  const res = await fetch(`${API_BASE}/cluster-config/`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch cluster config")
  return res.json()
}

export async function saveClusterConfig(radius_m: number): Promise<ClusterConfig> {
  const res = await fetch(`${API_BASE}/cluster-config/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ radius_m }),
  })
  if (!res.ok) throw new Error("Failed to save cluster config")
  return res.json()
}

// ─── Clusters ─────────────────────────────────────────────────────────────────

export interface ClusterOut {
  cluster_id: number
  centroid_lat: number
  centroid_lon: number
  count: number
  resolved_count: number
  is_resolved: boolean
  detection_ids: string[]
  detection_coords: [number, number][]  // [lat, lon][]
}

export interface ClusteredDetectionsOut {
  radius_m: number
  total_detections: number
  total_clusters: number
  active_clusters: number
  resolved_clusters: number
  clusters: ClusterOut[]
}

export async function fetchClusters(params: {
  type?: string
  subtype?: string
  job_id?: string
} = {}): Promise<ClusteredDetectionsOut> {
  const body: Record<string, string> = {}
  if (params.type)    body.type    = params.type
  if (params.subtype) body.subtype = params.subtype
  if (params.job_id)  body.job_id  = params.job_id
  const res = await fetch(`${API_BASE}/detections/clusters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error("Failed to fetch clusters")
  return res.json()
}

export async function resolveCluster(
  detection_ids: string[],
  new_detection_count: number,
  resolved_by?: string,
): Promise<DetectionListOut> {
  const res = await fetch(`${API_BASE}/detections/clusters/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detection_ids, new_detection_count, resolved_by }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to resolve cluster")
  }
  return res.json()
}

/** Convert minio:9000/bucket/path → /api/media/bucket/path */
export function resolveMinioUrl(url: string | null): string | null {
  if (!url) return null
  // Strip any protocol+host prefix (e.g. "minio:9000/" or "http://minio:9000/")
  const path = url.replace(/^(?:https?:\/\/)?[^/]+\//, "")
  return `/api/media/${path}`
}
