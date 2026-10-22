/**
 * Typed client for the AI models registry and the AI validation mode
 * (RRAP-05-010/011/012/016, RRAP-06-007, RRAP-13-001/016):
 *  - GET /models/        model slots + model cards + effective thresholds
 *  - GET /models/stats   live quality metrics from human decisions
 *  - settings section "ai_validation" (GET/PUT /platform-settings)
 */
import { request } from "@/lib/auth-api"
import { BUILTIN_SIGN_TAXONOMY, registerSignNames, type SignTaxonomy } from "@/lib/i18n/extra/traffic-signs"

const P = "/api/proxy"

export type AiMode = "manual" | "assisted" | "automatic"
export type AiDecision = "auto_accept" | "auto_reject" | "review"

export interface PerClassThresholds { auto_accept?: number | null; auto_reject?: number | null }

export interface AiTypeThresholds {
  auto_accept?: number | null
  auto_reject?: number | null
  detector_accept?: number | null
  detector_reject?: number | null
  /** traffic_sign only: verifier thresholds per sign code. */
  per_class?: Record<string, PerClassThresholds> | null
}

export interface AiValidationSettings {
  mode: AiMode
  audit_sample_rate: number
  require_classifier_agreement: boolean
  type_overrides: Record<string, AiTypeThresholds>
  /** Auto-accept only when the object is seen in ≥ N consecutive analysed frames (default 2). */
  min_frames_for_auto_accept?: number
  /** Auto-accept only when the estimated position drifts ≤ this many metres (default 8). */
  max_static_drift_m?: number
  /** Potholes: auto-accept only when the box centre is below this fraction of the image height (default 0.45). */
  pothole_min_y_ratio?: number
  /** Potholes above the road-area line: auto-reject `ai_off_road` (default) or review only. */
  pothole_off_road_action?: PotholeOffRoadAction
  /** Potholes: box wider than this share of the frame → auto-reject `ai_box_too_large` (default 0.40, 1 = off). */
  pothole_max_width_ratio?: number
  /** Potholes: box area larger than this share of the frame → auto-reject `ai_box_too_large` (default 0.12, 1 = off). */
  pothole_max_area_ratio?: number
  /** Potholes: box touching the left/right border (1 %) and wider than 25 % → auto-reject `ai_box_too_large` (default true). */
  pothole_reject_edge_touching?: boolean
  /** Ignore pothole / sign / bump boxes lying on the dashcam's text overlay (default on). */
  ignore_osd_text_boxes?: boolean
}

export type PotholeOffRoadAction = "review" | "reject"

/** Defaults of the pothole false-positive rules (settings section ai_validation). */
export const POTHOLE_RULE_DEFAULTS = {
  pothole_min_y_ratio: 0.45,
  pothole_off_road_action: "reject" as PotholeOffRoadAction,
  pothole_max_width_ratio: 0.4,
  pothole_max_area_ratio: 0.12,
  pothole_reject_edge_touching: true,
}

export interface ModelCard {
  model_type: "detector" | "classifier" | string
  name: string
  version: string
  created_at?: string | null
  framework?: string | null
  base?: unknown
  classes: string[]
  imgsz?: number | null
  datasets: { name?: string; source?: string; license_note?: string; images?: number }[]
  metrics: Record<string, unknown> & { per_class?: Record<string, Record<string, unknown>> }
  thresholds: {
    auto_accept?: number | null
    auto_reject?: number | null
    target_precision?: number | null
    per_class?: Record<string, PerClassThresholds> | null
    /** Sign classifier: the class meaning "not a traffic sign" (e.g. "not_a_sign"). */
    reject_class?: string | null
  }
  sha256?: string | null
  crop_pad_ratio?: number | null
  taxonomy_version?: string | null
}

export interface ModelSlot {
  key: string
  role: "detector" | "classifier"
  detection_type: string
  path: string | null
  file: string | null
  present: boolean
  version: string | null
  sha256: string | null
  sha256_matches_card: boolean | null
  card: ModelCard | null
  card_error: string | null
  /** Signs detector only: whether a sign classifier runs after the detector. */
  pipeline?: "two_stage" | "single_stage" | null
}

export type ThresholdField = "detector_accept" | "detector_reject" | "auto_accept" | "auto_reject"
export const THRESHOLD_FIELDS: ThresholdField[] = ["detector_accept", "detector_reject", "auto_accept", "auto_reject"]

export type ThresholdSource = "override" | "card" | "global" | "card_global" | "validation" | null
export interface EffectiveValue { value: number | null; source: ThresholdSource }

export interface EffectiveThresholds extends Record<ThresholdField, EffectiveValue> {
  card: Partial<Record<ThresholdField, number | null>>
  two_stage: boolean
  /** traffic_sign only: effective verifier thresholds per sign code. */
  per_class?: Record<string, { auto_accept: EffectiveValue; auto_reject: EffectiveValue }> | null
}

export interface ModelsOut {
  models: ModelSlot[]
  ai_validation: AiValidationSettings
  thresholds: Record<string, EffectiveThresholds>
}

export interface StatsBlock {
  total: number
  auto_accept: number
  auto_reject: number
  review: number
  audit_samples: number
  workload_pct: number | null
  audit: { decided: number; agreed: number; agreement_rate: number | null }
  auto_accept_precision: number | null
  auto_accept_audited: number
  auto_reject_precision: number | null
  auto_reject_audited: number
  reopened: { count: number; decided: number; agreed: number; agreement_rate: number | null }
}

export interface ModelStats extends StatsBlock {
  model_name: string | null
  model_version: string | null
  model_card_version: string | null
  verifier_model: string | null
  verifier_card_version: string | null
}

export interface StatsWindow extends StatsBlock {
  days: number
  since: string
  by_model: ModelStats[]
}

export interface StatsOut {
  generated_at: string
  windows: StatsWindow[]
}

export const listModels = () => request<ModelsOut>(`${P}/models/`)
export const getModelStats = () => request<StatsOut>(`${P}/models/stats`)

let taxonomyPromise: Promise<SignTaxonomy> | null = null
/**
 * Full sign taxonomy (GET /models/signs/taxonomy), cached for the session.
 * Falls back to the built-in list when the request fails.
 */
export function getSignTaxonomy(): Promise<SignTaxonomy> {
  if (!taxonomyPromise) {
    taxonomyPromise = request<SignTaxonomy>(`${P}/models/signs/taxonomy`)
      .then((tx) => {
        if (!tx?.classes?.length) return BUILTIN_SIGN_TAXONOMY
        registerSignNames(tx.classes)
        return { ...tx, families: tx.families?.length ? tx.families : BUILTIN_SIGN_TAXONOMY.families }
      })
      .catch(() => { taxonomyPromise = null; return BUILTIN_SIGN_TAXONOMY })
  }
  return taxonomyPromise
}

export const getAiValidationSettings = () =>
  request<{ ai_validation?: AiValidationSettings }>(`${P}/platform-settings/`).then((all) => all.ai_validation ?? null)
export const saveAiValidationSettings = (body: Partial<AiValidationSettings>) =>
  request<AiValidationSettings>(`${P}/platform-settings/ai_validation`, { method: "PUT", body: JSON.stringify(body) })
