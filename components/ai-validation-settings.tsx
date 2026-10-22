"use client"

/**
 * Settings → "AI validation" card (settings section `ai_validation`,
 * RRAP-05-012/016, RRAP-06-007, RRAP-13-001): the mode (manual / assisted /
 * automatic), the audit sample rate, the classifier-agreement switch and
 * per-type thresholds. Empty threshold fields follow the model cards (then
 * the "Validation rules" card) — their effective value is the placeholder.
 * Editing needs settings:edit.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { BrainCircuit, Loader2 } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useM6Labels } from "@/components/m6-shared"
import { ApiError, errorText } from "@/lib/auth-api"
import {
  THRESHOLD_FIELDS, listModels, saveAiValidationSettings,
  type AiMode, type AiTypeThresholds, type AiValidationSettings, type ModelsOut, type PerClassThresholds, type ThresholdField,
} from "@/lib/ai-models-api"
import { signLabel } from "@/lib/i18n/extra/traffic-signs"
import { cn } from "@/lib/utils"

type PcField = "auto_accept" | "auto_reject"
const PC_FIELDS: PcField[] = ["auto_accept", "auto_reject"]
/** Type whose verifier thresholds can be set per class (sign code). */
const PER_CLASS_TYPE = "traffic_sign"
/** Classifier classes that are never a subtype (no per-class threshold). */
const NOT_A_CLASS = new Set(["not_a_sign"])

const MODES: AiMode[] = ["manual", "assisted", "automatic"]

interface Form {
  mode: AiMode
  auditPct: string
  agree: boolean
  osdMask: boolean
  overrides: Record<string, Record<ThresholdField, string>>
  /** type → sign code → verifier thresholds (traffic_sign only). */
  perClass: Record<string, Record<string, Record<PcField, string>>>
  minFrames: string
  maxDrift: string
  potholeY: string
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n))
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s))
const inUnit = (n: number | null) => n == null || (!Number.isNaN(n) && n >= 0 && n <= 1)

function toForm(v: AiValidationSettings, types: string[]): Form {
  const all = Array.from(new Set([...types, ...Object.keys(v.type_overrides ?? {})]))
  return {
    mode: v.mode,
    auditPct: str(Math.round(v.audit_sample_rate * 1000) / 10),
    agree: v.require_classifier_agreement,
    osdMask: v.ignore_osd_text_boxes ?? true,
    overrides: Object.fromEntries(all.map((ty) => [ty, Object.fromEntries(
      THRESHOLD_FIELDS.map((f) => [f, str(v.type_overrides?.[ty]?.[f])]),
    ) as Record<ThresholdField, string>])),
    perClass: Object.fromEntries(all.map((ty) => [ty, Object.fromEntries(
      Object.entries(v.type_overrides?.[ty]?.per_class ?? {}).map(([code, pc]) => [code, {
        auto_accept: str(pc?.auto_accept), auto_reject: str(pc?.auto_reject),
      }]),
    )])),
    minFrames: str(v.min_frames_for_auto_accept),
    maxDrift: str(v.max_static_drift_m),
    potholeY: str(v.pothole_min_y_ratio),
  }
}

function fromForm(f: Form): AiValidationSettings {
  const type_overrides: AiValidationSettings["type_overrides"] = {}
  for (const ty of Array.from(new Set([...Object.keys(f.overrides), ...Object.keys(f.perClass)]))) {
    const o = f.overrides[ty]
    const entry: AiTypeThresholds = {}
    for (const k of THRESHOLD_FIELDS) {
      const v = o ? num(o[k]) : null
      if (v != null) entry[k] = v
    }
    const per_class: Record<string, PerClassThresholds> = {}
    for (const [code, pc] of Object.entries(f.perClass[ty] ?? {})) {
      const e: PerClassThresholds = {}
      for (const k of PC_FIELDS) {
        const v = num(pc[k])
        if (v != null) e[k] = v
      }
      if (Object.keys(e).length) per_class[code] = e
    }
    if (Object.keys(per_class).length) entry.per_class = per_class
    if (Object.keys(entry).length) type_overrides[ty] = entry
  }
  const pct = num(f.auditPct)
  const out: AiValidationSettings = {
    mode: f.mode,
    audit_sample_rate: pct == null ? 0 : Math.round(pct * 10) / 1000,
    require_classifier_agreement: f.agree,
    ignore_osd_text_boxes: f.osdMask,
    type_overrides,
  }
  const minFrames = num(f.minFrames)
  const maxDrift = num(f.maxDrift)
  const potholeY = num(f.potholeY)
  if (minFrames != null) out.min_frames_for_auto_accept = minFrames
  if (maxDrift != null) out.max_static_drift_m = maxDrift
  if (potholeY != null) out.pothole_min_y_ratio = potholeY
  return out
}

