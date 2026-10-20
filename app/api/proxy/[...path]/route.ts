import { NextRequest, NextResponse } from "next/server"
import { API_BASE, SESSION_COOKIE, backendHeaders } from "@/lib/session"

// FastAPI routes are defined with trailing slashes — always append one
// unless the last segment already contains a dot (file) or the path ends with /
function apiUrl(path: string[], search = ""): string {
  const joined = path.join("/")
  const withSlash = joined.endsWith("/") ? joined : `${joined}/`
  return `${API_BASE}/${withSlash}${search}`
}

/** Relay the backend response; an expired session also clears the cookie so
 *  the next page load goes to /login. */
async function relay(res: Response): Promise<NextResponse> {
  if (res.status === 204) return new NextResponse(null, { status: 204 })
  // File downloads (CSV/JSON exports with Content-Disposition, etc.) are
  // streamed through untouched instead of being re-encoded as JSON.
  const ctype = res.headers.get("content-type") ?? ""
  const disposition = res.headers.get("content-disposition")
  if (res.ok && (disposition || (ctype && !ctype.includes("application/json")))) {
    const headers = new Headers()
    if (ctype) headers.set("content-type", ctype)
    if (disposition) headers.set("content-disposition", disposition)
    // Let the browser cache what the API allows (e.g. drive thumbnails).
    const cacheControl = res.headers.get("cache-control")
    if (cacheControl) headers.set("cache-control", cacheControl)
    return new NextResponse(res.body, { status: res.status, headers })
  }
  const data = await res.json().catch(() => ({}))
  const out = NextResponse.json(data, { status: res.status })
  if (res.status === 401 && data?.detail?.code === "session_expired") {
    out.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })
  }
  return out
}

function unreachable(e: unknown) {
  return NextResponse.json({ error: String(e) }, { status: 502 })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await fetch(apiUrl(path, req.nextUrl.search), { cache: "no-store", headers: backendHeaders(req) })
    return relay(res)
  } catch (e) {
    return unreachable(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const contentType = req.headers.get("content-type") ?? ""
  const isMultipart = contentType.includes("multipart/form-data")
  try {
    const res = await fetch(apiUrl(path, req.nextUrl.search), {
      method: "POST",
      headers: backendHeaders(req, { "Content-Type": contentType || "application/json" }),
      body: isMultipart ? req.body : await req.text(),
      ...(isMultipart ? { duplex: "half" } : {}),
    } as RequestInit)
    return relay(res)
  } catch (e) {
    return unreachable(e)
  }
}

async function withJsonBody(method: string, req: NextRequest, path: string[]) {
  try {
    const res = await fetch(apiUrl(path, req.nextUrl.search), {
      method,
      headers: backendHeaders(req, { "Content-Type": "application/json" }),
      body: await req.text(),
    })
    return relay(res)
  } catch (e) {
    return unreachable(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return withJsonBody("PATCH", req, (await params).path)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return withJsonBody("PUT", req, (await params).path)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await fetch(apiUrl(path, req.nextUrl.search), { method: "DELETE", headers: backendHeaders(req) })
    return relay(res)
  } catch (e) {
    return unreachable(e)
  }
}
