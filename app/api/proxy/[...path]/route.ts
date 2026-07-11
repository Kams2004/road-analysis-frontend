import { NextRequest, NextResponse } from "next/server"

const API_BASE = process.env.API_URL || "http://localhost:8080"

// FastAPI routes are defined with trailing slashes — always append one
// unless the last segment already contains a dot (file) or the path ends with /
function apiUrl(path: string[], search = ""): string {
  const joined = path.join("/")
  const withSlash = joined.endsWith("/") ? joined : `${joined}/`
  return `${API_BASE}/${withSlash}${search}`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const search = req.nextUrl.search
  try {
    const res = await fetch(apiUrl(path, search), { cache: "no-store" })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const body = await req.text()
  try {
    const res = await fetch(apiUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const search = req.nextUrl.search
  const contentType = req.headers.get("content-type") ?? ""
  const isMultipart = contentType.includes("multipart/form-data")
  try {
    let res: Response
    if (isMultipart) {
      res = await fetch(apiUrl(path, search), {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: req.body,
        duplex: "half",
      } as RequestInit)
    } else {
      const body = await req.text()
      res = await fetch(apiUrl(path, search), {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const body = await req.text()
  try {
    const res = await fetch(apiUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await fetch(apiUrl(path), { method: "DELETE" })
    if (res.status === 204) return new NextResponse(null, { status: 204 })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
