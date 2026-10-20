"use client"

/**
 * Settings → Module 5 · AI detection → Parked vehicles: every field of the
 * settings section `parked_vehicle` (docs/spec-module5-parked-vehicle.md §6),
 * grouped by pipeline stage / rule in collapsible cards. Each field shows a
 * short help, its unit and default; each group can be reset to the defaults;
 * 422 errors are shown on the field they name. One save bar for the page:
 * only the changed keys are sent (nested maps camera / score_weights /
 * class_heights_m / severity_by_subtype are merged key by key by the API,
 * camera_profiles is replaced as sent).
 */
import { useMemo, useState } from "react"
import {
  Camera, Car, Database, Footprints, Gauge, Layers, ListChecks, Navigation, Plus, ScanSearch, Scale, Siren, Trash2,
  TrafficCone, Waypoints,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Tone } from "@/components/stat-card"
import {
  ChipToggles, FieldBlock, GroupCard, LoadingBlock, NumField, StickySaveBar, SwitchRow, numProblem, useSectionDraft,
  type NumSpec,
} from "@/components/settings/form-kit"
import { FramePreview } from "@/components/settings/ai/frame-preview"
import {
  CAMERA_DEFAULTS, PARKED_VEHICLE_DEFAULTS as D, PV_SUBTYPES, REVIEWABLE_VERDICTS, SCORE_COMPONENTS, SEVERITY_LEVELS,
  VEHICLE_CLASSES, same, type CameraCalibration, type CameraOverride, type ParkedVehicleSettings as S,
} from "@/lib/settings-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Key = keyof S
type NumKey = { [K in Key]: S[K] extends number | null ? K : never }[Key]

/** Bounds of every numeric field (mirror of the pydantic Field constraints). */
const NUM: Partial<Record<NumKey, NumSpec & { unit?: string; step?: number }>> = {
  detector_confidence: { min: 0.05, max: 0.99, step: 0.05 },
  hood_mask_bottom_ratio: { min: 0, max: 0.5, step: 0.01, unit: "frameH" },
  tracker_max_gap: { min: 1, max: 20, integer: true, unit: "frames" },
  tracker_match_iou: { min: 0, max: 0.9, step: 0.05 },
  min_sightings: { min: 2, max: 200, integer: true, unit: "sightings" },
  min_track_seconds: { min: 0.2, max: 120, step: 0.5, unit: "s" },
  min_mean_confidence: { min: 0, max: 1, step: 0.05 },
  min_box_area_at_closest: { min: 0, max: 1, step: 0.001, unit: "frameArea" },
  min_ego_distance_m: { min: 0, max: 2000, step: 5, unit: "m" },
  min_ego_speed_kmh: { min: 0, max: 200, step: 1, unit: "kmh" },
  max_target_speed_kmh: { min: 0, max: 100, step: 0.5, unit: "kmh" },
  max_world_drift_m: { min: 0, max: 500, step: 1, unit: "m" },
  range_error_ratio: { min: 0, max: 1, step: 0.05 },
  max_range_m: { min: 5, minExclusive: true, max: 500, step: 5, unit: "m" },
  fallback_min_lateral_drift: { min: 0, max: 1, step: 0.01, unit: "frameW" },
  fallback_edge_margin: { min: 0, max: 0.5, step: 0.01, unit: "frameW" },
  fallback_max_growth_rate: { min: 0, max: 50, step: 0.1, unit: "perS" },
  fallback_min_scale_growth: { min: 1, max: 100, step: 0.5, unit: "times" },
  fallback_score_cap: { min: 0, max: 1, step: 0.05 },
  ground_contact_tolerance: { min: 0, minExclusive: true, max: 5, step: 0.05 },
  min_ground_contact_ratio: { min: 0, max: 1, step: 0.05 },
  ground_contact_max_range_m: { min: 2, minExclusive: true, max: 200, step: 1, unit: "m" },
  max_road_distance_m: { min: 0, minExclusive: true, max: 500, step: 1, unit: "m" },
  queue_ego_speed_kmh: { min: 0, max: 100, step: 0.5, unit: "kmh" },
  queue_min_vehicles: { min: 2, max: 50, integer: true, unit: "vehicles" },
  auto_accept_score: { min: 0, max: 1, step: 0.05, nullable: true },
  auto_reject_score: { min: 0, max: 1, step: 0.05, nullable: true },
  heavy_vehicle_bump: { min: 0, max: 3, integer: true, unit: "levels" },
}

