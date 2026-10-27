/**
 * Typed client for Module 7 — ingestion & processing jobs, stream sources,
 * cloud storage connections and the `processing` / `cloud` settings sections.
 * Contract: docs/spec-module7-jobs.md §1–6.
 *
 * Errors are thrown as ApiError (see lib/auth-api.ts) so screens can use
 * errorText(t, err, "m7.jobs") to translate `{code}` values such as
 * `invalid_transition`, `retry_limit`, `source_unavailable`,
 * `has_reviewed_detections`.
 */
import { ApiError, request, type ApiErrorDetail } from "@/lib/auth-api"

const P = "/api/proxy"
const json = (body: unknown) => ({ body: JSON.stringify(body) })

// ── Models ───────────────────────────────────────────────────────────────────

/** Backend model identifiers (processor) ↔ ids used by <ModelSelector>. */
export const BACKEND_MODELS = ["pothole", "signs", "speedbump", "vehicles"] as const
export const UI_TO_BACKEND_MODEL: Record<string, string> = {
  potholes: "pothole",
  traffic_lights: "signs",
  speed_hump: "speedbump",
  vehicles: "vehicles",
}
export const BACKEND_TO_UI_MODEL: Record<string, string> = Object.fromEntries(
  Object.entries(UI_TO_BACKEND_MODEL).map(([ui, be]) => [be, ui]),
)
export const toBackendModels = (ids: string[]) => ids.map((m) => UI_TO_BACKEND_MODEL[m] ?? m)
export const toUiModels = (ids: string[]) => ids.map((m) => BACKEND_TO_UI_MODEL[m] ?? m)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a backend timestamp; naive values are UTC. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "1h 02m", "3m 05s", "42s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`
  return `${sec}s`
}

