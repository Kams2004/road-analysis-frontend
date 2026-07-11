const API_BASE = "/api/proxy"

export interface ApiDetection {
  id: string
  job_id: string
  type: string
  subtype: string | null
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
  status: "pending" | "processing" | "done" | "failed"
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
    throw new Error(err.detail || "Failed to submit job")
  }
  return res.json()
}

export async function getJob(jobId: string): Promise<JobOut> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch job")
  return res.json()
}

export async function fetchJobs(skip = 0, limit = 50): Promise<JobOut[]> {
  const res = await fetch(`${API_BASE}/jobs/?skip=${skip}&limit=${limit}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch jobs")
  return res.json()
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to delete job")
  }
}

export interface RejectionReason {
  id: string
  detection_type: string
  code: string
  label: string
  description: string
  is_custom: boolean
  created_at: string
}

export async function fetchRejectionReasons(detection_type?: string): Promise<RejectionReason[]> {
  const q = detection_type ? `?detection_type=${detection_type}` : ""
  const res = await fetch(`${API_BASE}/rejection-reasons/${q}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch rejection reasons")
  return res.json()
}

export async function createRejectionReason(body: {
  detection_type: string; code: string; label: string; description: string
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

// ─── Signalements ─────────────────────────────────────────────────────────────

export type SignalementType =
  | "embouteillage" | "police" | "accident" | "danger"
  | "route_fermee" | "voie_bloquee" | "probleme_de_carte"
  | "mauvais_temps" | "prix_carburant" | "assistance_route" | "debogage"

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
  status: "annule" | "rejete",
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
    throw new Error(err.detail || "Failed to moderate signalement")
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