const CAM: Record<keyof CameraCalibration, NumSpec & { unit?: string; step?: number }> = {
  horizon_y: { min: 0.05, max: 0.95, step: 0.01, unit: "frameH" },
  center_offset: { min: -0.4, max: 0.4, step: 0.01, unit: "frameW" },
  camera_height_m: { min: 0.2, minExclusive: true, max: 5, step: 0.05, unit: "m" },
  vertical_fov_deg: { min: 10, minExclusive: true, max: 170, maxExclusive: true, step: 1, unit: "deg" },
  corridor_halfwidth_at_horizon: { min: 0, max: 0.5, step: 0.01, unit: "frameW" },
  corridor_halfwidth_at_bottom: { min: 0, max: 0.5, step: 0.01, unit: "frameW" },
}
const CAM_KEYS = Object.keys(CAM) as (keyof CameraCalibration)[]
const HEIGHT_SPEC: NumSpec = { min: 0.3, max: 6 }
const WEIGHT_SPEC: NumSpec = { min: 0 }

interface Group {
  id: string
  icon: LucideIcon
  tone: Tone
  rule?: string
  keys: Key[]
  open?: boolean
}

const GROUPS: Group[] = [
  { id: "detector", icon: ScanSearch, tone: "blue", keys: ["vehicle_classes", "detector_confidence", "mask_regions", "hood_mask_bottom_ratio"], open: true },
  { id: "tracking", icon: Waypoints, tone: "slate", keys: ["tracker_max_gap", "tracker_match_iou"] },
  { id: "evidence", icon: ListChecks, tone: "purple", rule: "6 · 7", keys: ["min_sightings", "min_track_seconds", "min_mean_confidence", "min_box_area_at_closest"] },
  { id: "ego", icon: Navigation, tone: "teal", rule: "1", keys: ["min_ego_distance_m", "min_ego_speed_kmh"] },
  { id: "stability", icon: Gauge, tone: "orange", rule: "2", keys: [
    "max_target_speed_kmh", "max_world_drift_m", "range_error_ratio", "max_range_m",
    "fallback_min_lateral_drift", "fallback_edge_margin", "fallback_max_growth_rate", "fallback_min_scale_growth", "fallback_score_cap"] },
  { id: "ground", icon: Footprints, tone: "green", rule: "3", keys: ["ground_contact_tolerance", "min_ground_contact_ratio", "ground_contact_max_range_m", "class_heights_m"] },
  { id: "road", icon: Car, tone: "blue", rule: "4", keys: ["road_check", "max_road_distance_m"] },
  { id: "queue", icon: TrafficCone, tone: "orange", rule: "5", keys: ["queue_ego_speed_kmh", "queue_min_vehicles"] },
  { id: "camera", icon: Camera, tone: "purple", rule: "10 · 11", keys: ["camera", "drive_side", "camera_profiles"] },
  { id: "score", icon: Scale, tone: "teal", keys: ["score_weights", "auto_accept_score", "auto_reject_score"], open: true },
  { id: "severity", icon: Siren, tone: "red", keys: ["severity_by_subtype", "heavy_vehicle_classes", "heavy_vehicle_bump"] },
  { id: "storage", icon: Database, tone: "slate", rule: "12", keys: ["store_rejected_for_review", "review_verdicts"] },
]
const ALL_KEYS = Object.keys(D) as Key[]

