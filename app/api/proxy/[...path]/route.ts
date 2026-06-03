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
  // Forward the multipart body as-is — preserves the boundary in Content-Type
  const contentType = req.headers.get("content-type") ?? ""
  try {
    const res = await fetch(`${API_BASE}/${path.join("/")}${search}`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      // @ts-expect-error — Node 18+ supports Request body as ReadableStream
      body: req.body,
      duplex: "half",
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
