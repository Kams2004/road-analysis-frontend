"use client"

/**
 * Settings → Platform, Module 6 cards:
 *  - AI validation (settings section `ai_validation`, components/ai-validation-settings.tsx):
 *    the single source of automatic decisions; the rules below are its fallback.
 *  - Validation rules (settings section `validation`, RRAP-06-007): automatic
 *    rejection / acceptance thresholds, per-type overrides, context clip length
 *    and the types whose subtypes form distinct hazards.
 *  - A pointer to the global Cluster Configuration (/clustering, RRAP-06-009/010/011),
 *    the one place where clustering radii are set.
 * Editing needs settings:edit; everything is read-only otherwise.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, SlidersHorizontal } from "lucide-react"
import { SectionCard, SectionHeading } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/components/auth-provider"
import { AiValidationCard } from "@/components/ai-validation-settings"
import { ClusterConfigLinkCard } from "@/components/clustering/cluster-config-link"
import { useM6Labels } from "@/components/m6-shared"
import { ApiError, errorText } from "@/lib/auth-api"
import {
  DETECTION_TYPES, getValidationSettings, saveValidationSettings, type ValidationSettings,
} from "@/lib/module6-api"

type FieldErrors = Record<string, string>

function fieldErrors(err: unknown): FieldErrors {
  const out: FieldErrors = {}
  if (err instanceof ApiError && Array.isArray(err.detail.errors)) {
    for (const e of err.detail.errors as { field?: string; message?: string }[]) {
      if (e.field) out[e.field.replace(/^body\./, "")] = e.message ?? ""
    }
  }
  return out
}

/** "" → null, else number (NaN kept so validation can flag it). */
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s))
const str = (n: number | null | undefined) => (n == null ? "" : String(n))
const inUnit = (n: number | null) => n == null || (!Number.isNaN(n) && n >= 0 && n <= 1)

// ── Validation rules ────────────────────────────────────────────────────────

interface RulesForm {
  reject: string
  acceptOn: boolean
  accept: string
  clip: string
  distinct: string[]
  overrides: Record<string, { reject: string; accept: string }>
}

function toForm(v: ValidationSettings): RulesForm {
  const types = Array.from(new Set<string>([...DETECTION_TYPES, ...Object.keys(v.type_overrides ?? {})]))
  return {
    reject: str(v.auto_reject_below),
    acceptOn: v.auto_accept_above != null,
    accept: str(v.auto_accept_above ?? 0.95),
    clip: str(v.clip_seconds),
    distinct: [...(v.distinct_subtype_types ?? [])],
    overrides: Object.fromEntries(types.map((ty) => [ty, {
      reject: str(v.type_overrides?.[ty]?.auto_reject_below),
      accept: str(v.type_overrides?.[ty]?.auto_accept_above),
    }])),
  }
}

function fromForm(f: RulesForm): ValidationSettings {
  const type_overrides: ValidationSettings["type_overrides"] = {}
  for (const [ty, o] of Object.entries(f.overrides)) {
    const r = num(o.reject), a = num(o.accept)
    if (r == null && a == null) continue
    type_overrides[ty] = {}
    if (r != null) type_overrides[ty].auto_reject_below = r
    if (a != null) type_overrides[ty].auto_accept_above = a
  }
  return {
    auto_reject_below: num(f.reject) ?? 0,
    auto_accept_above: f.acceptOn ? num(f.accept) : null,
    clip_seconds: num(f.clip) ?? 5,
    distinct_subtype_types: f.distinct,
    type_overrides,
  }
}

