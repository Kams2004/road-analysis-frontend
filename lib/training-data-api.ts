/**
 * Live training data (api docs/TRAINING-DATA.md): every decision on a
 * detection feeds the `datasets` bucket (clean frame + YOLO label per
 * detector frame, padded crop per classifier class).
 */
import { ApiError, request } from "@/lib/auth-api"

const P = "/api/proxy"

export interface TrainingTypeSummary {
  detection_type: string
  classes: string[]
  accepted: number
  corrected: number
  rejected: number
  /** Rejections of kind "unusable": kept in the manifest without files (not trained on). */
  excluded?: number
  /** Rejections of kind "real_redundant": filed as positive samples. */
  redundant_positive?: number
  superseded: number
  by_human: number
  by_system: number
  classifier_crops: number
  crops_by_class: Record<string, number>
  detector_frames: number
  positive_frames: number
  background_frames: number
  boxes: number
  box_reviewed: number
  needs_box_review: number
  frames_without_image: number
  sync_pending: number
  sync_failed: number
  last_synced_at: string | null
  last_decision_at: string | null
}

export interface TrainingSyncResult { frames: number; synced: number; failed: number }

export const getTrainingSummary = () => request<TrainingTypeSummary[]>(`${P}/datasets/training/summary`)

export const syncTrainingData = () => request<TrainingSyncResult>(`${P}/datasets/training/sync`, { method: "POST" })

/** Download the YOLO + classifier zip of one type (datasets:view). */
export async function downloadTrainingExport(type: string) {
  const res = await fetch(`${P}/datasets/export?type=${encodeURIComponent(type)}&format=yolo`, { cache: "no-store" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const raw = data?.detail
    throw new ApiError(res.status, raw && typeof raw === "object" ? raw : { code: "error", message: String(raw ?? "") })
  }
  const blob = await res.blob()
  const cd = res.headers.get("content-disposition") ?? ""
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const name = m ? decodeURIComponent(m[1]) : `viasafe-training-${type}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