const WEIGHT_COLORS: Record<string, string> = {
  detector: "bg-blue-500", evidence: "bg-violet-500", target_speed: "bg-orange-500", ego_motion: "bg-teal-500",
  ground_contact: "bg-emerald-500", road_distance: "bg-sky-500", proximity: "bg-slate-500",
}

/** Every local problem (blocks saving), keyed by field path. */
function localProblems(d: S, t: (k: string, v?: Record<string, string | number>) => string): Record<string, string> {
  const out: Record<string, string> = {}
  const chk = (path: string, v: number | null | undefined, spec: NumSpec) => {
    const p = numProblem(v, spec)
    if (p) out[path] = t(p[0], p[1])
  }
  for (const [k, spec] of Object.entries(NUM)) chk(k, d[k as NumKey] as number | null, spec!)
  for (const k of CAM_KEYS) chk(`camera.${k}`, d.camera?.[k], CAM[k])
  for (const [id, o] of Object.entries(d.camera_profiles ?? {})) {
    for (const k of CAM_KEYS) chk(`camera_profiles.${id}.${k}`, o?.[k] ?? null, { ...CAM[k], nullable: true })
  }
  for (const [c, h] of Object.entries(d.class_heights_m ?? {})) chk(`class_heights_m.${c}`, h, HEIGHT_SPEC)
  for (const [c, w] of Object.entries(d.score_weights ?? {})) chk(`score_weights.${c}`, w, WEIGHT_SPEC)
  if (!d.vehicle_classes.length) out.vehicle_classes = t("set.pv.err.noClass")
  const missing = d.vehicle_classes.filter((c) => d.class_heights_m?.[c] == null)
  if (missing.length) out.class_heights_m = t("set.pv.err.heights", { classes: missing.join(", ") })
  const sum = Object.values(d.score_weights ?? {}).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  if (!(sum > 0)) out.score_weights = t("set.pv.err.weightsSum")
  if (d.camera && d.camera.corridor_halfwidth_at_bottom < d.camera.corridor_halfwidth_at_horizon) {
    out["camera.corridor_halfwidth_at_bottom"] = t("set.pv.err.corridor")
  }
  if (d.auto_accept_score != null && d.auto_reject_score != null && d.auto_accept_score <= d.auto_reject_score) {
    out.auto_accept_score = t("ai.set.err.order")
  }
  d.mask_regions.forEach((r, i) => {
    if (r.length !== 4 || !r.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) || r[0] >= r[2] || r[1] >= r[3]) {
      out[`mask_regions.${i}`] = t("set.pv.err.mask")
    }
  })
  return out
}