/** Accept either a plain array or `{items}` / `{total, items}`. */
export function normalizeList<T>(data: unknown): { total: number; items: T[] } {
  if (Array.isArray(data)) return { total: data.length, items: data as T[] }
  if (data && typeof data === "object") {
    const o = data as { items?: unknown; total?: unknown }
    const items = Array.isArray(o.items) ? (o.items as T[]) : []
    return { total: typeof o.total === "number" ? o.total : items.length, items }
  }
  return { total: 0, items: [] }
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export type JobStatus = "pending" | "processing" | "done" | "failed" | "cancelled"
export type JobSourceType = "upload" | "google_drive" | "onedrive" | "sftp" | "stream"
export const JOB_STATUSES: JobStatus[] = ["pending", "processing", "done", "failed", "cancelled"]
export const JOB_SOURCES: JobSourceType[] = ["upload", "google_drive", "onedrive", "sftp", "stream"]

export interface Job {
  id: string
  filename: string
  status: JobStatus
  enabled_models: string | string[] | null
  total_frames: number
  processed: number
  detections: number
  error: string | null
  created_at: string
  finished_at: string | null
  source_type?: JobSourceType | null
  source_ref?: string | null
  source_name?: string | null
  connection_id?: string | null
  stream_id?: string | null
  submitted_by?: string | null
  started_at?: string | null
  cancel_requested?: boolean | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  attempts?: number | null
  max_attempts?: number | null
  avg_confidence?: number | null
  frame_skip?: number | null
  detections_by_model?: Record<string, number> | null
  fps?: number | null
  duration_s?: number | null
  /** Dashcam overlay layout asked at submission (null = auto / settings `osd`). */
  osd_layout_requested?: string | null
  /** Overlay layout used: a profile (`total`, `besafe` …), `full_frame` or `none`. */
  osd_layout?: string | null
  processing_seconds?: number | null
  /** 0..1 */
  progress?: number | null
}

export type JobEventType =
  | "created" | "queued" | "started" | "progress_failed" | "failed"
  | "cancel_requested" | "cancelled" | "retried" | "done"

export interface JobEvent {
  id: string | number
  job_id: string
  at: string
  event: JobEventType | string
  actor: string | null
  details: Record<string, unknown> | null
}

export interface JobDetail extends Job { events: JobEvent[] }

export interface JobCapacity {
  max_concurrent_jobs: number
  running: number
  pending: number
  worker_concurrency: number
}

export interface JobSummary {
  last_24h?: Partial<Record<JobStatus, number>>
  total?: Partial<Record<JobStatus, number>>
  [k: string]: unknown
}

/** Per-status counts from /jobs/summary, whichever of its shapes is returned. */
export function summaryCounts(s: JobSummary | null | undefined): Partial<Record<JobStatus, number>> | null {
  if (!s) return null
  const src = (s.total && typeof s.total === "object" ? s.total
    : (s as { by_status?: unknown }).by_status && typeof (s as { by_status?: unknown }).by_status === "object"
      ? (s as { by_status: Record<string, number> }).by_status
      : s) as Record<string, unknown>
  const out: Partial<Record<JobStatus, number>> = {}
  for (const st of JOB_STATUSES) if (typeof src[st] === "number") out[st] = src[st] as number
  return Object.keys(out).length ? out : null
}

export interface JobListParams {
  status?: JobStatus[] | string
  source_type?: JobSourceType | string
  search?: string
  date_from?: string
  date_to?: string
  sort?: string
  skip?: number
  limit?: number
}

export function jobModels(job: Pick<Job, "enabled_models">): string[] {
  const m = job.enabled_models
  if (!m) return []
  return (Array.isArray(m) ? m : m.split(",")).map((x) => x.trim()).filter(Boolean)
}

/** 0..100, from `progress` or processed/total_frames. */
export function jobPercent(job: Job): number {
  if (job.status === "done") return 100
  if (typeof job.progress === "number" && Number.isFinite(job.progress)) {
    return Math.max(0, Math.min(100, Math.round(job.progress <= 1 ? job.progress * 100 : job.progress)))
  }
  return job.total_frames > 0 ? Math.min(100, Math.round((job.processed / job.total_frames) * 100)) : 0
}

/** Seconds spent processing (server value, else computed). */
export function jobSeconds(job: Job): number | null {
  if (typeof job.processing_seconds === "number") return job.processing_seconds
  const start = parseDate(job.started_at)
  if (!start) return null
  const end = parseDate(job.finished_at ?? job.cancelled_at) ?? (job.status === "processing" ? new Date() : null)
  return end ? Math.max(0, (end.getTime() - start.getTime()) / 1000) : null
}

export const isActiveJob = (j: Pick<Job, "status">) => j.status === "pending" || j.status === "processing"

export async function listJobs(params: JobListParams = {}): Promise<{ total: number; items: Job[] }> {
  const q = new URLSearchParams()
  const status = Array.isArray(params.status) ? params.status.join(",") : params.status
  if (status) q.set("status", status)
  if (params.source_type) q.set("source_type", params.source_type)
  if (params.search) q.set("search", params.search)
  if (params.date_from) q.set("date_from", params.date_from)
  if (params.date_to) q.set("date_to", params.date_to)
  if (params.sort) q.set("sort", params.sort)
  if (params.skip !== undefined) q.set("skip", String(params.skip))
  if (params.limit !== undefined) q.set("limit", String(Math.min(200, params.limit)))
  const data = await request<unknown>(`${P}/jobs/?${q}`)
  return normalizeList<Job>(data)
}

export const getJob = (id: string) =>
  request<JobDetail>(`${P}/jobs/${id}`).then((j) => ({ ...j, events: j.events ?? [] }))
export const cancelJob = (id: string) => request<Job>(`${P}/jobs/${id}/cancel`, { method: "POST" })
export const retryJob = (id: string) => request<Job>(`${P}/jobs/${id}/retry`, { method: "POST" })
export const deleteJob = (id: string) => request<void>(`${P}/jobs/${id}`, { method: "DELETE" })
export const getJobCapacity = () => request<JobCapacity>(`${P}/jobs/capacity`)
export const getJobSummary = () => request<JobSummary>(`${P}/jobs/summary`)

/** Build the POST /jobs/ URL (query `models`, optional `frame_skip`, `force`). */
export function jobSubmitUrl(models: string[], frameSkip?: number | null, force = false): string {
  const q = new URLSearchParams()
  if (models.length) q.set("models", models.join(","))
  if (frameSkip != null) q.set("frame_skip", String(frameSkip))
  if (force) q.set("force", "true")
  const s = q.toString()
  return `${P}/jobs/${s ? `?${s}` : ""}`
}

/** Multipart submit (request() would force a JSON content type). */
export async function submitJob(file: File, models: string[], frameSkip?: number | null, force = false): Promise<Job> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(jobSubmitUrl(models, frameSkip, force), { method: "POST", body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const raw = data?.detail
    const detail: ApiErrorDetail = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw : { code: "error", message: String(raw ?? "") }
    throw new ApiError(res.status, detail)
  }
  return data as Job
}

/**
 * 409 `duplicate_video` of POST /jobs/: the same video content (sha256) was
 * already processed or is queued. Re-send with `force` to process it again.
 */
export interface DuplicateVideoDetail {
  code: "duplicate_video"
  message?: string
  job_id: string
  job_status?: JobStatus | string | null
  filename?: string | null
  processed_at?: string | null
  fingerprint?: string | null
}

export function asDuplicateVideo(detail: unknown): DuplicateVideoDetail | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
  const d = detail as Record<string, unknown>
  return d.code === "duplicate_video" && typeof d.job_id === "string" ? (d as unknown as DuplicateVideoDetail) : null
}

