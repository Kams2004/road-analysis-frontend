/** Server-side helpers shared by the API route handlers (never imported by client code). */
import type { NextRequest } from "next/server"

export const SESSION_COOKIE = "rr_session"
export const API_BASE = process.env.API_URL || "http://localhost:8080"

export function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Set COOKIE_SECURE=true when the console is served over HTTPS.
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    ...(expires ? { expires } : {}),
  }
}

/** Headers forwarded to the backend: the session as a bearer token plus the
 *  caller's IP / user-agent so the audit trail records the real client. */
export function backendHeaders(req: NextRequest, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) headers["Authorization"] = `Bearer ${token}`
  const fwd = req.headers.get("x-forwarded-for")
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || ""
  if (ip) headers["X-Forwarded-For"] = ip
  const ua = req.headers.get("user-agent")
  if (ua) headers["User-Agent"] = ua
  return headers
}
