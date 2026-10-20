/**
 * Client helpers for authentication, profile and administration endpoints.
 * Everything goes through /api/proxy (session cookie → bearer token) except
 * sign-in/out and MFA steps, which use /api/session so the token stays in an
 * httpOnly cookie.
 */
import type { RouteSection } from "@/lib/routes-api"
import type { Lang } from "@/lib/i18n"

const P = "/api/proxy"

export type Action = "view" | "add" | "edit" | "delete"
export type MapProviderPref = "default" | "osm" | "google"

export interface RoleRef { id: string; name: string }

export interface Me {
  id: string
  email: string
  username: string | null
  full_name: string
  phone: string | null
  whatsapp: string | null
  status: "active" | "inactive"
  /** "staff" = created by an administrator; "mobile" = self-registered from the VIASafe app. */
  account_type: "staff" | "mobile"
  language: Lang
  map_provider: MapProviderPref
  mfa_enabled: boolean
  mfa_required: boolean
  roles: RoleRef[]
  permissions: Record<string, Action[]>
  last_login_at: string | null
}

export interface LoginResult {
  status: "ok" | "mfa_required" | "mfa_setup_required"
  challenge_token?: string | null
  expires_at?: string | null
  user?: Me | null
}

export interface ApiErrorDetail {
  code?: string
  message?: string
  [k: string]: unknown
}

