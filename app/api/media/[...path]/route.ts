import { NextRequest, NextResponse } from "next/server"

const MINIO_BASE = (process.env.MINIO_URL || "http://localhost:9200").replace(/\/$/, "")

const MIME: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", avi: "video/x-msvideo",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp",
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const filePath = path.join("/")
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
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
