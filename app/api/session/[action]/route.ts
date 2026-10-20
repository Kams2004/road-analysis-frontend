/**
 * Session endpoints for the console. The backend session token never reaches
 * browser JavaScript: these handlers call the API and keep the token in an
 * httpOnly cookie. Short-lived MFA challenge tokens are returned to the page
 * because the user must come back with a code.
 *
 *   POST /api/session/login       { identifier, password, captcha_token }
 *   POST /api/session/mfa-verify  { challenge_token, code }
 *   POST /api/session/mfa-setup   { challenge_token? }
 *   POST /api/session/mfa-enable  { code, challenge_token? }
 *   POST /api/session/logout
 */
import { NextRequest, NextResponse } from "next/server"
import { API_BASE, SESSION_COOKIE, backendHeaders, sessionCookieOptions } from "@/lib/session"

const UPSTREAM: Record<string, string> = {
  "login": "/auth/login",
  "mfa-verify": "/auth/mfa/verify",
  "mfa-setup": "/auth/mfa/setup",
  "mfa-enable": "/auth/mfa/enable",
  "logout": "/auth/logout",
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  const path = UPSTREAM[action]
  if (!path) return NextResponse.json({ detail: { code: "not_found", message: "Unknown action" } }, { status: 404 })

  let body = action === "logout" ? "{}" : await req.text()
  // "Remember me" is a console concern: without it the cookie dies with the
  // browser session. It is not forwarded to the API.
  let remember = true
  if (["login", "mfa-verify", "mfa-enable"].includes(action)) {
    try {
      const parsed = JSON.parse(body)
      remember = parsed.remember !== false
      delete parsed.remember
      body = JSON.stringify(parsed)
    } catch { /* let the API reject malformed input */ }
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: backendHeaders(req, { "Content-Type": "application/json" }),
      body,
      cache: "no-store",
    })
  } catch (e) {
    return NextResponse.json({ detail: { code: "api_unreachable", message: String(e) } }, { status: 502 })
  }
  const data = await res.json().catch(() => ({}))

  if (action === "logout") {
    const out = NextResponse.json({ message: "Signed out." })
    out.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
    return out
  }

  // A full session came back: move the token into the cookie, strip it from the body.
  if (res.ok && data?.status === "ok" && data?.token) {
    const { token, ...rest } = data
    const out = NextResponse.json(rest, { status: res.status })
    const expires = remember && data.expires_at ? new Date(data.expires_at) : undefined
    out.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires))
    return out
  }
  return NextResponse.json(data, { status: res.status })
}