export class ApiError extends Error {
  status: number
  detail: ApiErrorDetail
  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message || `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }
}

export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init.headers,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const raw = data?.detail
    const detail: ApiErrorDetail =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : { code: res.status === 422 ? "validation_error" : "error",
            message: Array.isArray(raw) ? raw.map((e: { msg?: string }) => e.msg).join("; ") : String(raw ?? data?.error ?? "") }
    throw new ApiError(res.status, detail)
  }
  return data as T
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

/** Translate an API error: auth.err.<code> / <scope>.err.<code>, else server text. */
export function errorText(t: (k: string, v?: Record<string, string | number>) => string, err: unknown, scope = "auth"): string {
  if (err instanceof ApiError) {
    const code = err.detail.code
    const vars: Record<string, string | number> = {}
    if (typeof err.detail.locked_until === "string") vars.time = new Date(err.detail.locked_until).toLocaleTimeString()
    if (Array.isArray(err.detail.requirements)) vars.details = (err.detail.requirements as string[]).join(", ")
    if (typeof err.detail.active_user_count === "number") vars.count = err.detail.active_user_count
    for (const key of [`${scope}.err.${code}`, `auth.err.${code}`]) {
      const text = t(key, vars)
      if (text !== key) return text
    }
    return err.detail.message || t("common.error")
  }
  return t("common.error")
}

// ── Public / session ─────────────────────────────────────────────────────────

export interface AuthConfig {
  captcha: { provider: "turnstile" | "recaptcha" | "hcaptcha" | "disabled"; site_key: string }
  languages: Lang[]
  password_min_length: number
}

export const getAuthConfig = () => request<AuthConfig>(`${P}/auth/config`)
export const login = (identifier: string, password: string, captcha_token: string | null, remember = true) =>
  request<LoginResult>("/api/session/login", { method: "POST", ...json({ identifier, password, captcha_token, remember }) })
export const mfaVerify = (challenge_token: string, code: string, remember = true) =>
  request<LoginResult>("/api/session/mfa-verify", { method: "POST", ...json({ challenge_token, code, remember }) })
export const mfaSetup = (challenge_token?: string) =>
  request<{ secret: string; otpauth_uri: string }>("/api/session/mfa-setup", { method: "POST", ...json({ challenge_token }) })
export const mfaEnable = (code: string, challenge_token?: string, remember = true) =>
  request<LoginResult>("/api/session/mfa-enable", { method: "POST", ...json({ code, challenge_token, remember }) })
export const logout = () => request<{ message: string }>("/api/session/logout", { method: "POST" })

export const forgotPassword = (email: string, captcha_token: string | null) =>
  request<{ message: string }>(`${P}/auth/password/forgot`, { method: "POST", ...json({ email, captcha_token }) })
export const checkResetToken = (token: string) =>
  request<{ valid: boolean; email: string | null }>(`${P}/auth/password/reset/check`, { method: "POST", ...json({ token }) })
export const resetPassword = (token: string, new_password: string) =>
  request<{ message: string }>(`${P}/auth/password/reset`, { method: "POST", ...json({ token, new_password }) })

// ── Profile ──────────────────────────────────────────────────────────────────

export const getMe = () => request<Me>(`${P}/auth/me`)
export const updateMe = (body: Partial<Pick<Me, "full_name" | "phone" | "whatsapp" | "language" | "map_provider">>) =>
  request<Me>(`${P}/auth/me`, { method: "PATCH", ...json(body) })
export const changePassword = (current_password: string, new_password: string) =>
  request<{ message: string }>(`${P}/auth/me/password`, { method: "POST", ...json({ current_password, new_password }) })
export const disableMfa = (password: string, code: string) =>
  request<{ message: string }>(`${P}/auth/mfa/disable`, { method: "POST", ...json({ password, code }) })
export const logActivity = (screen: string) =>
  request<void>(`${P}/auth/activity`, { method: "POST", ...json({ screen }) }).catch(() => undefined)

// ── Map tiles ────────────────────────────────────────────────────────────────

export interface MapConfig {
  provider: "osm" | "google"
  tile_urls: string[]
  attribution: string
  max_zoom: number
  requested: string
  fallback_reason: string | null
  google_configured: boolean
}
export const getMapConfig = () => request<MapConfig>(`${P}/map-config/`)

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string
  email: string
  username: string | null
  full_name: string
  phone: string | null
  whatsapp: string | null
  status: "active" | "inactive"
  account_type: "staff" | "mobile"
  language: Lang
  map_provider: MapProviderPref
  mfa_enabled: boolean
  has_password: boolean
  locked_until: string | null
  last_login_at: string | null
  created_at: string
  roles: RoleRef[]
}

export interface UserInput {
  email: string
  username?: string | null
  full_name: string
  phone?: string | null
  whatsapp?: string | null
  status: "active" | "inactive"
  language: Lang
  map_provider: MapProviderPref
  role_ids: string[]
  password?: string | null
  send_invite?: boolean
}

export const listUsers = (q: {
  search?: string; status?: string; role_id?: string; account_type?: string; skip?: number; limit?: number
}) => {
  const p = new URLSearchParams()
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== "all") p.set(k, String(v)) })
  return request<{ total: number; items: UserRow[] }>(`${P}/users/?${p}`)
}
export const createUser = (body: UserInput) =>
  request<UserRow & { invite_link: string | null; invite_error: string | null }>(`${P}/users/`, { method: "POST", ...json(body) })
export const updateUser = (id: string, body: Partial<UserInput>) =>
  request<UserRow>(`${P}/users/${id}`, { method: "PATCH", ...json(body) })
export const deleteUser = (id: string) => request<void>(`${P}/users/${id}`, { method: "DELETE" })
export const adminSetPassword = (id: string, body: { new_password?: string; send_reset_email?: boolean }) =>
  request<{ message: string; reset_link: string | null }>(`${P}/users/${id}/password`, { method: "POST", ...json(body) })
export const unlockUser = (id: string) => request<UserRow>(`${P}/users/${id}/unlock`, { method: "POST", ...json({}) })
export const resetUserMfa = (id: string) => request<{ message: string }>(`${P}/users/${id}/mfa/reset`, { method: "POST", ...json({}) })

// ── Roles ────────────────────────────────────────────────────────────────────

export interface PermissionRow {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface RoleRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  is_system: boolean
  mfa_required: boolean
  user_count: number
  active_user_count: number
  permissions: PermissionRow[]
  created_at: string
  updated_at: string
}

export interface ModuleInfo { key: string; label: string; group: string; actions: Action[] }

export interface RoleInput {
  name: string
  description?: string | null
  is_active: boolean
  mfa_required: boolean
  permissions: PermissionRow[]
}

export const listModules = () => request<ModuleInfo[]>(`${P}/roles/modules`)
export const listRoles = () => request<RoleRow[]>(`${P}/roles/`)
export const createRole = (body: RoleInput) => request<RoleRow>(`${P}/roles/`, { method: "POST", ...json(body) })
export const updateRole = (id: string, body: Partial<RoleInput>) =>
  request<RoleRow>(`${P}/roles/${id}`, { method: "PATCH", ...json(body) })
export const deleteRole = (id: string) => request<void>(`${P}/roles/${id}`, { method: "DELETE" })

// ── API clients ──────────────────────────────────────────────────────────────

export interface ApiClientRow {
  id: string
  name: string
  description: string | null
  key_prefix: string
  is_active: boolean
  created_by: string | null
  created_at: string
  rotated_at: string | null
  revoked_at: string | null
  last_used_at: string | null
}

export const listApiClients = () => request<ApiClientRow[]>(`${P}/api-clients/`)
export const createApiClient = (name: string, description?: string) =>
  request<ApiClientRow & { api_key: string }>(`${P}/api-clients/`, { method: "POST", ...json({ name, description }) })
export const rotateApiClient = (id: string) =>
  request<ApiClientRow & { api_key: string }>(`${P}/api-clients/${id}/rotate`, { method: "POST", ...json({}) })
export const revokeApiClient = (id: string) =>
  request<ApiClientRow>(`${P}/api-clients/${id}/revoke`, { method: "POST", ...json({}) })
export const deleteApiClient = (id: string) => request<void>(`${P}/api-clients/${id}`, { method: "DELETE" })

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string
  created_at: string
  actor_type: string
  actor_id: string | null
  actor_label: string | null
  action: string
  outcome: "success" | "failure"
  object_type: string | null
  object_id: string | null
  details: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
}

export const listAudit = (q: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== "all") p.set(k, String(v)) })
  return request<{ total: number; items: AuditRow[] }>(`${P}/audit-logs/?${p}`)
}

// ── Platform settings ────────────────────────────────────────────────────────

export interface PlatformSettings {
  captcha: { provider: AuthConfig["captcha"]["provider"]; site_key: string; secret_key_set: boolean; using_test_keys: boolean }
  smtp: { host: string; port: number; security: "starttls" | "ssl" | "none"; username: string; password_set: boolean;
          from_email: string; from_name: string; configured: boolean }
  maps: { default_provider: "osm" | "google"; osm_tile_url: string; osm_subdomains: string; osm_attribution: string;
          google_api_key_set: boolean; google_map_type: "roadmap" | "satellite" | "terrain"; google_language: string;
          google_region: string }
  security: { session_hours: number; lockout_threshold: number; lockout_minutes: number; password_min_length: number;
              reset_token_minutes: number; mfa_required_for_all: boolean }
  google_signin: { enabled: boolean; web_client_id: string; android_client_id: string; ios_client_id: string;
                   configured: boolean }
  community: CommunitySettings
  mobile: MobileSettings
  collision: CollisionSettings
  /** Predefined road sections (tronçons) for the console's route searches. */
  routes: { sections: RouteSection[] }
}

/** Community reports — validated by drivers' votes (not AI / human review). */
export interface CommunitySettings {
  vote_max_distance_m: number
  hide_after_absent_votes: number
  cancel_threshold: number            // legacy alias of hide_after_absent_votes
  keep_visible_present_votes: number
  confirm_extends_minutes: number
  ignore_threshold: number
  ignore_window_minutes: number
  hide_when_ignored: boolean
  default_expiry_hours: number
  expiry_hours_by_type: Record<string, number>
}

export interface MobileSettings {
  visibility_radius_m: number
  approach_alert_m: number
  vote_prompt_m: number
  route_corridor_m: number
  alert_cooldown_s: number
  eta_max_speed_kmh: number
  eta_factor: number
}

export type CollisionLevelName = "CRITICAL" | "HIGH_WARNING" | "WARNING" | "MONITOR"
export interface CollisionLevel { max_distance_m: number; distance_ttc_s: number | null; max_ttc_s: number | null }
export interface CollisionSettings {
  candidate_radius_m: number
  fresh_after_s: number
  stale_after_s: number
  min_confidence_to_report: number
  segment_trust_confidence: number
  min_closing_speed_mps: number
  max_horizon_s: number
  road_link_margin_m: number
  unrelated_monitor_distance_m: number
  lateral_margin_m: number
  lateral_max_accuracy_m: number
  deescalate_after_s: number
  resolve_after_s: number
  levels: Record<CollisionLevelName, CollisionLevel>
  scenario_multipliers: Record<"head_on" | "crossing" | "same_direction", number>
}

export const getPlatformSettings = () => request<PlatformSettings>(`${P}/platform-settings/`)
export const savePlatformSection = <K extends keyof PlatformSettings>(section: K, body: Record<string, unknown>) =>
  request<PlatformSettings[K]>(`${P}/platform-settings/${section}`, { method: "PUT", ...json(body) })
export const testSmtp = (to: string) =>
  request<{ message: string }>(`${P}/platform-settings/smtp/test`, { method: "POST", ...json({ to }) })
export const testGoogleMaps = () =>
  request<{ message: string }>(`${P}/platform-settings/maps/test`, { method: "POST", ...json({}) })