// ── Streams ──────────────────────────────────────────────────────────────────

export type StreamStatus = "active" | "paused" | "error"

export interface StreamSource {
  id: string
  name: string
  url: string
  camera_type: string | null
  status: StreamStatus
  segment_seconds: number
  frame_skip: number | null
  enabled_models: string[] | null
  last_segment_at: string | null
  last_error: string | null
  segments_processed: number
  created_by: string | null
  created_at: string
}

export interface StreamInput {
  name: string
  url: string
  camera_type: string | null
  segment_seconds: number
  frame_skip: number | null
  enabled_models: string[]
}

export interface StreamTestResult {
  ok: boolean
  error?: string | null
  resolution?: string | null
  width?: number | null
  height?: number | null
}

export const listStreams = () => request<unknown>(`${P}/streams/`).then((d) => normalizeList<StreamSource>(d).items)
export const getStream = (id: string) => request<StreamSource>(`${P}/streams/${id}`)
export const createStream = (body: StreamInput) => request<StreamSource>(`${P}/streams/`, { method: "POST", ...json(body) })
export const updateStream = (id: string, body: Partial<StreamInput>) =>
  request<StreamSource>(`${P}/streams/${id}`, { method: "PATCH", ...json(body) })
export const deleteStream = (id: string) => request<void>(`${P}/streams/${id}`, { method: "DELETE" })
export const startStream = (id: string) => request<StreamSource>(`${P}/streams/${id}/start`, { method: "POST" })
export const pauseStream = (id: string) => request<StreamSource>(`${P}/streams/${id}/pause`, { method: "POST" })
export const testStream = (id: string) => request<StreamTestResult>(`${P}/streams/${id}/test`, { method: "POST" })

// ── Cloud connections ────────────────────────────────────────────────────────

export type CloudProvider = "google_drive" | "onedrive" | "sftp"
export type CloudConnectionStatus = "pending_auth" | "active" | "error" | "disabled"

export interface CloudConnection {
  id: string
  provider: CloudProvider
  name: string
  account_email: string | null
  folder_id: string | null
  folder_name: string | null
  status: CloudConnectionStatus
  created_by: string | null
  created_at: string
  last_sync_at: string | null
  last_sync_status: "ok" | "error" | null
  last_sync_error: string | null
  last_sync_files: number | null
  files_imported_total: number | null
  enabled: boolean
  /** Watched folder imported automatically (cloud sources page). */
  auto_import?: boolean
  auto_import_models?: string[] | null
  auto_import_frame_skip?: number | null
  authorized?: boolean
  /** SFTP server profile (provider "sftp") — the password is never returned. */
  sftp?: SftpInfo | null
}

