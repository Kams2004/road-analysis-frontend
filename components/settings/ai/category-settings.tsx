"use client"

/**
 * Settings → Module 5 · AI detection → one detection category (potholes,
 * traffic signs, speed bumps, parked vehicles). Everything that applies to
 * that type, gathered from the sections where it is stored:
 *  - Model: the model slot(s) of the type (GET /models/) — read-only;
 *  - Decision thresholds: ai_validation.type_overrides[type] (detector /
 *    verifier accept & reject, effective value and its source as hint),
 *    validation.type_overrides[type] (fallback rules) and whether each
 *    subtype forms its own hazard (validation.distinct_subtype_types);
 *  - Processing: processing.frame_skip_by_model[model key];
 *  - Type extras: potholes → pothole_min_y_ratio and the false-positive rules
 *    pothole_off_road_action / pothole_max_width_ratio / pothole_max_area_ratio /
 *    pothole_reject_edge_touching (ai_validation; auto-reject `ai_off_road` /
 *    `ai_box_too_large` in assisted / automatic mode, hints in manual mode);
 *  - Hazard lifecycle: summary of the type's policy, link to its editor.
 * One Save sends only the sections that changed (whole nested maps, as the
 * API replaces them).
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { BrainCircuit, Cpu, Hourglass, Loader2, SlidersHorizontal } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { StatusBadge as Pill } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldBlock, NumField, StickySaveBar, SwitchRow, numProblem } from "@/components/settings/form-kit"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useM6Labels } from "@/components/m6-shared"
import { errorText } from "@/lib/auth-api"
import {
  POTHOLE_RULE_DEFAULTS, THRESHOLD_FIELDS, listModels, type AiValidationSettings, type ModelsOut, type PotholeOffRoadAction,
  type ThresholdField,
} from "@/lib/ai-models-api"
import type { ValidationSettings } from "@/lib/module6-api"
import type { ProcessingSettings } from "@/lib/module7-api"
import {
  DEFAULT_POLICIES, TYPE_POLICY_DEFAULTS, getAllSettings, saveSettingsSection, settingsErrors, type HazardLifecycleSettings,
  type TypePolicy,
} from "@/lib/settings-api"

/** Job model key of each detection type. */
export const TYPE_MODEL_KEY: Record<string, string> = {
  pothole: "pothole", traffic_sign: "signs", speed_bump: "speedbump", parked_vehicle: "vehicles",
}

interface Loaded {
  models: ModelsOut | null
  ai: AiValidationSettings
  validation: ValidationSettings
  processing: ProcessingSettings
  lifecycle: HazardLifecycleSettings | null
}

interface Draft {
  th: Record<ThresholdField, number | null>
  rule: { auto_reject_below: number | null; auto_accept_above: number | null }
  distinct: boolean
  skip: number | null
  potholeY: number | null
  /** Pothole false-positive rules (ai_validation.pothole_*). */
  pr: { offRoad: PotholeOffRoadAction; maxW: number | null; maxA: number | null; edge: boolean }
}

function toDraft(l: Loaded, type: string): Draft {
  const o = l.ai.type_overrides?.[type] ?? {}
  return {
    th: Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f, o[f] ?? null])) as Record<ThresholdField, number | null>,
    rule: {
      auto_reject_below: l.validation.type_overrides?.[type]?.auto_reject_below ?? null,
      auto_accept_above: l.validation.type_overrides?.[type]?.auto_accept_above ?? null,
    },
    distinct: (l.validation.distinct_subtype_types ?? []).includes(type),
    skip: l.processing.frame_skip_by_model?.[TYPE_MODEL_KEY[type] ?? type] ?? null,
    potholeY: l.ai.pothole_min_y_ratio ?? null,
    pr: {
      offRoad: l.ai.pothole_off_road_action ?? POTHOLE_RULE_DEFAULTS.pothole_off_road_action,
      maxW: l.ai.pothole_max_width_ratio ?? POTHOLE_RULE_DEFAULTS.pothole_max_width_ratio,
      maxA: l.ai.pothole_max_area_ratio ?? POTHOLE_RULE_DEFAULTS.pothole_max_area_ratio,
      edge: l.ai.pothole_reject_edge_touching ?? POTHOLE_RULE_DEFAULTS.pothole_reject_edge_touching,
    },
  }
}