export function ValidationRulesCard({ readOnly }: { readOnly: boolean }) {
  const L = useM6Labels()
  const { t } = L
  const [data, setData] = useState<ValidationSettings | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<RulesForm | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getValidationSettings()
      .then((v) => { setData(v); if (v) setForm(toForm(v)) })
      .catch((err) => { setData(null); setLoadError(errorText(t, err, "m6")) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const next = form ? fromForm(form) : null
  const dirty = !!(data && next && JSON.stringify(fromForm(toForm(data))) !== JSON.stringify(next))

  const localErrors: FieldErrors = {}
  if (form && next) {
    if (!inUnit(next.auto_reject_below)) localErrors.auto_reject_below = t("m6.set.err.unit")
    if (form.acceptOn && (next.auto_accept_above == null || !inUnit(next.auto_accept_above))) localErrors.auto_accept_above = t("m6.set.err.unit")
    if (form.acceptOn && next.auto_accept_above != null && next.auto_accept_above <= next.auto_reject_below) localErrors.auto_accept_above = t("m6.set.err.acceptAboveReject")
    if (!Number.isInteger(next.clip_seconds) || next.clip_seconds < 1 || next.clip_seconds > 30) localErrors.clip_seconds = t("m6.set.err.clip")
    for (const [ty, o] of Object.entries(next.type_overrides)) {
      if (!inUnit(o.auto_reject_below ?? null) || !inUnit(o.auto_accept_above ?? null)) localErrors[`type_overrides.${ty}`] = t("m6.set.err.unit")
    }
  }
  const allErrors = { ...errors, ...localErrors }

  const patch = (p: Partial<RulesForm>) => { setForm((f) => (f ? { ...f, ...p } : f)); setErrors({}) }
  const patchOverride = (ty: string, k: "reject" | "accept", v: string) =>
    setForm((f) => (f ? { ...f, overrides: { ...f.overrides, [ty]: { ...f.overrides[ty], [k]: v } } } : f))

  const save = async () => {
    if (!next) return
    setSaving(true)
    setErrors({})
    try {
      const saved = await saveValidationSettings(next)
      setData(saved)
      setForm(toForm(saved))
      toast.success(t("m6.set.saved"))
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorText(t, err, "m6"))
    } finally {
      setSaving(false)
    }
  }

  const err = (k: string) => allErrors[k] ? <p className="text-xs text-destructive">{allErrors[k]}</p> : null

  return (
    <SectionCard id="validation" icon={SlidersHorizontal} tone="orange" title={t("m6.set.rulesTitle")} description={t("m6.set.rulesHint")}>
        {data === undefined ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !form ? (
          <Alert><AlertDescription>{loadError ?? t("m6.set.unavailable")}</AlertDescription></Alert>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vr-reject" className="text-xs font-medium">{t("m6.set.rejectBelow")}</Label>
                <Input id="vr-reject" type="number" min={0} max={1} step={0.01} value={form.reject} disabled={readOnly}
                  onChange={(e) => patch({ reject: e.target.value })} aria-invalid={!!allErrors.auto_reject_below} />
                <p className="text-xs text-muted-foreground">{t("m6.set.rejectBelowHint")}</p>
                {err("auto_reject_below")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vr-clip" className="text-xs font-medium">{t("m6.set.clipSeconds")}</Label>
                <Input id="vr-clip" type="number" min={1} max={30} step={1} value={form.clip} disabled={readOnly}
                  onChange={(e) => patch({ clip: e.target.value })} aria-invalid={!!allErrors.clip_seconds} />
                <p className="text-xs text-muted-foreground">{t("m6.set.clipHint")}</p>
                {err("clip_seconds")}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="vr-accept-on">{t("m6.set.autoAccept")}</Label>
                <Switch id="vr-accept-on" checked={form.acceptOn} disabled={readOnly} onCheckedChange={(v) => patch({ acceptOn: v })} />
              </div>
              <p className="text-xs text-muted-foreground">{t("m6.set.autoAcceptHint")}</p>
              {form.acceptOn && (
                <div className="space-y-1">
                  <Label htmlFor="vr-accept" className="text-xs">{t("m6.set.acceptAbove")}</Label>
                  <Input id="vr-accept" type="number" min={0} max={1} step={0.01} value={form.accept} disabled={readOnly}
                    onChange={(e) => patch({ accept: e.target.value })} className="h-9 max-w-[10rem]" aria-invalid={!!allErrors.auto_accept_above} />
                  {err("auto_accept_above")}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("m6.set.overrides")}</Label>
              <p className="text-xs text-muted-foreground">{t("m6.set.overridesHint")}</p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>{t("m6.filter.type")}</TableHead>
                      <TableHead>{t("m6.set.rejectBelowShort")}</TableHead>
                      <TableHead>{t("m6.set.acceptAboveShort")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(form.overrides).map(([ty, o]) => (
                      <TableRow key={ty}>
                        <TableCell className="text-sm">
                          {L.typeLabel(ty)}
                          {err(`type_overrides.${ty}`)}
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} max={1} step={0.01} className="h-8 w-24" value={o.reject} disabled={readOnly}
                            placeholder={form.reject} onChange={(e) => patchOverride(ty, "reject", e.target.value)}
                            aria-label={`${L.typeLabel(ty)} — ${t("m6.set.rejectBelowShort")}`} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} max={1} step={0.01} className="h-8 w-24" value={o.accept} disabled={readOnly}
                            placeholder={form.acceptOn ? form.accept : "—"} onChange={(e) => patchOverride(ty, "accept", e.target.value)}
                            aria-label={`${L.typeLabel(ty)} — ${t("m6.set.acceptAboveShort")}`} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("m6.set.distinct")}</Label>
              <p className="text-xs text-muted-foreground">{t("m6.set.distinctHint")}</p>
              <div className="flex flex-wrap gap-4">
                {Array.from(new Set<string>([...DETECTION_TYPES, ...form.distinct])).map((ty) => (
                  <label key={ty} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.distinct.includes(ty)} disabled={readOnly}
                      onCheckedChange={(c) => patch({ distinct: c ? [...form.distinct, ty] : form.distinct.filter((x) => x !== ty) })} />
                    {L.typeLabel(ty)}
                  </label>
                ))}
              </div>
            </div>

            {!readOnly && (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                {dirty && <span className="mr-auto text-xs text-muted-foreground">{t("m6.set.unsaved")}</span>}
                <Button size="sm" variant="ghost" disabled={!dirty || saving} onClick={() => data && setForm(toForm(data))}>{t("m6.set.discard")}</Button>
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

// ── Public block ────────────────────────────────────────────────────────────

export function ValidationSettingsSection() {
  const { t } = useM6Labels()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  return (
    <section className="space-y-4">
      <SectionHeading title={t("m6.set.sectionTitle")} description={t("m6.set.sectionHint")} />
      <AiValidationCard readOnly={readOnly} />
      <ValidationRulesCard readOnly={readOnly} />
      <ClusterConfigLinkCard />
    </section>
  )
}
