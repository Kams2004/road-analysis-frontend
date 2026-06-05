import { NextRequest, NextResponse } from "next/server"

const API_BASE = process.env.API_URL || "http://localhost:8080"

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const search = req.nextUrl.search
  try {
    const res = await fetch(`${API_BASE}/${path.join("/")}${search}`, { cache: "no-store" })
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
    const res = await fetch(`${API_BASE}/${path.join("/")}`, {
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
      // Large file upload — stream the body directly
      res = await fetch(`${API_BASE}/${path.join("/")}${search}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: req.body,
        duplex: "half",
      } as RequestInit)
    } else {
      // JSON or other small body — buffer first
      const body = await req.text()
      res = await fetch(`${API_BASE}/${path.join("/")}${search}`, {
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await fetch(`${API_BASE}/${path.join("/")}`, { method: "DELETE" })
    if (res.status === 204) return new NextResponse(null, { status: 204 })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