const UNIT = { min: 0, max: 1, nullable: true }
const SHARE = { min: 0, max: 1, minExclusive: true }    // pydantic gt=0, le=1

export function CategorySettings({ type, readOnly, hasSubtypes = true }: { type: string; readOnly: boolean; hasSubtypes?: boolean }) {
  const L = useM6Labels()
  const { t } = L
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const modelKey = TYPE_MODEL_KEY[type] ?? type

  const load = useCallback(async () => {
    try {
      const [all, models] = await Promise.all([getAllSettings(), listModels().catch(() => null)])
      const l: Loaded = {
        models,
        ai: (all.ai_validation ?? models?.ai_validation ?? { mode: "assisted", audit_sample_rate: 0, require_classifier_agreement: true, type_overrides: {} }) as unknown as AiValidationSettings,
        validation: (all.validation ?? { auto_reject_below: 0, auto_accept_above: null, type_overrides: {}, clip_seconds: 5, distinct_subtype_types: [] }) as unknown as ValidationSettings,
        processing: (all.processing ?? { frame_skip_default: 5, frame_skip_by_model: {} }) as unknown as ProcessingSettings,
        lifecycle: (all.hazard_lifecycle ?? null) as unknown as HazardLifecycleSettings | null,
      }
      setLoaded(l)
      setDraft(toDraft(l, type))
    } catch (err) {
      setError(errorText(t, err, "account.platform"))
    }
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const base = useMemo(() => (loaded ? toDraft(loaded, type) : null), [loaded, type])
  const sections = useMemo(() => {
    if (!draft || !base) return { ai: false, validation: false, processing: false }
    return {
      ai: JSON.stringify(draft.th) !== JSON.stringify(base.th) || draft.potholeY !== base.potholeY
        || JSON.stringify(draft.pr) !== JSON.stringify(base.pr),
      validation: JSON.stringify(draft.rule) !== JSON.stringify(base.rule) || draft.distinct !== base.distinct,
      processing: draft.skip !== base.skip,
    }
  }, [draft, base])
  const changedCount = Object.values(sections).filter(Boolean).length

  const local: Record<string, string> = {}
  if (draft) {
    const chk = (k: string, v: number | null, spec: Parameters<typeof numProblem>[1]) => { const p = numProblem(v, spec); if (p) local[k] = t(p[0], p[1]) }
    for (const f of THRESHOLD_FIELDS) chk(`th.${f}`, draft.th[f], UNIT)
    chk("rule.auto_reject_below", draft.rule.auto_reject_below, UNIT)
    chk("rule.auto_accept_above", draft.rule.auto_accept_above, UNIT)
    chk("skip", draft.skip, { min: 1, max: 60, integer: true, nullable: true })
    chk("potholeY", draft.potholeY, UNIT)
    if (type === "pothole") {
      chk("pr.maxW", draft.pr.maxW, SHARE)
      chk("pr.maxA", draft.pr.maxA, SHARE)
    }
    if (draft.th.auto_accept != null && draft.th.auto_reject != null && draft.th.auto_accept <= draft.th.auto_reject) local["th.auto_accept"] = t("ai.set.err.order")
    if (draft.th.detector_accept != null && draft.th.detector_reject != null && draft.th.detector_accept <= draft.th.detector_reject) local["th.detector_accept"] = t("ai.set.err.order")
  }

  const save = async () => {
    if (!draft || !loaded) return
    setSaving(true)
    setErrors({})
    try {
      if (sections.ai) {
        const overrides = { ...(loaded.ai.type_overrides ?? {}) }
        const entry = { ...(overrides[type] ?? {}) }
        for (const f of THRESHOLD_FIELDS) { if (draft.th[f] == null) delete entry[f]; else entry[f] = draft.th[f] }
        if (Object.keys(entry).length) overrides[type] = entry
        else delete overrides[type]
        const body: Record<string, unknown> = { type_overrides: overrides }
        if (type === "pothole" && draft.potholeY != null) body.pothole_min_y_ratio = draft.potholeY
        if (type === "pothole") {
          body.pothole_off_road_action = draft.pr.offRoad
          if (draft.pr.maxW != null) body.pothole_max_width_ratio = draft.pr.maxW
          if (draft.pr.maxA != null) body.pothole_max_area_ratio = draft.pr.maxA
          body.pothole_reject_edge_touching = draft.pr.edge
        }
        await saveSettingsSection("ai_validation", body)
      }
      if (sections.validation) {
        const overrides = { ...(loaded.validation.type_overrides ?? {}) }
        const e: Record<string, number> = {}
        if (draft.rule.auto_reject_below != null) e.auto_reject_below = draft.rule.auto_reject_below
        if (draft.rule.auto_accept_above != null) e.auto_accept_above = draft.rule.auto_accept_above
        if (Object.keys(e).length) overrides[type] = e
        else delete overrides[type]
        const distinct = new Set(loaded.validation.distinct_subtype_types ?? [])
        if (draft.distinct) distinct.add(type)
        else distinct.delete(type)
        await saveSettingsSection("validation", { type_overrides: overrides, distinct_subtype_types: Array.from(distinct) })
      }
      if (sections.processing) {
        const by = { ...(loaded.processing.frame_skip_by_model ?? {}) }
        if (draft.skip == null) delete by[modelKey]
        else by[modelKey] = draft.skip
        await saveSettingsSection("processing", { frame_skip_by_model: by })
      }
      toast.success(t("set.saved"))
      await load()
    } catch (err) {
      setErrors(settingsErrors(err))
      toast.error(errorText(t, err, "account.platform"))
      await load().catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!loaded || !draft || !base) {
    return <div className="flex min-h-[12vh] items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  const allSlots = loaded.models?.models.filter((m) => m.detection_type === type || m.key === modelKey) ?? []
  // only installed models (weights file present) are shown
  const slots = allSlots.filter((m) => m.present)
  const missingSlots = allSlots.length - slots.length
  const eff = loaded.models?.thresholds?.[type]
  const srcLabel = (s: string | null | undefined) => (s ? t(`ai.src.${s}`) : t("ai.src.none"))
  const policy: TypePolicy = { ...TYPE_POLICY_DEFAULTS, ...(loaded.lifecycle?.policies?.[type] ?? DEFAULT_POLICIES[type] ?? loaded.lifecycle?.default_policy ?? {}) }
  const hours = (h: number | null) => (h == null ? t("set.hl.never") : t("set.hl.hoursN", { n: h }))
  const patch = (p: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setErrors({}) }
  const errOf = (k: string, server?: string) => (server ? errors[server] : undefined) ?? local[k]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard id="model" icon={BrainCircuit} tone="purple" title={t("set.cat.model")} description={t("set.cat.modelDesc")}
          actions={<Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href="/admin/models">{t("ai.set.openModels")}</Link></Button>}>
          {!slots.length ? (
            <p className="text-sm text-muted-foreground">{t("set.cat.noSlot")}</p>
          ) : slots.map((s) => (
            <div key={s.key} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{t(`ai.slot.${s.key}`) === `ai.slot.${s.key}` ? s.key : t(`ai.slot.${s.key}`)}</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground">{s.version ?? s.file ?? s.path ?? "—"}</p>
                {s.card && <p className="text-[11px] text-muted-foreground">{s.card.name}:{s.card.version} · {t("set.cat.classes", { n: s.card.classes.length })}</p>}
              </div>
              <Pill tone={s.present ? "green" : "red"}>{s.present ? t("set.cat.loaded") : t("set.cat.missing")}</Pill>
            </div>
          ))}
          {missingSlots > 0 && <p className="text-[11px] text-muted-foreground">{t("ai.models.notInstalled", { n: missingSlots })}</p>}
          <p className="text-[11px] text-muted-foreground">{t("set.cat.modelKey", { key: modelKey })}</p>
        </SectionCard>

        <SectionCard id="lifecycle" icon={Hourglass} tone="red" title={t("set.cat.lifecycle")} description={t("set.cat.lifecycleDesc")}
          actions={<Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href={`/settings/hazards/lifecycle#policy-${type}`}>{t("set.cat.editPolicy")}</Link></Button>}>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">{t("set.hl.p.expiry_hours")}</p>{hours(policy.expiry_hours)}</div>
            <div><p className="text-xs text-muted-foreground">{t("set.hl.p.absence_resolution")}</p>
              {policy.absence_resolution ? t("set.hl.afterPasses", { n: policy.absences_to_resolve }) : t("set.off")}</div>
            <div><p className="text-xs text-muted-foreground">{t("set.hl.p.votes_enabled")}</p>
              {policy.votes_enabled ? t("set.hl.afterVotes", { n: policy.not_there_to_resolve }) : t("set.off")}</div>
            <div><p className="text-xs text-muted-foreground">{t("set.hl.p.alert_priority")}</p>{t(`set.hl.prio.${policy.alert_priority}`)}</div>
          </div>
          {Object.keys(policy.subtype_overrides ?? {}).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(policy.subtype_overrides).map(([sub, o]) => (
                <Badge key={sub} variant="outline" className="text-[10px]">
                  {L.subtypeLabel(type, sub)}{o.expiry_hours !== undefined ? ` · ${hours(o.expiry_hours ?? null)}` : ""}
                </Badge>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard id="thresholds" icon={SlidersHorizontal} tone="orange" title={t("set.cat.thresholds")} description={t("set.cat.thresholdsDesc")}
        badge={eff && <Badge variant="outline" className="text-[10px]">{eff.two_stage ? t("ai.twoStage") : t("ai.singleStage")}</Badge>}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {THRESHOLD_FIELDS.map((f) => {
            const e = eff?.[f]
            const inherited = e && e.source !== "override" ? e : null
            return (
              <NumField key={f} id={`cat-${type}-${f}`} label={t(`ai.th.${f}`)} help={t(`set.cat.th.${f}`)}
                value={draft.th[f]} spec={UNIT} step={0.01} readOnly={readOnly}
                placeholder={inherited?.value != null ? String(inherited.value) : "—"}
                error={errOf(`th.${f}`, `type_overrides.${type}.${f}`)}
                onChange={(v) => patch({ th: { ...draft.th, [f]: v } })}
                className="rounded-lg border p-3" />
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("set.cat.effective")}{" "}
          {THRESHOLD_FIELDS.map((f) => `${t(`ai.th.${f}`)} ${eff?.[f]?.value ?? "—"} (${draft.th[f] != null ? t("ai.src.override") : srcLabel(eff?.[f]?.source)})`).join(" · ")}
        </p>
        {type === "parked_vehicle" && <p className="text-[11px] text-muted-foreground">{t("set.cat.pvScoreNote")}</p>}

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumField id={`cat-${type}-rej`} label={t("set.cat.ruleReject")} help={t("set.cat.ruleRejectHelp")} value={draft.rule.auto_reject_below}
            spec={UNIT} step={0.01} readOnly={readOnly} placeholder={String(loaded.validation.auto_reject_below ?? "")}
            error={errOf("rule.auto_reject_below", `type_overrides.${type}.auto_reject_below`)}
            onChange={(v) => patch({ rule: { ...draft.rule, auto_reject_below: v } })} />
          <NumField id={`cat-${type}-acc`} label={t("set.cat.ruleAccept")} help={t("set.cat.ruleAcceptHelp")} value={draft.rule.auto_accept_above}
            spec={UNIT} step={0.01} readOnly={readOnly} placeholder={loaded.validation.auto_accept_above != null ? String(loaded.validation.auto_accept_above) : t("set.off")}
            error={errOf("rule.auto_accept_above", `type_overrides.${type}.auto_accept_above`)}
            onChange={(v) => patch({ rule: { ...draft.rule, auto_accept_above: v } })} />
          {type === "pothole" && (
            <NumField id="cat-pothole-y" label={t("ai.set.potholeY")} help={t("ai.set.potholeYHint")} value={draft.potholeY}
              def={0.45} spec={UNIT} step={0.05} readOnly={readOnly} error={errOf("potholeY", "pothole_min_y_ratio")}
              onChange={(v) => patch({ potholeY: v })} />
          )}
        </div>
        {type === "pothole" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-[11px] text-muted-foreground">{t("ai.set.potholeRulesNote")}</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FieldBlock label={t("ai.set.potholeOffRoad")} help={t("ai.set.potholeOffRoadHint")} error={errors.pothole_off_road_action}>
                <Select value={draft.pr.offRoad} disabled={readOnly}
                  onValueChange={(v) => patch({ pr: { ...draft.pr, offRoad: v as PotholeOffRoadAction } })}>
                  <SelectTrigger id="cat-pothole-offroad" className="h-8 w-full max-w-[14rem]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reject">{t("ai.set.potholeOffRoad.reject")}</SelectItem>
                    <SelectItem value="review">{t("ai.set.potholeOffRoad.review")}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>
              <NumField id="cat-pothole-maxw" label={t("ai.set.potholeMaxWidth")} help={t("ai.set.potholeMaxWidthHint")}
                value={draft.pr.maxW} def={POTHOLE_RULE_DEFAULTS.pothole_max_width_ratio} spec={SHARE} step={0.05} readOnly={readOnly}
                error={errOf("pr.maxW", "pothole_max_width_ratio")} onChange={(v) => patch({ pr: { ...draft.pr, maxW: v } })} />
              <NumField id="cat-pothole-maxa" label={t("ai.set.potholeMaxArea")} help={t("ai.set.potholeMaxAreaHint")}
                value={draft.pr.maxA} def={POTHOLE_RULE_DEFAULTS.pothole_max_area_ratio} spec={SHARE} step={0.01} readOnly={readOnly}
                error={errOf("pr.maxA", "pothole_max_area_ratio")} onChange={(v) => patch({ pr: { ...draft.pr, maxA: v } })} />
            </div>
            <SwitchRow id="cat-pothole-edge" label={t("ai.set.potholeEdge")} help={t("ai.set.potholeEdgeHint")}
              checked={draft.pr.edge} def={POTHOLE_RULE_DEFAULTS.pothole_reject_edge_touching} readOnly={readOnly}
              error={errors.pothole_reject_edge_touching} onChange={(v) => patch({ pr: { ...draft.pr, edge: v } })} />
          </div>
        )}
        {hasSubtypes && (
          <SwitchRow id={`cat-${type}-distinct`} label={t("set.cat.distinct")} help={t(type === "parked_vehicle" ? "set.cat.distinctPv" : "set.cat.distinctHelp")}
            checked={draft.distinct} onChange={(v) => patch({ distinct: v })} readOnly={readOnly} error={errors.distinct_subtype_types} />
        )}
        {type === "traffic_sign" && (
          <p className="text-xs text-muted-foreground">
            {t("set.cat.perClassNote")}{" "}
            <Link href="/settings/ai#ai-validation" className="text-primary hover:underline">{t("set.page.aiValidation")}</Link>
          </p>
        )}
      </SectionCard>

      <SectionCard id="processing" icon={Cpu} tone="blue" title={t("set.cat.processing")} description={t("set.cat.processingDesc")}>
        <NumField id={`cat-${type}-skip`} label={t("set.cat.frameSkip")} help={t("set.cat.frameSkipHelp")} unit={t("set.unit.frames")}
          value={draft.skip} spec={{ min: 1, max: 60, integer: true, nullable: true }} readOnly={readOnly}
          placeholder={String(loaded.processing.frame_skip_default ?? "")} error={errOf("skip", `frame_skip_by_model.${modelKey}`) ?? errors[""]}
          onChange={(v) => patch({ skip: v })} />
      </SectionCard>

      <StickySaveBar readOnly={readOnly} changedCount={changedCount} saving={saving} onSave={save}
        onDiscard={() => { setDraft(base); setErrors({}) }} blocked={Object.keys(local).length > 0} generalError={errors[""]} />
    </div>
  )
}
