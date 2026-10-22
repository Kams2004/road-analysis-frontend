import { NextRequest, NextResponse } from "next/server"

const MINIO_BASE = (process.env.MINIO_URL || "http://localhost:9200").replace(/\/$/, "")
// Only the buckets whose images the console displays; datasets / reports stay private
// (served by the API with a session), and no path may climb out of its bucket.
const PUBLIC_BUCKETS = new Set(["detections", "signalements"])
const SAFE_SEGMENT = /^[A-Za-z0-9._@=+-][A-Za-z0-9._@=+ -]*$/

const MIME: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", avi: "video/x-msvideo",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp",
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (path.length < 2 || !PUBLIC_BUCKETS.has(path[0]) || path.some((p) => p === "." || p === ".." || !SAFE_SEGMENT.test(p))) {
    return new NextResponse(null, { status: 404 })
  }
  const filePath = path.map(encodeURIComponent).join("/")
  const ext = path[path.length - 1].split(".").pop()?.toLowerCase() ?? ""
  const url = `${MINIO_BASE}/${filePath}`

  const fetchHeaders: HeadersInit = {}
  const range = req.headers.get("range")
  if (range) fetchHeaders["Range"] = range

  try {
    const res = await fetch(url, { headers: fetchHeaders, cache: "no-store" })
    if (!res.ok) return new NextResponse(null, { status: res.status })

    const contentType = MIME[ext] ?? res.headers.get("content-type") ?? "application/octet-stream"
    const responseHeaders: HeadersInit = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    }
    const contentLength = res.headers.get("content-length")
    const contentRange = res.headers.get("content-range")
    if (contentLength) responseHeaders["Content-Length"] = contentLength
    if (contentRange) responseHeaders["Content-Range"] = contentRange

    return new NextResponse(res.body, {
      status: contentRange ? 206 : 200,
      headers: responseHeaders,
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
