"use client"

/**
 * "Why did the AI decide this?" — the evidence of a rule-based pipeline
 * stored on a detection as `ai_details` (spec-module5-parked-vehicle.md §3–§5).
 *
 *   <AiDetailsBadges d={d} />   compact: subtype · vehicle class · severity · score (list rows)
 *   <AiReasoningPanel d={d} />  detail: verdict, motion, score components, reasons, raw features
 *
 * Generic: any pipeline may fill only `score` / `reasons`; unknown reason
 * codes fall back to "code: value (threshold)" + the server's `detail`.
 * Both render nothing when the detection has no `ai_details`.
 */
import { AlertTriangle, BrainCircuit, CheckCircle2, MinusCircle, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import type { AiDetails, AiReason, M6Detection } from "@/lib/module6-api"
import { cn } from "@/lib/utils"

type WithAi = Pick<M6Detection, "type" | "ai_details">

export const SEVERITY_BADGE: Record<string, string> = {
  low: "border-success/40 text-success",
  medium: "border-warning/50 text-amber-700 dark:text-warning",
  high: "border-orange-500/50 text-orange-600 dark:text-orange-400",
  critical: "border-destructive/50 bg-destructive/10 text-destructive",
}

const VERDICT_BADGE: Record<string, string> = {
  parked: "border-success/40 text-success",
  moving: "border-info/40 text-info",
  traffic_queue: "border-warning/50 text-amber-700 dark:text-warning",
  off_road: "border-destructive/40 text-destructive",
  not_grounded: "border-destructive/40 text-destructive",
}

function hasDetails(a: AiDetails | null | undefined): a is AiDetails {
  return !!a && typeof a === "object" && Object.keys(a).length > 0
}

function useAiLabels() {
  const { t, locale } = useI18n()
  const tl = (key: string, raw: string) => { const s = t(key); return s === key ? raw : s }
  const human = (s: string) => s.replace(/_/g, " ")
  const num = (v: number, digits = 1) => v.toLocaleString(locale, { maximumFractionDigits: digits })
  const pct = (v: number, digits = 0) => v.toLocaleString(locale, { style: "percent", maximumFractionDigits: digits })
  return {
    t, tl, num, pct,
    subtype: (type: string, s: string) => tl(`pv.subtype.${s}`, tl(`pmap.label.${s}`, human(s))),
    vclass: (c: string) => tl(`pv.class.${c}`, human(c)),
    severity: (s: string) => tl(`pv.severity.${s}`, human(s)),
    verdict: (v: string) => tl(`pv.verdict.${v}`, human(v)),
    motion: (m: string) => tl(`pv.motion.${m}`, human(m)),
    component: (c: string) => tl(`pv.comp.${c}`, human(c)),
  }
}

// ── compact badges (list rows) ──────────────────────────────────────────────

export function AiDetailsBadges({ d, hideSubtype, className }: { d: WithAi; hideSubtype?: boolean; className?: string }) {
  const L = useAiLabels()
  const a = d.ai_details
  if (!hasDetails(a)) return null
  const sub = !hideSubtype && a.subtype ? L.subtype(d.type, a.subtype) : null
  const items = [sub, a.vehicle_class ? L.vclass(a.vehicle_class) : null].filter(Boolean)
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {items.map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
      {a.severity && (
        <Badge variant="outline" className={cn("text-[10px]", SEVERITY_BADGE[a.severity])}>{L.severity(a.severity)}</Badge>
      )}
      {typeof a.score === "number" && (
        <Badge variant="outline" className="gap-1 text-[10px] tabular-nums" title={L.t("pv.score")}>
          <BrainCircuit className="h-3 w-3" />{L.pct(a.score)}
        </Badge>
      )}
    </span>
  )
}

// ── reasons → human text ────────────────────────────────────────────────────

/** How a rule passes: "min" value ≥ threshold, "max" value ≤ threshold, "lt" value < threshold. */
const DIRECTION: Record<string, "min" | "max" | "lt"> = {
  closest_box_area: "min", sightings: "min", track_seconds: "min", mean_confidence: "min",
  queue_ego_stop: "lt", queue_peers: "lt",
  ego_distance: "min", ego_speed: "min",
  target_speed: "max", world_drift: "max",
  lateral_drift: "min", growth_rate: "max",
  ground_contact: "min", road_distance: "max",
  pothole_road_area: "min", pothole_box_width: "max", pothole_box_area: "max",
}

type Fmt = "pct" | "pct1" | "int" | "n1" | "n2" | "raw"
/** How to print value / threshold of each known code. */
const FORMAT: Record<string, Fmt> = {
  closest_box_area: "pct1", sightings: "int", track_seconds: "n1", mean_confidence: "pct",
  queue_ego_stop: "int", queue_peers: "int", ego_distance: "int", ego_speed: "int",
  target_speed: "n1", world_drift: "n1", lateral_drift: "pct", growth_rate: "n2",
  exit_or_growth: "n1", ground_contact: "pct", ground_contact_unknown: "pct",
  road_distance: "int", road_distance_unknown: "int", world_position_unknown: "int",
  pothole_road_area: "n2", pothole_box_width: "pct", pothole_box_area: "pct", pothole_side_edge: "pct",
}

function opFor(code: string, passed: boolean | null): string {
  const dir = DIRECTION[code]
  if (!dir || passed == null) return ""
  if (dir === "min") return passed ? "≥" : "<"
  if (dir === "max") return passed ? "≤" : ">"
  return passed ? "<" : "≥"
}

function useReasonText() {
  const L = useAiLabels()
  const fmt = (v: unknown, f: Fmt): string => {
    if (v == null) return "?"
    if (typeof v === "boolean") return v ? L.t("common.yes") : L.t("common.no")
    if (typeof v !== "number") return String(v)
    switch (f) {
      case "pct": return L.pct(v)
      case "pct1": return L.pct(v, 1)
      case "int": return L.num(v, 0)
      case "n1": return L.num(v, 1)
      case "n2": return L.num(v, 2)
      default: return L.num(v, 3)
    }
  }
  return (r: AiReason): { text: string; known: boolean } => {
    const state = r.code === "in_corridor" ? (r.value ? "yes" : "no")
      : r.passed == null ? "skip" : r.passed ? "pass" : "fail"
    let key: string | null = null
    for (const k of [`pv.reason.${r.code}.${state}`, `pv.reason.${r.code}`]) {
      if (L.t(k) !== k) { key = k; break }
    }
    const f = FORMAT[r.code] ?? "raw"
    if (!key) {
      const thr = r.threshold != null ? ` (${fmt(r.threshold, f)})` : ""
      return { text: `${r.code.replace(/_/g, " ")}: ${fmt(r.value, f)}${thr}`, known: false }
    }
    let value = fmt(r.value, f)
    let threshold = fmt(r.threshold, f)
    if (r.code === "road_side") {
      value = L.tl(`pv.side.${String(r.value)}`, String(r.value))
      threshold = L.tl(`pv.drive.${String(r.threshold)}`, String(r.threshold))
    }
    return { text: L.t(key, { value, threshold, op: opFor(r.code, r.passed) }), known: true }
  }
}

function ReasonIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
  if (passed === false) return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
  return <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

/** Free-text reasons (older pipelines and demo data store plain sentences) or
 * objects without a code must never crash the page: show them as notes. */
function normalizeReason(raw: unknown): AiReason {
  if (raw && typeof raw === "object" && typeof (raw as AiReason).code === "string") {
    const r = raw as AiReason
    return { ...r, passed: r.passed ?? null }
  }
  const detail = typeof raw === "string" ? raw : JSON.stringify(raw ?? "")
  return { code: "note", value: null, threshold: null, passed: null, detail } as AiReason
}

export function AiReasonList({ reasons }: { reasons: AiReason[] }) {
  const text = useReasonText()
  return (
    <ul className="space-y-1">
      {(Array.isArray(reasons) ? reasons : []).map(normalizeReason).map((r, i) => {
        const { text: s, known } = r.code === "note" ? { text: r.detail ?? "", known: true } : text(r)
        return (
          <li key={`${r.code}-${i}`} className="flex items-start gap-1.5 text-xs" title={r.detail || r.code}>
            <ReasonIcon passed={r.passed} />
            <span className={cn(r.passed == null && "text-muted-foreground", r.passed === false && "font-medium")}>
              {s}
              {r.detail && (!known || r.code.endsWith("_unknown")) && (
                <span className="block text-[11px] text-muted-foreground">{r.detail}</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── score ───────────────────────────────────────────────────────────────────

function MiniBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full", v >= 0.66 ? "bg-success" : v >= 0.33 ? "bg-warning" : "bg-destructive")}
        style={{ width: `${v * 100}%` }} />
    </div>
  )
}

function ScoreBlock({ a }: { a: AiDetails }) {
  const L = useAiLabels()
  const comps = Object.entries(a.score_components ?? {}).filter((e): e is [string, number] => typeof e[1] === "number")
  if (typeof a.score !== "number" && !comps.length) return null
  return (
    <div className="space-y-2">
      {typeof a.score === "number" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{L.t("pv.score")}</span>
          <MiniBar value={a.score} className="h-2 flex-1" />
          <span className="text-sm font-medium tabular-nums">{L.pct(a.score)}</span>
        </div>
      )}
      {comps.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{L.t("pv.components")}</p>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {comps.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-muted-foreground" title={k}>{L.component(k)}</span>
                <MiniBar value={v} className="flex-1" />
                <span className="w-9 text-right tabular-nums">{L.pct(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── panel ───────────────────────────────────────────────────────────────────

function fmtFeature(v: unknown, num: (v: number, d?: number) => string): string {
  if (v == null) return "—"
  if (typeof v === "number") return num(v, 4)
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export function AiReasoningPanel({ d, className }: { d: WithAi; className?: string }) {
  const L = useAiLabels()
  const a = d.ai_details
  if (!hasDetails(a)) return null
  const reasons = Array.isArray(a.reasons) ? a.reasons : []
  const features = a.features && typeof a.features === "object" ? Object.entries(a.features) : []
  const failed = reasons.filter((r) => r.passed === false).length
  return (
    <section className={cn("space-y-3 rounded-lg border p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BrainCircuit className="h-4 w-4 text-muted-foreground" /> {L.t("pv.title")}
        </p>
        <AiDetailsBadges d={d} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {a.verdict && (
          <Badge variant="outline" className={cn("text-[10px]", VERDICT_BADGE[a.verdict])}>
            {L.t("pv.verdictLabel")}: {L.verdict(a.verdict)}
          </Badge>
        )}
        {a.motion && <Badge variant="outline" className="text-[10px]">{L.motion(a.motion)}</Badge>}
        {typeof a.road_distance_m === "number" && (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {L.t("pv.roadDistance", { value: L.num(a.road_distance_m, 0) })}
          </Badge>
        )}
        {a.pipeline === "parked_vehicle" && (
          <span className="text-muted-foreground">
            {L.t("pv.cameraProfile")}: {a.camera_profile ?? L.t("pv.cameraDefault")}
          </span>
        )}
      </div>

      {a.fallback && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-amber-800 dark:text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {L.t("pv.fallbackWarn")}
        </p>
      )}

      <ScoreBlock a={a} />

      {reasons.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">
            {L.t("pv.reasons")}{failed > 0 && ` · ${L.t("pv.failedCount", { n: failed })}`}
          </p>
          <AiReasonList reasons={reasons} />
        </div>
      )}

      {(features.length > 0 || a.rules_version || a.target_position) && (
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">{L.t("pv.features")}</summary>
          <div className="mt-2 space-y-1">
            {a.rules_version && <p className="break-all font-mono text-[11px] text-muted-foreground">{a.rules_version}</p>}
            {a.target_position && (
              <p className="font-mono text-[11px]">
                {L.t("pv.targetPosition")}: {a.target_position.latitude.toFixed(6)}, {a.target_position.longitude.toFixed(6)}
              </p>
            )}
            {features.length > 0 && (
              <table className="w-full text-[11px]">
                <tbody>
                  {features.map(([k, v]) => (
                    <tr key={k} className="border-b border-border/50 last:border-0">
                      <td className="py-0.5 pr-3 font-mono text-muted-foreground">{k}</td>
                      <td className="py-0.5 text-right font-mono tabular-nums">{fmtFeature(v, L.num)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}
    </section>
  )
}
