/**
 * Chunked (resumable) upload of a video — API app/modules/m07_ingestion/chunked_upload.py.
 *
 * One multipart request is cut after 5 minutes by the console's server (and by any network
 * hiccup), so on a slow link large videos never arrive. The file is sent in chunks instead:
 * each one is a short request, retried on its own with back-off; progress counts the bytes
 * of every chunk. `completeUpload` then creates the job (same answer as POST /jobs/, a 409
 * duplicate keeps the upload so `force` does not resend the file).
 */
const P = "/api/proxy"   // the proxy appends the trailing slash the API routes are declared with

export interface UploadState {
  upload_id: string
  filename: string
  size: number
  chunk_size: number
  total_chunks: number
  received: number[]
}

/** HTTP answer of the API (status + parsed JSON `detail`). */
export class UploadHttpError extends Error {
  constructor(readonly status: number, readonly detail: unknown, message: string) { super(message) }
}

const RETRY_DELAYS_S = [1, 2, 4, 8, 15, 30, 30, 30]   // ≈ 2 minutes of retries per chunk

function messageOf(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: unknown }).message)
  return `HTTP ${status}`
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail
    throw new UploadHttpError(res.status, detail, messageOf(detail, res.status))
  }
  return data as T
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))

/** One chunk with progress (XHR: fetch has no upload progress). Resolves on 2xx. */
function sendChunk(uploadId: string, index: number, blob: Blob, onBytes: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${P}/jobs/uploads/${uploadId}/chunks/${index}`)
    xhr.setRequestHeader("Content-Type", "application/octet-stream")
    xhr.upload.onprogress = (e) => onBytes(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onBytes(blob.size); resolve(); return }
      let detail: unknown = null
      try { detail = JSON.parse(xhr.responseText).detail } catch { /* not JSON */ }
      reject(new UploadHttpError(xhr.status, detail, messageOf(detail, xhr.status)))
    }
    xhr.onerror = () => reject(new UploadHttpError(0, null, "network"))
    xhr.ontimeout = () => reject(new UploadHttpError(0, null, "timeout"))
    xhr.timeout = 5 * 60 * 1000
    xhr.send(blob)
  })
}

const retryable = (e: unknown) =>
  e instanceof UploadHttpError && (e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500)

/**
 * Sends `file` and returns the upload id (every chunk stored). `onProgress` gets 0–100.
 * `onRetry(attempt, delayS)` is called before a chunk is sent again after a network error.
 */
export async function uploadInChunks(
  file: File, onProgress: (pct: number) => void, onRetry?: (attempt: number, delayS: number) => void,
): Promise<string> {
  const state = await json<UploadState>(await fetch(`${P}/jobs/uploads`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size }),
  }))
  const { upload_id: id, chunk_size: size, total_chunks: total } = state
  const done = new Set(state.received)
  let confirmed = [...done].reduce((n, i) => n + Math.min(size, file.size - i * size), 0)
  const report = (inFlight: number) => onProgress(Math.min(100, Math.floor(((confirmed + inFlight) / file.size) * 100)))
  report(0)
  for (let i = 0; i < total; i++) {
    if (done.has(i)) continue
    const blob = file.slice(i * size, Math.min(file.size, (i + 1) * size))
    for (let attempt = 0; ; attempt++) {
      try {
        await sendChunk(id, i, blob, report)
        break
      } catch (e) {
        if (!retryable(e) || attempt >= RETRY_DELAYS_S.length) throw e
        onRetry?.(attempt + 1, RETRY_DELAYS_S[attempt])
        await sleep(RETRY_DELAYS_S[attempt])
      }
    }
    confirmed += blob.size
    report(0)
  }
  return id
}

/** Creates the job from a finished upload (query options as POST /jobs/). */
export async function completeUpload<T>(uploadId: string, models: string[], frameSkip?: number | null,
                                        force = false): Promise<T> {
  const q = new URLSearchParams()
  if (models.length) q.set("models", models.join(","))
  if (frameSkip != null) q.set("frame_skip", String(frameSkip))
  if (force) q.set("force", "true")
  return json<T>(await fetch(`${P}/jobs/uploads/${uploadId}/complete?${q}`, { method: "POST" }))
}

/** Drops a started upload (best effort). */
export async function abortUpload(uploadId: string): Promise<void> {
  await fetch(`${P}/jobs/uploads/${uploadId}/abort`, { method: "POST" }).catch(() => undefined)
}
