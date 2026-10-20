"use client"

/**
 * Settings → Community reports & mobile app, and Collision prevention.
 *
 * Community reports (signalements) are validated by drivers' votes cast near
 * the report — a mechanism kept separate from AI detections, which go
 * through AI confidence/severity routing and human review (section
 * "Validation rules"). Each card saves only its own section, only the
 * changed fields (PUT /platform-settings/{section}).
 */
import { useEffect, useState } from "react"
import { Car, Loader2, Lock, Smartphone, Users } from "lucide-react"
import { SectionCard, SectionHeading } from "@/components/section-card"
import { Field, SaveBar, TextField, useSectionForm, type Form } from "@/components/platform-settings"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/components/auth-provider"
import {
  errorText, getPlatformSettings,
  type CollisionLevel, type CollisionLevelName, type CollisionSettings, type CommunitySettings, type MobileSettings,
} from "@/lib/auth-api"
import { useT } from "@/lib/i18n"

const REPORT_TYPES = [
  "police", "embouteillage", "accident", "voie_bloquee", "vehicule_panne", "animaux", "mauvais_temps",
  "route_glissante", "obstacle", "danger", "inondation", "route_fermee", "eboulement", "travaux",
  "nid_de_poule", "dos_d_ane", "vehicule_dangereux", "probleme_de_carte", "prix_carburant",
  "assistance_route", "autre", "debogage",
]
const LEVELS: CollisionLevelName[] = ["CRITICAL", "HIGH_WARNING", "WARNING", "MONITOR"]
const SCENARIOS = ["head_on", "crossing", "same_direction"] as const

/** "" → null, otherwise a number (for nullable numeric cells). */
const numOrNull = (raw: string) => (raw.trim() === "" ? null : Number(raw))

function NumField({ form, scope, name, readOnly, step }: {
  form: Form; scope: string; name: string; readOnly: boolean; step?: string
}) {
  const t = useT()
  const hintKey = `${scope}.${name}Hint`
  const hint = t(hintKey)
  return (
    <TextField form={form} name={name} label={t(`${scope}.${name}`)} readOnly={readOnly} type="number"
               step={step} hint={hint === hintKey ? undefined : hint} />
  )
}

function SwitchRow({ form, name, label, hint, readOnly }: {
  form: Form; name: string; label: string; hint?: string; readOnly: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div>
        <Label htmlFor={`cs-${name}`} className="leading-snug">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={`cs-${name}`} checked={!!form.values[name]} onCheckedChange={(v) => form.set(name, v)} disabled={readOnly} />
    </div>
  )
}

// ── Community reporting & votes ─────────────────────────────────────────────

function CommunityCard({ data, onSaved, readOnly }: {
  data: CommunitySettings; onSaved: (v: CommunitySettings) => void; readOnly: boolean
}) {
  const t = useT()
  const S = "cm.community"
  const form = useSectionForm("community", data, [], onSaved) as unknown as Form
  const expiry = (form.values.expiry_hours_by_type ?? {}) as Record<string, number>
  const typeLabel = (type: string) => { const k = `pmap.sig.type.${type}`; const s = t(k); return s === k ? type.replaceAll("_", " ") : s }
  const setExpiry = (type: string, raw: string) => {
    const next = { ...expiry }
    const v = numOrNull(raw)
    if (v === null) delete next[type]
    else next[type] = v
    form.set("expiry_hours_by_type", next)
  }
  return (
    <SectionCard id="community" className="xl:col-span-2" icon={Users} tone="green"
                 title={t(`${S}.title`)} description={t(`${S}.desc`)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumField form={form} scope={S} name="vote_max_distance_m" readOnly={readOnly} />
        <NumField form={form} scope={S} name="hide_after_absent_votes" readOnly={readOnly} />
        <NumField form={form} scope={S} name="keep_visible_present_votes" readOnly={readOnly} />
        <NumField form={form} scope={S} name="confirm_extends_minutes" readOnly={readOnly} />
        <NumField form={form} scope={S} name="ignore_threshold" readOnly={readOnly} />
        <NumField form={form} scope={S} name="ignore_window_minutes" readOnly={readOnly} />
        <div className="sm:col-span-2">
          <SwitchRow form={form} name="hide_when_ignored" label={t(`${S}.hide_when_ignored`)}
                     hint={t(`${S}.hide_when_ignoredHint`)} readOnly={readOnly} />
        </div>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <NumField form={form} scope={S} name="default_expiry_hours" readOnly={readOnly} step="0.25" />
        </div>
        <Field label={t(`${S}.expiryTitle`)} hint={t(`${S}.expiryHint`)} error={form.errors.expiry_hours_by_type}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {REPORT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-xs capitalize" title={type}>{typeLabel(type)}</span>
                <Input
                  type="number" step="0.25" min={0.25}
                  className="h-7 w-16 px-1.5 text-right text-xs"
                  value={expiry[type] ?? ""}
                  placeholder={String(form.values.default_expiry_hours ?? "")}
                  onChange={(e) => setExpiry(type, e.target.value)}
                  disabled={readOnly}
                  aria-label={`${typeLabel(type)} (h)`}
                />
              </label>
            ))}
          </div>
        </Field>
      </div>
      <SaveBar form={form} readOnly={readOnly} t={t} />
    </SectionCard>
  )
}

