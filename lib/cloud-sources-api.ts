/**
 * Typed client for cloud sources — an input source of the platform next to
 * manual upload and streams (Module 7, RRAP-07-002/004): drive connections,
 * folder browsing, imports and their live progress.
 * Backend: /cloud-connections (browse, thumbnail, imports) and /imports.
 * Connection CRUD and the OAuth callback reuse lib/module7-api.ts.
 */
import { request } from "@/lib/auth-api"
import type { CloudConnection, SftpInfo, SftpLinkState } from "@/lib/module7-api"

const P = "/api/proxy"
const json = (body: unknown) => ({ body: JSON.stringify(body) })

export type { CloudConnection, SftpInfo, SftpLinkState }

export interface CloudProviderInfo {
  id: "google_drive" | "onedrive" | "sftp" | string
  label: string
  /** "oauth" = account consent at the provider; "server" = SFTP profile + secrets file. */
  auth?: "oauth" | "server"
  configured: boolean
  supports_search: boolean
  search_recursive: boolean
  supports_thumbnails: boolean
  supports_resume: boolean
}

export interface ImportInfo {
  state: "none" | "importing" | "imported" | "changed"
  job_id: string | null
  item_id: string | null
  batch_id: string | null
}

export interface DriveEntry {
  id: string
  name: string
  kind: "folder" | "file"
  mime_type: string | null
  media: "video" | "image" | null
  importable: boolean
  size: number | null
  modified: string | null
  duration_s: number | null
  width: number | null
  height: number | null
  child_count: number | null
  has_thumbnail: boolean
  web_url: string | null
  path: string | null
  imported: ImportInfo | null
}

export interface Crumb { id: string; name: string }

export interface BrowsePage {
  connection_id: string
  folder_id: string | null
  breadcrumbs: Crumb[]
  folders: DriveEntry[]
  files: DriveEntry[]
  next_page_token: string | null
  query: string | null
  search_recursive: boolean
}

export type ImportItemStatus =
  | "queued" | "downloading" | "uploading_to_storage" | "queued_for_processing" | "processing"
  | "done" | "failed" | "skipped_duplicate" | "cancelled"

export type ImportBatchStatus = "queued" | "running" | "done" | "completed_with_errors" | "failed" | "cancelled"

export interface ImportItem {
  id: string
  batch_id: string
  file_id: string
  name: string
  path: string | null
  mime_type: string | null
  status: ImportItemStatus
  phase_status: string
  bytes_total: number | null
  bytes_done: number
  percent: number | null
  speed_bps: number | null
  eta_s: number | null
  attempts: number
  error: string | null
  job_id: string | null
  job_status: string | null
  job_progress: number | null
  job_detections: number | null
  duplicate_of_job_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string | null
}

export interface ImportBatch {
  id: string
  connection_id: string | null
  provider: string
  connection_name: string | null
  origin: "manual" | "sync"
  models: string[]
  frame_skip: number | null
  options: Record<string, unknown>
  item_count: number
  cancel_requested: boolean
  created_by: string | null
  created_at: string
  finished_at: string | null
  status: ImportBatchStatus
  counts: Partial<Record<ImportItemStatus, number>>
  bytes_total: number
  bytes_done: number
  speed_bps: number | null
  download_eta_s: number | null
  progress: number
  active: boolean
  items?: ImportItem[] | null
}

export interface ImportRequest {
  files: string[]
  folder_ids: string[]
  models: string[]
  frame_skip?: number | null
  options: { include_subfolders: boolean; reimport: boolean }
}

export const listProviders = () => request<CloudProviderInfo[]>(`${P}/cloud-connections/providers`)

export function browseDrive(connectionId: string, params: { folderId?: string | null; pageToken?: string | null; q?: string | null } = {},
  init?: RequestInit): Promise<BrowsePage> {
  const q = new URLSearchParams()
  if (params.folderId) q.set("folder_id", params.folderId)
  if (params.pageToken) q.set("page_token", params.pageToken)
  if (params.q) q.set("q", params.q)
  const s = q.toString()
  return request<BrowsePage>(`${P}/cloud-connections/${connectionId}/browse${s ? `?${s}` : ""}`, init)
}

export const thumbnailUrl = (connectionId: string, fileId: string) =>
  `${P}/cloud-connections/${connectionId}/thumbnail/${encodeURIComponent(fileId)}`

export const createImport = (connectionId: string, body: ImportRequest) =>
  request<ImportBatch>(`${P}/cloud-connections/${connectionId}/imports`, { method: "POST", ...json(body) })