export function ParkedVehicleSettingsForm({ readOnly }: { readOnly: boolean }) {
  const { t, locale } = useI18n()
  const form = useSectionDraft<S>("parked_vehicle", D, {
    knownFields: ["corridor_halfwidth_at_bottom", ...ALL_KEYS],
    // camera_profiles is replaced as sent: drop the unset (null) fields.
    buildPatch: (draft, _saved, changed) => Object.fromEntries(changed.map((k) => [k, k === "camera_profiles"
      ? Object.fromEntries(Object.entries(draft.camera_profiles).map(([id, o]) => [id,
          Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))]))
      : draft[k]])),
  })
  const { draft: d, set, changed, saving, save, discard, loadError } = form
  const [newProfile, setNewProfile] = useState("")

  const local = useMemo(() => (d ? localProblems(d, t) : {}), [d, t])
  const err = (path: string) => form.errors[path] ?? local[path]
  const groupErr = (g: Group) => g.keys.some((k) => Object.keys({ ...form.errors, ...local }).some((f) => f === k || f.startsWith(`${k}.`)))
  const unitLabel = (u?: string) => (u ? t(`set.unit.${u}`) : undefined)

  if (loadError) return <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
  if (!d) return <LoadingBlock />

  const num = (k: NumKey, extra?: { className?: string }) => {
    const spec = NUM[k]!
    return (
      <NumField key={k} id={`pv-${k}`} label={t(`set.pv.${k}`)} help={t(`set.pv.${k}.help`)} unit={unitLabel(spec.unit)}
        value={d[k] as number | null} onChange={(v) => set(k, v as never)} def={D[k] as number | null} spec={spec} step={spec.step}
        error={err(k)} readOnly={readOnly} className={extra?.className} />
    )
  }
  const resetGroup = (g: Group) => {
    for (const k of g.keys) set(k, structuredClone(D[k]) as never)
  }
  const card = (g: Group, body: React.ReactNode) => (
    <GroupCard key={g.id} id={`pv-${g.id}`} icon={g.icon} tone={g.tone}
      title={<>{t(`set.pv.g.${g.id}`)}{g.rule && <span className="ml-2 text-[10px] font-normal text-muted-foreground">{t("set.pv.rule", { n: g.rule })}</span>}</>}
      description={t(`set.pv.g.${g.id}.desc`)} defaultOpen={g.open ?? false}
      onReset={() => resetGroup(g)} isDefault={g.keys.every((k) => same(d[k], D[k]))}
      changedCount={g.keys.filter((k) => changed.includes(k)).length} hasError={groupErr(g)} readOnly={readOnly}>
      {body}
    </GroupCard>
  )
  const G = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<string, Group>
  const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"

  // Score weights
  const weights = d.score_weights ?? {}
  const wSum = SCORE_COMPONENTS.reduce((a, c) => a + (Number.isFinite(weights[c]) ? weights[c] ?? 0 : 0), 0)
  const fmt = (n: number, digits = 2) => n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })

  // Camera profiles
  const profiles = d.camera_profiles ?? {}
  const setProfile = (id: string, o: CameraOverride | null) => {
    const next = { ...profiles }
    if (o) next[id] = o
    else delete next[id]
    set("camera_profiles", next)
  }
  const addProfile = () => {
    const id = newProfile.trim()
    if (!id || id in profiles) return
    setProfile(id, {})
    setNewProfile("")
  }

  return (
    <div className="space-y-4">
      {card(G.detector, (
        <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <FieldBlock label={t("set.pv.vehicle_classes")} help={t("set.pv.vehicle_classes.help")} error={err("vehicle_classes")}>
              <ChipToggles readOnly={readOnly} value={d.vehicle_classes} onChange={(v) => set("vehicle_classes", v)}
                options={VEHICLE_CLASSES.map((c) => ({ value: c, label: t(`pv.class.${c}`) }))} label={t("set.pv.vehicle_classes")} />
            </FieldBlock>
            <div className="grid gap-4 sm:grid-cols-2">
              {num("detector_confidence")}
              {num("hood_mask_bottom_ratio")}
            </div>
            <FieldBlock label={t("set.pv.mask_regions")} help={t("set.pv.mask_regions.help")} error={err("mask_regions")}>
              <div className="space-y-2">
                {d.mask_regions.map((r, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex flex-wrap items-end gap-2">
                      {(["x1", "y1", "x2", "y2"] as const).map((lbl, j) => (
                        <label key={lbl} className="space-y-0.5 text-[10px] text-muted-foreground">
                          <span className="block font-mono">{lbl}</span>
                          <Input type="number" step={0.01} min={0} max={1} className="h-8 w-20" disabled={readOnly}
                            value={Number.isFinite(r[j]) ? r[j] : ""} aria-label={`${t("set.pv.mask_regions")} ${i + 1} ${lbl}`}
                            onChange={(e) => {
                              const next = d.mask_regions.map((row) => [...row])
                              next[i][j] = e.target.value === "" ? NaN : Number(e.target.value)
                              set("mask_regions", next)
                            }} />
                        </label>
                      ))}
                      {!readOnly && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={t("set.remove")}
                          onClick={() => set("mask_regions", d.mask_regions.filter((_, k) => k !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {err(`mask_regions.${i}`) && <p className="text-xs text-destructive">{err(`mask_regions.${i}`)}</p>}
                  </div>
                ))}
                {!readOnly && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => set("mask_regions", [...d.mask_regions, [0, 0.9, 1, 1]])}>
                    <Plus className="h-3.5 w-3.5" />{t("set.pv.addMask")}
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">{t("set.default")} <span className="font-mono">[[0, 0, 1, 0.235]]</span></p>
              </div>
            </FieldBlock>
          </div>
          <FramePreview masks={d.mask_regions} hood={d.hood_mask_bottom_ratio} className="self-start"
            labels={{ mask: t("set.pv.prev.mask"), hood: t("set.pv.prev.hood") }} />
        </div>
      ))}

      {card(G.tracking, <div className={grid}>{num("tracker_max_gap")}{num("tracker_match_iou")}</div>)}

      {card(G.evidence, (
        <div className={grid}>
          {num("min_sightings")}{num("min_track_seconds")}{num("min_mean_confidence")}{num("min_box_area_at_closest")}
        </div>
      ))}

      {card(G.ego, <div className={grid}>{num("min_ego_distance_m")}{num("min_ego_speed_kmh")}</div>)}

      {card(G.stability, (
        <>
          <div className={grid}>{num("max_target_speed_kmh")}{num("max_world_drift_m")}{num("range_error_ratio")}{num("max_range_m")}</div>
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("set.pv.stabilityExample", {
              v: fmt(d.max_target_speed_kmh + d.range_error_ratio * 36, 1),
              drift: fmt(d.max_world_drift_m + d.range_error_ratio * 100, 0),
            })}
          </p>
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t("set.pv.fallbackTitle")}</p>
              <p className="text-[11px] text-muted-foreground">{t("set.pv.fallbackHint")}</p>
            </div>
            <div className={grid}>
              {num("fallback_min_lateral_drift")}{num("fallback_edge_margin")}{num("fallback_max_growth_rate")}
              {num("fallback_min_scale_growth")}{num("fallback_score_cap")}
            </div>
          </div>
        </>
      ))}

      {card(G.ground, (
        <>
          <div className={grid}>{num("ground_contact_tolerance")}{num("min_ground_contact_ratio")}{num("ground_contact_max_range_m")}</div>
          <FieldBlock label={t("set.pv.class_heights_m")} help={t("set.pv.class_heights_m.help")} error={err("class_heights_m")}>
            <div className="flex flex-wrap gap-4">
              {VEHICLE_CLASSES.map((c) => (
                <NumField key={c} id={`pv-h-${c}`} compact label={t(`pv.class.${c}`)} unit={t("set.unit.m")}
                  value={d.class_heights_m?.[c] ?? null} def={D.class_heights_m[c]} spec={{ ...HEIGHT_SPEC, nullable: !d.vehicle_classes.includes(c) }}
                  step={0.1} readOnly={readOnly} error={form.errors[`class_heights_m.${c}`]}
                  onChange={(v) => {
                    const next = { ...d.class_heights_m }
                    if (v == null) delete next[c]
                    else next[c] = v
                    set("class_heights_m", next)
                  }} />
              ))}
            </div>
          </FieldBlock>
        </>
      ))}

      {card(G.road, (
        <div className="grid gap-4 sm:grid-cols-2">
          <SwitchRow id="pv-road_check" label={t("set.pv.road_check")} help={t("set.pv.road_check.help")} def={D.road_check}
            checked={d.road_check} onChange={(v) => set("road_check", v)} readOnly={readOnly} error={err("road_check")} />
          {num("max_road_distance_m")}
        </div>
      ))}

      {card(G.queue, <div className={grid}>{num("queue_ego_speed_kmh")}{num("queue_min_vehicles")}</div>)}

      {card(G.camera, (
        <>
          <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
            <div className="space-y-4">
              <div className={grid}>
                {CAM_KEYS.map((k) => (
                  <NumField key={k} id={`pv-cam-${k}`} label={t(`set.pv.cam.${k}`)} help={t(`set.pv.cam.${k}.help`)} unit={unitLabel(CAM[k].unit)}
                    value={d.camera?.[k] ?? null} def={CAMERA_DEFAULTS[k]} spec={CAM[k]} step={CAM[k].step} readOnly={readOnly}
                    error={err(`camera.${k}`)} onChange={(v) => set("camera", { ...d.camera, [k]: v as number })} />
                ))}
              </div>
              <FieldBlock label={t("set.pv.drive_side")} help={t("set.pv.drive_side.help")} error={err("drive_side")}>
                <Select value={d.drive_side} onValueChange={(v) => set("drive_side", v as S["drive_side"])} disabled={readOnly}>
                  <SelectTrigger className="h-8 w-56" aria-label={t("set.pv.drive_side")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">{t("pv.drive.right")}</SelectItem>
                    <SelectItem value="left">{t("pv.drive.left")}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>
            <FramePreview camera={d.camera} masks={d.mask_regions} hood={d.hood_mask_bottom_ratio} className="self-start"
              labels={{ horizon: t("set.pv.prev.horizon"), corridor: t("set.pv.prev.corridor"), mask: t("set.pv.prev.mask") }} />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t("set.pv.camera_profiles")}</p>
              <p className="text-[11px] text-muted-foreground">{t("set.pv.camera_profiles.help")}</p>
            </div>
            {err("camera_profiles") && <p className="text-xs text-destructive">{err("camera_profiles")}</p>}
            {Object.keys(profiles).length === 0 && <p className="text-xs text-muted-foreground">{t("set.pv.noProfiles")}</p>}
            {Object.entries(profiles).map(([id, o]) => {
              const effective = { ...d.camera, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) } as CameraCalibration
              return (
                <div key={id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{id}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {t("set.pv.profileOverrides", { n: Object.values(o).filter((v) => v != null).length })}
                      </span>
                    </span>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" onClick={() => setProfile(id, null)}>
                        <Trash2 className="h-3.5 w-3.5" />{t("set.remove")}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[1fr_12rem]">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {CAM_KEYS.map((k) => (
                        <NumField key={k} id={`pv-prof-${id}-${k}`} compact label={t(`set.pv.cam.${k}`)} unit={unitLabel(CAM[k].unit)}
                          value={o[k] ?? null} spec={{ ...CAM[k], nullable: true }} step={CAM[k].step} readOnly={readOnly}
                          placeholder={String(d.camera?.[k] ?? "")} error={form.errors[`camera_profiles.${id}.${k}`]}
                          onChange={(v) => setProfile(id, { ...o, [k]: v })} />
                      ))}
                    </div>
                    <FramePreview camera={effective} className="self-start" />
                  </div>
                </div>
              )
            })}
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <Input value={newProfile} onChange={(e) => setNewProfile(e.target.value)} placeholder={t("set.pv.vehicleIdPh")}
                  className="h-8 w-48 font-mono text-xs" aria-label={t("set.pv.vehicleId")}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProfile() } }} />
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!newProfile.trim() || newProfile.trim() in profiles}
                  onClick={addProfile}>
                  <Plus className="h-3.5 w-3.5" />{t("set.pv.addProfile")}
                </Button>
                {newProfile.trim() in profiles && <span className="text-xs text-destructive">{t("set.pv.profileExists")}</span>}
              </div>
            )}
          </div>
        </>
      ))}

      {card(G.score, (
        <>
          <FieldBlock label={t("set.pv.score_weights")} help={t("set.pv.score_weights.help")} error={err("score_weights")}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {SCORE_COMPONENTS.map((c) => (
                <NumField key={c} id={`pv-w-${c}`} compact label={<span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", WEIGHT_COLORS[c])} />{t(`pv.comp.${c}`)}</span>}
                  help={t(`set.pv.w.${c}.help`)} value={weights[c] ?? 0} def={D.score_weights[c]} spec={WEIGHT_SPEC} step={0.05}
                  readOnly={readOnly} error={form.errors[`score_weights.${c}`]}
                  onChange={(v) => set("score_weights", { ...weights, [c]: v ?? 0 })} />
              ))}
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {wSum > 0 && SCORE_COMPONENTS.map((c) => {
                  const w = Number.isFinite(weights[c]) ? weights[c] ?? 0 : 0
                  return w > 0 ? <div key={c} className={WEIGHT_COLORS[c]} style={{ width: `${(w / wSum) * 100}%` }} title={`${t(`pv.comp.${c}`)} ${Math.round((w / wSum) * 100)}%`} /> : null
                })}
              </div>
              <p className={cn("text-xs tabular-nums", Math.abs(wSum - 1) < 0.005 ? "text-success" : wSum > 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>
                {t("set.pv.weightsSum", { sum: fmt(wSum) })}{" "}
                <span className="text-muted-foreground">{Math.abs(wSum - 1) < 0.005 ? t("set.pv.weightsOk") : wSum > 0 ? t("set.pv.weightsNormalised") : ""}</span>
              </p>
            </div>
          </FieldBlock>
          <div className="grid gap-4 sm:grid-cols-2">
            {num("auto_accept_score")}
            {num("auto_reject_score")}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("set.pv.scoreOverrideNote")}</p>
        </>
      ))}

      {card(G.severity, (
        <>
          <FieldBlock label={t("set.pv.severity_by_subtype")} help={t("set.pv.severity_by_subtype.help")} error={err("severity_by_subtype")}>
            <div className="grid gap-3 sm:grid-cols-3">
              {PV_SUBTYPES.map((s) => (
                <div key={s} className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t(`pv.subtype.${s}`)}</p>
                  <Select value={d.severity_by_subtype?.[s] ?? D.severity_by_subtype[s]} disabled={readOnly}
                    onValueChange={(v) => set("severity_by_subtype", { ...d.severity_by_subtype, [s]: v })}>
                    <SelectTrigger className="h-8 w-full" aria-label={t(`pv.subtype.${s}`)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITY_LEVELS.map((l) => <SelectItem key={l} value={l}>{t(`pv.severity.${l}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{t("set.default")} {t(`pv.severity.${D.severity_by_subtype[s]}`)}</p>
                </div>
              ))}
            </div>
          </FieldBlock>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label={t("set.pv.heavy_vehicle_classes")} help={t("set.pv.heavy_vehicle_classes.help")} error={err("heavy_vehicle_classes")}>
              <ChipToggles readOnly={readOnly} value={d.heavy_vehicle_classes} onChange={(v) => set("heavy_vehicle_classes", v)}
                options={VEHICLE_CLASSES.map((c) => ({ value: c, label: t(`pv.class.${c}`) }))} />
            </FieldBlock>
            {num("heavy_vehicle_bump")}
          </div>
        </>
      ))}

      {card(G.storage, (
        <>
          <SwitchRow id="pv-store" label={t("set.pv.store_rejected_for_review")} help={t("set.pv.store_rejected_for_review.help")}
            def={D.store_rejected_for_review} checked={d.store_rejected_for_review} readOnly={readOnly}
            onChange={(v) => set("store_rejected_for_review", v)} error={err("store_rejected_for_review")} />
          <FieldBlock label={t("set.pv.review_verdicts")} help={t("set.pv.review_verdicts.help")} error={err("review_verdicts")}>
            <ChipToggles readOnly={readOnly || !d.store_rejected_for_review} value={d.review_verdicts} onChange={(v) => set("review_verdicts", v)}
              options={REVIEWABLE_VERDICTS.map((v) => ({ value: v, label: `${t(`pv.verdict.${v}`)} → ${t(`rej.code.${v === "moving" ? "ai_moving_vehicle" : `ai_${v}`}`)}` }))} />
          </FieldBlock>
        </>
      ))}

      <StickySaveBar readOnly={readOnly} changedCount={changed.length} saving={saving} onSave={save} onDiscard={discard}
        blocked={Object.keys(local).length > 0} generalError={form.errors[""]} />
    </div>
  )
}

/** Icon used for the parked-vehicle settings page header. */
export const ParkedVehicleIcon = Layers