export type SftpLinkState = "disconnected" | "connecting" | "connected" | "error"

export interface SftpInfo {
  host: string
  port: number
  username: string
  base_path: string | null
  password_key: string
  /** Line to set in infra/secrets/sftp.env (the value is never shown). */
  password_var: string
  credentials: "password" | "key" | null
  host_key_fingerprint: string | null
  host_key_trusted_at: string | null
  link_state: SftpLinkState
  link_message: string | null
  link_at: string | null
  /** Disconnected by the user: browsing does not reconnect until Connect. */
  link_held?: boolean
}

export interface CloudFolder { id: string; name: string; path?: string | null; has_children?: boolean | null }

export const listCloudConnections = () =>
  request<unknown>(`${P}/cloud-connections/`).then((d) => normalizeList<CloudConnection>(d).items)
export const createCloudConnection = (body: { provider: CloudProvider; name: string; folder_id?: string | null }) =>
  request<{ connection: CloudConnection; authorize_url: string }>(`${P}/cloud-connections/`, { method: "POST", ...json(body) })
export const completeCloudOAuth = (code: string, state: string) =>
  request<CloudConnection | { connection: CloudConnection }>(`${P}/cloud-connections/oauth/complete`, {
    method: "POST", ...json({ code, state }),
  }).then((r) => (r && typeof r === "object" && "connection" in r ? r.connection : r) as CloudConnection)
export const updateCloudConnection = (id: string, body: Partial<Pick<CloudConnection, "name" | "folder_id" | "enabled">>) =>
  request<CloudConnection>(`${P}/cloud-connections/${id}`, { method: "PATCH", ...json(body) })
export const deleteCloudConnection = (id: string) => request<void>(`${P}/cloud-connections/${id}`, { method: "DELETE" })
export const syncCloudConnection = (id: string) =>
  request<unknown>(`${P}/cloud-connections/${id}/sync`, { method: "POST" })
export async function listCloudFolders(id: string, parent?: string | null): Promise<CloudFolder[]> {
  const q = parent ? `?parent=${encodeURIComponent(parent)}` : ""
  const data = await request<unknown>(`${P}/cloud-connections/${id}/folders${q}`)
  if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as { folders?: unknown }).folders)) {
    return (data as { folders: CloudFolder[] }).folders
  }
  return normalizeList<CloudFolder>(data).items
}

// ── Settings sections `processing` / `cloud` ────────────────────────────────

export interface ProcessingSettings {
  max_concurrent_jobs: number
  /** Cloud imports downloading at once (optional for older backends). */
  cloud_import_concurrency?: number
  max_attempts: number
  frame_skip_default: number
  frame_skip_by_source: Record<string, number>
  frame_skip_by_model: Record<string, number>
  retain_failed_hours: number
}

export interface CloudSettings {
  google_client_id: string
  google_client_secret_set?: boolean
  microsoft_client_id: string
  microsoft_client_secret_set?: boolean
  microsoft_tenant: string
  sync_interval_minutes: number
  /** The OAuth redirect URI the server really sends to Google / Microsoft (register exactly this). */
  redirect_uri?: string
  [k: string]: unknown
}

export interface Module7Settings {
  processing: ProcessingSettings | null
  cloud: CloudSettings | null
}

export const DEFAULT_PROCESSING: ProcessingSettings = {
  max_concurrent_jobs: 2,
  max_attempts: 3,
  frame_skip_default: 5,
  frame_skip_by_source: { upload: 5, google_drive: 5, onedrive: 5, sftp: 5, stream: 10 },
  frame_skip_by_model: {},
  retain_failed_hours: 72,
  cloud_import_concurrency: 2,
}