// ── Mobile app distances ────────────────────────────────────────────────────

function MobileCard({ data, onSaved, readOnly }: {
  data: MobileSettings; onSaved: (v: MobileSettings) => void; readOnly: boolean
}) {
  const t = useT()
  const S = "cm.mobile"
  const form = useSectionForm("mobile", data, [], onSaved) as unknown as Form
  return (
    <SectionCard id="mobile" icon={Smartphone} tone="blue" title={t(`${S}.title`)} description={t(`${S}.desc`)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {["visibility_radius_m", "approach_alert_m", "vote_prompt_m", "route_corridor_m", "alert_cooldown_s", "eta_max_speed_kmh"].map((n) => (
          <NumField key={n} form={form} scope={S} name={n} readOnly={readOnly} />
        ))}
        <NumField form={form} scope={S} name="eta_factor" step="0.05" readOnly={readOnly} />
      </div>
      <SaveBar form={form} readOnly={readOnly} t={t} />
    </SectionCard>
  )
}

// ── Collision prevention thresholds ─────────────────────────────────────────

function CollisionCard({ data, onSaved, readOnly }: {
  data: CollisionSettings; onSaved: (v: CollisionSettings) => void; readOnly: boolean
}) {
  const t = useT()
  const S = "cm.collision"
  const form = useSectionForm("collision", data, [], onSaved) as unknown as Form
  const levels = form.values.levels as Record<CollisionLevelName, CollisionLevel>
  const multipliers = form.values.scenario_multipliers as Record<string, number>
  const setLevel = (lvl: CollisionLevelName, key: keyof CollisionLevel, raw: string) =>
    form.set("levels", { ...levels, [lvl]: { ...levels[lvl], [key]: numOrNull(raw) } })
  const cell = (lvl: CollisionLevelName, key: keyof CollisionLevel) => (
    <Input
      type="number" step="0.5" min={0}
      className="h-8 w-full min-w-16 text-right text-xs"
      value={levels?.[lvl]?.[key] ?? ""}
      placeholder={key === "max_distance_m" ? "" : t("cm.common.none")}
      onChange={(e) => setLevel(lvl, key, e.target.value)}
      disabled={readOnly}
      aria-label={`${t(`${S}.lvl.${lvl}`)} — ${t(`${S}.${key}`)}`}
    />
  )
  return (
    <SectionCard id="collision" className="xl:col-span-2" icon={Car} tone="red"
                 title={t(`${S}.title`)} description={t(`${S}.desc`)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumField form={form} scope={S} name="candidate_radius_m" readOnly={readOnly} />
        <NumField form={form} scope={S} name="fresh_after_s" readOnly={readOnly} step="0.5" />
        <NumField form={form} scope={S} name="stale_after_s" readOnly={readOnly} step="0.5" />
        <NumField form={form} scope={S} name="min_confidence_to_report" readOnly={readOnly} step="0.05" />
        <NumField form={form} scope={S} name="segment_trust_confidence" readOnly={readOnly} step="0.05" />
      </div>
      <Field label={t(`${S}.gates`)} hint={t(`${S}.gatesHint`)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumField form={form} scope={S} name="min_closing_speed_mps" readOnly={readOnly} step="0.1" />
          <NumField form={form} scope={S} name="max_horizon_s" readOnly={readOnly} step="1" />
          <NumField form={form} scope={S} name="road_link_margin_m" readOnly={readOnly} step="0.5" />
          <NumField form={form} scope={S} name="unrelated_monitor_distance_m" readOnly={readOnly} step="1" />
          <NumField form={form} scope={S} name="lateral_margin_m" readOnly={readOnly} step="0.1" />
          <NumField form={form} scope={S} name="lateral_max_accuracy_m" readOnly={readOnly} step="1" />
          <NumField form={form} scope={S} name="deescalate_after_s" readOnly={readOnly} step="0.5" />
          <NumField form={form} scope={S} name="resolve_after_s" readOnly={readOnly} step="0.5" />
        </div>
      </Field>
      <Field label={t(`${S}.levels`)} hint={t(`${S}.levelsHint`)} error={form.errors.levels}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t(`${S}.level`)}</th>
                <th className="px-3 py-2 text-right font-medium">{t(`${S}.max_distance_m`)}</th>
                <th className="px-3 py-2 text-right font-medium">{t(`${S}.max_ttc_s`)}</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((lvl) => (
                <tr key={lvl} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{t(`${S}.lvl.${lvl}`)}</td>
                  <td className="px-3 py-1.5">{cell(lvl, "max_distance_m")}</td>
                  <td className="px-3 py-1.5">{cell(lvl, "max_ttc_s")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Field>
      <Field label={t(`${S}.multipliers`)} hint={t(`${S}.multipliersHint`)} error={form.errors.scenario_multipliers}>
        <div className="grid gap-3 sm:grid-cols-3">
          {SCENARIOS.map((sc) => (
            <label key={sc} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <span className="flex-1 text-xs">{t(`${S}.sc.${sc}`)}</span>
              <Input
                type="number" step="0.05" min={0.25} max={4}
                className="h-7 w-20 text-right text-xs"
                value={multipliers?.[sc] ?? ""}
                onChange={(e) => form.set("scenario_multipliers", { ...multipliers, [sc]: Number(e.target.value) })}
                disabled={readOnly}
                aria-label={t(`${S}.sc.${sc}`)}
              />
            </label>
          ))}
        </div>
      </Field>
      <SaveBar form={form} readOnly={readOnly} t={t} />
    </SectionCard>
  )
}

// ── Public blocks ───────────────────────────────────────────────────────────

type Data = { community: CommunitySettings; mobile: MobileSettings; collision: CollisionSettings }

function useCommunityData() {
  const t = useT()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getPlatformSettings()
      .then((d) => setData({ community: d.community, mobile: d.mobile, collision: d.collision }))
      .catch((err) => setError(errorText(t, err, "account.platform")))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const update = <K extends keyof Data>(k: K) => (v: Data[K]) => setData((d) => (d ? { ...d, [k]: v } : d))
  return { data, error, update }
}

/** `only` limits the cards (settings sub-pages); `heading` hides the section title. */
export function CommunitySettingsSection({ only, heading = true }: { only?: (keyof Data)[]; heading?: boolean } = {}) {
  const t = useT()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  const { data, error, update } = useCommunityData()
  const show = (k: keyof Data) => !only || only.includes(k)
  return (
    <section className="space-y-4">
      {heading && <SectionHeading id="community-reports" title={t("cm.section.title")} description={t("cm.section.desc")} />}
      {readOnly && (
        <Alert><Lock className="h-4 w-4" /><AlertDescription>{t("account.platform.readOnly")}</AlertDescription></Alert>
      )}
      {error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : !data ? (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {show("community") && data.community && <CommunityCard data={data.community} onSaved={update("community")} readOnly={readOnly} />}
          {show("mobile") && data.mobile && <MobileCard data={data.mobile} onSaved={update("mobile")} readOnly={readOnly} />}
          {show("collision") && data.collision && <CollisionCard data={data.collision} onSaved={update("collision")} readOnly={readOnly} />}
        </div>
      )}
    </section>
  )
}