export function listImports(params: { connectionId?: string; active?: boolean; includeItems?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams()
  if (params.connectionId) q.set("connection_id", params.connectionId)
  if (params.active !== undefined) q.set("active", String(params.active))
  if (params.includeItems) q.set("include_items", "true")
  q.set("limit", String(params.limit ?? 20))
  return request<{ total: number; active: number; items: ImportBatch[] }>(`${P}/imports/?${q}`)
}

export const getImport = (id: string) => request<ImportBatch>(`${P}/imports/${id}`)
export const cancelImport = (id: string) => request<ImportBatch>(`${P}/imports/${id}/cancel`, { method: "POST" })
export const retryImport = (id: string) => request<ImportBatch>(`${P}/imports/${id}/retry`, { method: "POST" })
export const deleteImport = (id: string) => request<void>(`${P}/imports/${id}`, { method: "DELETE" })
export const cancelImportItem = (batchId: string, itemId: string) =>
  request<ImportBatch>(`${P}/imports/${batchId}/items/${itemId}/cancel`, { method: "POST" })
export const retryImportItem = (batchId: string, itemId: string) =>
  request<ImportBatch>(`${P}/imports/${batchId}/items/${itemId}/retry`, { method: "POST" })

export interface AutoImportPatch {
  folder_id?: string | null
  folder_name?: string | null
  auto_import?: boolean
  auto_import_models?: string[] | null
  auto_import_frame_skip?: number | null
}

export const reauthorizeConnection = (id: string) =>
  request<{ connection: CloudConnection; authorize_url: string }>(`${P}/cloud-connections/${id}/authorize`, { method: "POST" })

export const updateAutoImport = (id: string, body: AutoImportPatch) =>
  request<CloudConnection>(`${P}/cloud-connections/${id}`, { method: "PATCH", ...json(body) })

// ── formatting ───────────────────────────────────────────────────────────────

export function formatBytes(n: number | null | undefined, locale?: string): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  const digits = i === 0 || v >= 100 ? 0 : 1
  return `${v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[i]}`
}

export const formatSpeed = (bps: number | null | undefined, locale?: string) =>
  bps == null || bps <= 0 ? "—" : `${formatBytes(bps, locale)}/s`

/** "33 s", "4 min 05 s", "1 h 02 min". */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const s = Math.max(1, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`
  if (m > 0) return `${m} min ${String(sec).padStart(2, "0")} s`
  return `${sec} s`
}

export const isActiveItem = (s: ImportItemStatus) =>
  s === "queued" || s === "downloading" || s === "uploading_to_storage" || s === "queued_for_processing" || s === "processing"

// ── SFTP servers ─────────────────────────────────────────────────────────────

export interface SftpServerInput {
  name?: string | null
  host: string
  port: number
  username: string
  /** Absolute folder browsing starts at; empty = the user's home. */
  base_path?: string | null
  /** Write-only: stored encrypted by the API, never returned. Omitted / empty on edit = keep it. */
  password?: string
}

export interface SftpLogLine {
  seq: number
  ts: string
  level: "status" | "error"
  message: string
  source: string
}

export interface SftpLog {
  connection_id: string
  link_state: SftpLinkState
  link_message: string | null
  link_at: string | null
  link_held?: boolean
  last_seq: number
  lines: SftpLogLine[]
}

export const createSftpServer = (body: SftpServerInput) =>
  request<CloudConnection>(`${P}/cloud-connections/sftp`, { method: "POST", ...json(body) })
export const updateSftpServer = (id: string, body: Partial<SftpServerInput>) =>
  request<CloudConnection>(`${P}/cloud-connections/${id}/sftp`, { method: "PATCH", ...json(body) })
export const connectSftp = (id: string) =>
  request<{ connection: CloudConnection; base_path: string; entries: number }>(
    `${P}/cloud-connections/${id}/sftp/connect`, { method: "POST" })
export const disconnectSftp = (id: string) =>
  request<CloudConnection>(`${P}/cloud-connections/${id}/sftp/disconnect`, { method: "POST" })
export const forgetSftpHostKey = (id: string) =>
  request<CloudConnection>(`${P}/cloud-connections/${id}/sftp/forget-host-key`, { method: "POST" })
export const getSftpLog = (id: string, after = 0, init?: RequestInit) =>
  request<SftpLog>(`${P}/cloud-connections/${id}/sftp/log?after=${after}`, init)
export const clearSftpLog = (id: string) =>
  request<void>(`${P}/cloud-connections/${id}/sftp/log`, { method: "DELETE" })

/** "14:02:11  Status:  Connecting to bi.camtrack.mg..." — what the Copy button puts on the clipboard. */
export function formatSftpLogLine(l: SftpLogLine, locale?: string): string {
  const d = new Date(l.ts)
  const time = Number.isNaN(d.getTime()) ? l.ts : d.toLocaleString(locale ?? "en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
  return `${time}  ${l.level === "error" ? "Error: " : "Status:"}  ${l.message}`
}

export interface ResolvedLink { id: string; name: string; kind: "folder" | "file"; breadcrumbs: Crumb[] }

/** OneDrive: open a folder from its address (share link or the browser's address bar) — folders
 *  shared through a link are listed neither under "Shared with me" nor under shortcuts. */
export const resolveCloudLink = (connectionId: string, url: string) =>
  request<ResolvedLink>(`${P}/cloud-connections/${connectionId}/resolve?url=${encodeURIComponent(url)}`)