export async function getModule7Settings(): Promise<Module7Settings> {
  const all = await request<Record<string, unknown>>(`${P}/platform-settings/`)
  return {
    processing: (all?.processing as ProcessingSettings | undefined) ?? null,
    cloud: (all?.cloud as CloudSettings | undefined) ?? null,
  }
}
export const saveProcessingSettings = (body: Partial<ProcessingSettings>) =>
  request<ProcessingSettings>(`${P}/platform-settings/processing`, { method: "PUT", ...json(body) })
export const saveCloudSettings = (body: Record<string, unknown>) =>
  request<CloudSettings>(`${P}/platform-settings/cloud`, { method: "PUT", ...json(body) })

/** Fallback only (older server): the server's own `cloud.redirect_uri` is the address really used. */
export const cloudRedirectUri = () =>
  typeof window === "undefined" ? "/settings/cloud/callback" : `${window.location.origin}/settings/cloud/callback`

// ── Settings section `osd` — dashcam overlay layouts (RRAP-05-014) ───────────

export const OSD_FIELD_KINDS = ["date_time", "gps", "vehicle_no", "user_def", "rpm", "driver_id", "driver_name", "channel"] as const
export type OsdFieldKind = (typeof OSD_FIELD_KINDS)[number]

/** One overlay field as on the device's OSD screen: top-left anchor on the 0–1000 grid. */
export interface OsdField {
  field: OsdFieldKind
  enabled: boolean
  x: number
  y: number
  line_height?: number | null
  width?: number | null
}

export interface OsdProfile {
  label: string
  line_height: number
  x_margin?: number
  y_margin?: number
  fields: OsdField[]
  date_formats?: string[]
  gps_regex?: string | null
  plate_regex?: string | null
  timezone?: string | null
  detect?: boolean
  aliases?: string[]
}

export interface OsdSettings {
  default_layout: string
  profiles: Record<string, OsdProfile>
  by_vehicle: Record<string, string>
  by_source: Record<string, string>
  gps_box: number[] | null
  probe_frames: number
  full_frame_fallback: boolean
  neighbour_retry: boolean
}

export interface OsdLayoutInfo extends OsdProfile {
  name: string
  builtin: boolean
  rois: { field: string; box: [number, number, number, number] }[]
}

export const getOsdLayouts = () =>
  request<{ default_layout: string; layouts: OsdLayoutInfo[] }>(`${P}/jobs/osd-layouts`)
export async function getOsdSettings(): Promise<OsdSettings | null> {
  const all = await request<Record<string, unknown>>(`${P}/platform-settings/`)
  return (all?.osd as OsdSettings | undefined) ?? null
}
export const saveOsdSettings = (body: Partial<OsdSettings>) =>
  request<OsdSettings>(`${P}/platform-settings/osd`, { method: "PUT", ...json(body) })

/** OCR regions (frame ratios x0, y0, x1, y1) of the enabled fields — same rule as the
 *  backend (osd_layouts.derive_rois): from the anchor minus the margins, up to the next
 *  enabled field on the same line (else the frame edge), one line high. */
export function deriveOsdRois(p: Pick<OsdProfile, "fields" | "line_height" | "x_margin" | "y_margin">) {
  const on = p.fields.filter((f) => f.enabled)
  const xm = p.x_margin ?? 20, ym = p.y_margin ?? 15
  return on.map((f) => {
    const lh = f.line_height || p.line_height || 50
    const next = on.filter((g) => g !== f && g.x > f.x && Math.abs(g.y - f.y) < lh / 2).map((g) => g.x)
    const x1 = f.width ? f.x + f.width : next.length ? Math.min(...next) : 1000
    return {
      field: f.field,
      box: [Math.max(0, f.x - xm) / 1000, Math.max(0, f.y - ym) / 1000, Math.min(1000, x1) / 1000,
            Math.min(1000, f.y + lh) / 1000] as [number, number, number, number],
    }
  })
}
