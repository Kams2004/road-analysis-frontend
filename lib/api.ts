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
  review_status: "pending" | "validated" | "rejected"
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export interface DetectionListOut {
  total: number
  items: ApiDetection[]
}

export async function fetchDetections(params: {
  review_status?: string
  skip?: number
  limit?: number
}): Promise<DetectionListOut> {
  const q = new URLSearchParams()
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

// File uploads go directly to the FastAPI backend from the browser.
// The Next.js /api/proxy route has a ~4 MB body limit and cannot handle large videos.
// NEXT_PUBLIC_API_URL is injected at build time; falls back to localhost:8080 for dev.
const BACKEND = (typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080")
  : "http://localhost:8080")

export async function submitJob(file: File, models: string[]): Promise<JobOut> {
  const form = new FormData()
  form.append("file", file)
  const q = models.length ? `?models=${models.join(",")}` : ""
  const res = await fetch(`${BACKEND}/jobs/${q}`, { method: "POST", body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to submit job")
  }
  return res.json()
}

export async function getJob(jobId: string): Promise<JobOut> {
  const res = await fetch(`${BACKEND}/jobs/${jobId}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch job")
  return res.json()
}

/** Convert minio:9000/bucket/path → /api/media/bucket/path */
export function resolveMinioUrl(url: string | null): string | null {
  if (!url) return null
  // Strip any protocol+host prefix (e.g. "minio:9000/" or "http://minio:9000/")
  const path = url.replace(/^(?:https?:\/\/)?[^/]+\//, "")
  return `/api/media/${path}`
}