function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (err instanceof ApiError && Array.isArray(err.detail.errors)) {
    for (const e of err.detail.errors as { field?: string; message?: string }[]) {
      if (e.field) out[e.field.replace(/^body\./, "")] = e.message ?? ""
    }
  }
  return out
}

export function AiValidationCard({ readOnly }: { readOnly: boolean }) {
  const L = useM6Labels()
  const { t } = L
  const [data, setData] = useState<ModelsOut | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = () =>
    listModels()
      .then((m) => { setData(m); setForm(toForm(m.ai_validation, Object.keys(m.thresholds))) })
      .catch((err) => { setData(null); setLoadError(errorText(t, err, "m6")) })

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const types = data ? Object.keys(data.thresholds) : []
  // only types / verifiers whose model weights are installed are shown
  const installedTypes = new Set((data?.models ?? []).filter((m) => m.present && m.role === "detector").map((m) => m.detection_type))
  const perClassInstalled = (data?.models ?? []).some((m) => m.present && m.role === "classifier" && m.detection_type === PER_CLASS_TYPE)
  const next = form ? fromForm(form) : null
  const dirty = !!(data && next && JSON.stringify(fromForm(toForm(data.ai_validation, types))) !== JSON.stringify(next))

  const localErrors: Record<string, string> = {}
  if (form && next) {
    const pct = num(form.auditPct)
    if (pct == null || Number.isNaN(pct) || pct < 0 || pct > 100) localErrors.audit_sample_rate = t("ai.set.err.pct")
    const mf = num(form.minFrames)
    if (mf != null && (Number.isNaN(mf) || !Number.isInteger(mf) || mf < 1)) localErrors.min_frames_for_auto_accept = t("ai.set.err.minFrames")
    const md = num(form.maxDrift)
    if (md != null && (Number.isNaN(md) || md <= 0)) localErrors.max_static_drift_m = t("ai.set.err.drift")
    const py = num(form.potholeY)
    if (!inUnit(py)) localErrors.pothole_min_y_ratio = t("ai.set.err.ratio")
    for (const [ty, o] of Object.entries(next.type_overrides)) {
      for (const pc of Object.values(o.per_class ?? {})) {
        if (!inUnit(pc.auto_accept ?? null) || !inUnit(pc.auto_reject ?? null)) localErrors[`type_overrides.${ty}.per_class`] = t("m6.set.err.unit")
        else if (pc.auto_accept != null && pc.auto_reject != null && pc.auto_accept <= pc.auto_reject) localErrors[`type_overrides.${ty}.per_class`] = t("ai.set.err.order")
      }
      const { per_class: _pc, ...flat } = o // eslint-disable-line @typescript-eslint/no-unused-vars
      if (!Object.values(flat).every((v) => inUnit((v as number | null | undefined) ?? null))) localErrors[`type_overrides.${ty}`] = t("m6.set.err.unit")
      else if (o.auto_accept != null && o.auto_reject != null && o.auto_accept <= o.auto_reject) localErrors[`type_overrides.${ty}`] = t("ai.set.err.order")
      else if (o.detector_accept != null && o.detector_reject != null && o.detector_accept <= o.detector_reject) localErrors[`type_overrides.${ty}`] = t("ai.set.err.order")
    }
  }
  const allErrors = { ...errors, ...localErrors }
  const err = (k: string) => allErrors[k] ? <p className="text-xs text-destructive">{allErrors[k]}</p> : null

  const patch = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setErrors({}) }
  const patchOverride = (ty: string, k: ThresholdField, v: string) =>
    setForm((f) => (f ? { ...f, overrides: { ...f.overrides, [ty]: { ...f.overrides[ty], [k]: v } } } : f))
  const patchPerClass = (ty: string, code: string, k: PcField, v: string) =>
    setForm((f) => {
      if (!f) return f
      const byType = f.perClass[ty] ?? {}
      const cur = byType[code] ?? { auto_accept: "", auto_reject: "" }
      return { ...f, perClass: { ...f.perClass, [ty]: { ...byType, [code]: { ...cur, [k]: v } } } }
    })
  const effPerClass = data?.thresholds[PER_CLASS_TYPE]?.per_class ?? {}
  const perClassCodes = form
    ? Array.from(new Set([...Object.keys(effPerClass), ...Object.keys(form.perClass[PER_CLASS_TYPE] ?? {})]))
        .filter((c) => !NOT_A_CLASS.has(c))
        .sort((a, b) => signLabel(a, L.lang).localeCompare(signLabel(b, L.lang), L.lang))
    : []

  const hasCards = !!data && (types.some((ty) => Object.values(data.thresholds[ty]?.card ?? {}).some((v) => v != null))
    || Object.values(effPerClass).some((e) => e.auto_accept?.source === "card" || e.auto_reject?.source === "card"))
  const copyCards = () => {
    if (!data) return
    setForm((f) => {
      if (!f) return f
      const overrides = { ...f.overrides }
      for (const ty of types) {
        const card = data.thresholds[ty]?.card ?? {}
        overrides[ty] = { ...overrides[ty] }
        for (const k of THRESHOLD_FIELDS) if (card[k] != null) overrides[ty][k] = String(card[k])
      }
      const pcType = { ...(f.perClass[PER_CLASS_TYPE] ?? {}) }
      for (const [code, e] of Object.entries(data.thresholds[PER_CLASS_TYPE]?.per_class ?? {})) {
        if (NOT_A_CLASS.has(code)) continue
        const row = { ...(pcType[code] ?? { auto_accept: "", auto_reject: "" }) }
        for (const k of PC_FIELDS) if (e[k]?.source === "card" && e[k].value != null) row[k] = String(e[k].value)
        pcType[code] = row
      }
      return { ...f, overrides, perClass: { ...f.perClass, [PER_CLASS_TYPE]: pcType } }
    })
  }

  const save = async () => {
    if (!next) return
    setSaving(true)
    setErrors({})
    try {
      await saveAiValidationSettings(next)
      await load()
      toast.success(t("ai.set.saved"))
    } catch (e) {
      setErrors(fieldErrors(e))
      toast.error(errorText(t, e, "m6"))
    } finally {
      setSaving(false)
    }
  }

  const sourceLabel = (s: string | null | undefined) => (s ? t(`ai.src.${s}`) : t("ai.src.none"))

  return (
    <SectionCard id="ai-validation" icon={BrainCircuit} tone="purple" title={t("ai.set.title")} description={t("ai.set.hint")}
      actions={<Button asChild size="sm" variant="outline"><Link href="/admin/models">{t("ai.set.openModels")}</Link></Button>}>
      {data === undefined ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !form || !data ? (
        <Alert><AlertDescription>{loadError ?? t("m6.set.unavailable")}</AlertDescription></Alert>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t("ai.set.mode")}</Label>
            <RadioGroup value={form.mode} onValueChange={(v) => patch({ mode: v as AiMode })} disabled={readOnly}
              className="grid gap-2 md:grid-cols-3">
              {MODES.map((m) => (
                <label key={m} htmlFor={`ai-mode-${m}`}
                  className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                    form.mode === m ? "border-primary bg-primary/5" : "hover:bg-muted/40", readOnly && "cursor-default")}>
                  <RadioGroupItem id={`ai-mode-${m}`} value={m} className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      {t(`ai.mode.${m}`)}
                      {m === "assisted" && <Badge variant="secondary" className="text-[10px]">{t("ai.mode.default")}</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`ai.mode.${m}.desc`)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-audit" className="text-xs font-medium">{t("ai.set.audit")}</Label>
              <div className="flex items-center gap-2">
                <Input id="ai-audit" type="number" min={0} max={100} step={1} value={form.auditPct} disabled={readOnly || form.mode === "manual"}
                  onChange={(e) => patch({ auditPct: e.target.value })} className="h-9 max-w-[8rem]" aria-invalid={!!allErrors.audit_sample_rate} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("ai.set.auditHint")}</p>
              {err("audit_sample_rate")}
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-agree">{t("ai.set.agree")}</Label>
                <Switch id="ai-agree" checked={form.agree} disabled={readOnly || form.mode === "manual"}
                  onCheckedChange={(v) => patch({ agree: v })} />
              </div>
              <p className="text-xs text-muted-foreground">{t("ai.set.agreeHint")}</p>
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-osd-mask">{t("ai.set.osdMask")}</Label>
                <Switch id="ai-osd-mask" checked={form.osdMask} disabled={readOnly}
                  onCheckedChange={(v) => patch({ osdMask: v })} />
              </div>
              <p className="text-xs text-muted-foreground">{t("ai.set.osdMaskHint")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium">{t("ai.set.thresholds")}</Label>
              {!readOnly && hasCards && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyCards}>{t("ai.set.copyCards")}</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("ai.set.thresholdsHint")}</p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{t("m6.filter.type")}</TableHead>
                    {THRESHOLD_FIELDS.map((f) => <TableHead key={f} className="whitespace-nowrap">{t(`ai.th.${f}`)}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(form.overrides).filter(([ty]) => installedTypes.has(ty)).map(([ty, o]) => {
                    const eff = data.thresholds[ty]
                    return (
                      <TableRow key={ty}>
                        <TableCell className="text-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {L.typeLabel(ty)}
                            <Badge variant="outline" className="text-[10px]">{eff?.two_stage ? t("ai.twoStage") : t("ai.singleStage")}</Badge>
                          </div>
                          {err(`type_overrides.${ty}`)}
                        </TableCell>
                        {THRESHOLD_FIELDS.map((f) => {
                          const e = eff?.[f]
                          const inherited = e && e.source !== "override" ? e : null
                          const cls = f === "auto_accept" || f === "auto_reject"
                          return (
                            <TableCell key={f}>
                              <Input type="number" min={0} max={1} step={0.01} className="h-8 w-24" value={o[f]}
                                disabled={readOnly || (cls && !eff?.two_stage && o[f] === "")}
                                placeholder={inherited?.value != null ? String(inherited.value) : "—"}
                                onChange={(ev) => patchOverride(ty, f, ev.target.value)}
                                aria-label={`${L.typeLabel(ty)} — ${t(`ai.th.${f}`)}`} />
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {o[f] !== "" ? t("ai.src.override") : sourceLabel(inherited?.source)}
                              </p>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">{t("ai.set.fallbackNote")}</p>
          </div>

          {PER_CLASS_TYPE in form.overrides && perClassInstalled && (() => {
            // "not a sign" (classifier reject class): auto-reject threshold, or 1 = never (always review)
            const nas = form.perClass[PER_CLASS_TYPE]?.not_a_sign?.auto_accept ?? ""
            const cardNas = effPerClass.not_a_sign?.auto_accept
            const inheritedNas = cardNas && cardNas.source !== "override" ? cardNas.value : null
            const effective = nas !== "" ? Number(nas) : inheritedNas
            const rejecting = effective == null || effective < 1
            return (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="ai-not-a-sign">{t("ai.set.notASign")}</Label>
                  <Switch id="ai-not-a-sign" checked={rejecting} disabled={readOnly}
                    onCheckedChange={(on) => patchPerClass(PER_CLASS_TYPE, "not_a_sign", "auto_accept", on ? "" : "1")} />
                </div>
                <p className="text-xs text-muted-foreground">{t("ai.set.notASignHint")}</p>
                {rejecting ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="ai-not-a-sign-th" className="text-xs text-muted-foreground">{t("ai.set.notASignThreshold")}</Label>
                    <Input id="ai-not-a-sign-th" type="number" min={0} max={1} step={0.01} className="h-8 w-24" value={nas}
                      disabled={readOnly} placeholder={inheritedNas != null ? String(inheritedNas) : "—"}
                      onChange={(ev) => patchPerClass(PER_CLASS_TYPE, "not_a_sign", "auto_accept", ev.target.value)} />
                    <span className="text-[10px] text-muted-foreground">
                      {nas !== "" ? t("ai.src.override") : sourceLabel(cardNas?.source)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-warning">{t("ai.set.notASignOff")}</p>
                )}
              </div>
            )
          })()}

          {PER_CLASS_TYPE in form.overrides && perClassInstalled && (
            <details className="space-y-1.5 rounded-lg border p-3" open={Object.keys(form.perClass[PER_CLASS_TYPE] ?? {}).length > 0 || undefined}>
              <summary className="cursor-pointer text-xs font-medium">{t("ai.set.perClass")}</summary>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("ai.set.perClassHint")}</p>
              {err(`type_overrides.${PER_CLASS_TYPE}.per_class`)}
              {perClassCodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("ai.set.perClassEmpty")}</p>
              ) : (
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>{t("ai.perClass.code")}</TableHead>
                        {PC_FIELDS.map((f) => <TableHead key={f} className="whitespace-nowrap">{t(`ai.th.${f}`)}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perClassCodes.map((code) => {
                        const row = form.perClass[PER_CLASS_TYPE]?.[code] ?? { auto_accept: "", auto_reject: "" }
                        return (
                          <TableRow key={code}>
                            <TableCell className="text-xs">
                              <div className="font-medium">{signLabel(code, L.lang)}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{code}</div>
                            </TableCell>
                            {PC_FIELDS.map((f) => {
                              const e = effPerClass[code]?.[f]
                              const inherited = e && e.source !== "override" ? e : null
                              return (
                                <TableCell key={f}>
                                  <Input type="number" min={0} max={1} step={0.01} className="h-8 w-24" value={row[f]}
                                    disabled={readOnly}
                                    placeholder={inherited?.value != null ? String(inherited.value) : "—"}
                                    onChange={(ev) => patchPerClass(PER_CLASS_TYPE, code, f, ev.target.value)}
                                    aria-label={`${signLabel(code, L.lang)} — ${t(`ai.th.${f}`)}`} />
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {row[f] !== "" ? t("ai.src.override") : sourceLabel(inherited?.source)}
                                  </p>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </details>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium">{t("ai.set.guards")}</Label>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 rounded-lg border p-3">
                <Label htmlFor="ai-min-frames" className="text-xs font-medium">{t("ai.set.minFrames")}</Label>
                <Input id="ai-min-frames" type="number" min={1} step={1} value={form.minFrames} placeholder="2"
                  disabled={readOnly} className="h-9 max-w-[8rem]" aria-invalid={!!allErrors.min_frames_for_auto_accept}
                  onChange={(e) => patch({ minFrames: e.target.value })} />
                <p className="text-xs text-muted-foreground">{t("ai.set.minFramesHint")}</p>
                {err("min_frames_for_auto_accept")}
              </div>
              <div className="space-y-1.5 rounded-lg border p-3">
                <Label htmlFor="ai-max-drift" className="text-xs font-medium">{t("ai.set.maxDrift")}</Label>
                <Input id="ai-max-drift" type="number" min={0} step={0.5} value={form.maxDrift} placeholder="8"
                  disabled={readOnly} className="h-9 max-w-[8rem]" aria-invalid={!!allErrors.max_static_drift_m}
                  onChange={(e) => patch({ maxDrift: e.target.value })} />
                <p className="text-xs text-muted-foreground">{t("ai.set.maxDriftHint")}</p>
                {err("max_static_drift_m")}
              </div>
              <div className="space-y-1.5 rounded-lg border p-3">
                <Label htmlFor="ai-pothole-y" className="text-xs font-medium">{t("ai.set.potholeY")}</Label>
                <div className="flex items-center gap-3">
                  <Input id="ai-pothole-y" type="number" min={0} max={1} step={0.05} value={form.potholeY} placeholder="0.45"
                    disabled={readOnly} className="h-9 max-w-[8rem]" aria-invalid={!!allErrors.pothole_min_y_ratio}
                    onChange={(e) => patch({ potholeY: e.target.value })} />
                  <RoadLine ratio={(() => { const v = num(form.potholeY); return v != null && inUnit(v) ? v : 0.45 })()}
                    above={t("ai.set.potholeYAbove")} below={t("ai.set.potholeYBelow")} />
                </div>
                <p className="text-xs text-muted-foreground">{t("ai.set.potholeYHint")}</p>
                {err("pothole_min_y_ratio")}
              </div>
            </div>
          </div>

          {!readOnly && (
            <div className="flex items-center justify-end gap-2 border-t pt-3">
              {dirty && <span className="mr-auto text-xs text-muted-foreground">{t("m6.set.unsaved")}</span>}
              <Button size="sm" variant="ghost" disabled={!dirty || saving}
                onClick={() => data && setForm(toForm(data.ai_validation, types))}>{t("m6.set.discard")}</Button>
              <Button size="sm" disabled={!dirty || saving || Object.keys(localErrors).length > 0} onClick={save}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

/** Tiny camera frame with the pothole road-area line drawn at `ratio` of its height. */
function RoadLine({ ratio, above, below }: { ratio: number; above: string; below: string }) {
  const pct = `${Math.round(ratio * 100)}%`
  return (
    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded border bg-muted/40" aria-hidden>
      <div className="absolute inset-x-0 bottom-0 bg-emerald-500/15" style={{ top: pct }} />
      <div className="absolute inset-x-0 border-t-2 border-dashed border-amber-500" style={{ top: pct }} />
      <span className="absolute left-1 top-0.5 text-[8px] leading-none text-muted-foreground">{above}</span>
      <span className="absolute bottom-0.5 left-1 text-[8px] leading-none text-emerald-700 dark:text-emerald-400">{below}</span>
    </div>
  )
}
