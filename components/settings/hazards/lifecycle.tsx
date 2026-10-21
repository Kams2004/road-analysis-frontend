"use client"

/**
 * Settings → Module 6 · Hazards → Hazard lifecycle (settings section
 * `hazard_lifecycle`, docs/spec-module6-hazard-lifecycle.md §2–3):
 *  - global rules: timing, valid "not seen" video passes, driver votes,
 *    recurring spots, heavy vehicles;
 *  - one policy per hazard type (+ the default policy) with partial
 *    per-subtype overrides.
 * The API merges `policies` per type / field and `subtype_overrides` per
 * subtype (null removes one): the save sends the changed types only; a
 * subtype whose override lost fields is cleared first, then re-sent.
 */
import { useMemo, useState } from "react"
import { CalendarClock, Clock, Plus, Repeat, ShieldAlert, Trash2, Truck, Video, Vote } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ChipToggles, FieldBlock, GroupCard, LoadingBlock, NumField, StickySaveBar, SwitchRow, numProblem, useSectionDraft,
  type NumSpec,
} from "@/components/settings/form-kit"
import { useM6Labels } from "@/components/m6-shared"
import { DETECTION_TYPES, SUBTYPES } from "@/lib/module6-api"
import {
  ALERT_PRIORITIES, DEFAULT_POLICIES, HAZARD_LIFECYCLE_DEFAULTS as D, POLICY_FIELDS, POLICY_FIELD_KIND, TYPE_POLICY_DEFAULTS,
  VEHICLE_CLASSES, same, saveSettingsSection, type HazardLifecycleSettings as S, type PolicyField, type TypePolicy,
} from "@/lib/settings-api"
import { cn } from "@/lib/utils"

type Key = keyof S
const DEFAULT_KEY = "__default__"

const POLICY_SPEC: Record<PolicyField, NumSpec | null> = {
  expiry_hours: { min: 0, minExclusive: true, max: 8760, nullable: true },
  heavy_vehicle_expiry_hours: { min: 0, minExclusive: true, max: 8760, nullable: true },
  reopen_window_hours: { min: 0, minExclusive: true, max: 8760, nullable: true },
  absences_to_resolve: { min: 1, max: 50, integer: true },
  not_there_to_resolve: { min: 1, max: 100, integer: true },
  absence_resolution: null, require_same_direction: null, pass_daylight_only: null, votes_enabled: null,
  still_there_extends: null, reopen_on_sighting: null, recurring_enabled: null, show_to_drivers: null, alert_priority: null,
  auto_confirm_resightings: null,
}

const GLOBAL_NUM: Partial<Record<Key, NumSpec & { unit?: string }>> = {
  expiry_check_minutes: { min: 1, max: 1440, integer: true, unit: "min" },
  pass_max_distance_m: { min: 0, minExclusive: true, max: 1000, unit: "m" },
  pass_max_speed_kmh: { min: 0, minExclusive: true, max: 300, unit: "kmh" },
  pass_heading_tolerance_deg: { min: 0, max: 180, unit: "deg" },
  pass_approach_min_m: { min: 1, max: 200, unit: "m" },
  vote_max_distance_m: { min: 10, max: 50000, integer: true, unit: "m" },
  vote_cooldown_minutes: { min: 0, max: 10080, integer: true, unit: "min" },
  recurring_min_occurrences: { min: 2, max: 1000, integer: true, unit: "hazards" },
  recurring_window_days: { min: 1, max: 3650, integer: true, unit: "days" },
  recurring_radius_m: { min: 0, minExclusive: true, max: 5000, nullable: true, unit: "m" },
}

interface Group { id: string; icon: typeof Clock; tone: "blue" | "green" | "purple" | "orange" | "red" | "teal" | "slate"; keys: Key[] }
const GROUPS: Group[] = [
  { id: "timing", icon: Clock, tone: "blue", keys: ["expiry_check_minutes", "timezone", "daylight_hours", "osd_time_is_local"] },
  { id: "passes", icon: Video, tone: "purple", keys: ["pass_max_distance_m", "pass_max_speed_kmh", "pass_heading_tolerance_deg", "pass_require_recording_time", "pass_require_approach", "pass_approach_min_m", "type_models"] },
  { id: "votes", icon: Vote, tone: "orange", keys: ["vote_max_distance_m", "vote_cooldown_minutes"] },
  { id: "recurring", icon: Repeat, tone: "teal", keys: ["recurring_min_occurrences", "recurring_window_days", "recurring_radius_m"] },
  { id: "heavy", icon: Truck, tone: "slate", keys: ["heavy_vehicle_classes"] },
]

const policyOf = (s: S, type: string): TypePolicy =>
  type === DEFAULT_KEY ? s.default_policy : s.policies[type]

function policyProblems(p: Partial<TypePolicy>, prefix: string, t: (k: string, v?: Record<string, string | number>) => string, out: Record<string, string>) {
  for (const f of POLICY_FIELDS) {
    const spec = POLICY_SPEC[f]
    if (!spec || !(f in p)) continue
    const pr = numProblem(p[f] as number | null, spec)
    if (pr) out[`${prefix}.${f}`] = t(pr[0], pr[1])
  }
}

/** PUT body of one policy: its fields + per-subtype overrides (null = removed). */
function policyPatch(next: TypePolicy, prev: TypePolicy | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of POLICY_FIELDS) out[f] = next[f]
  const subs: Record<string, unknown> = {}
  const before = prev?.subtype_overrides ?? {}
  for (const [sub, o] of Object.entries(next.subtype_overrides ?? {})) if (!same(o, before[sub])) subs[sub] = o
  for (const sub of Object.keys(before)) if (!(sub in (next.subtype_overrides ?? {}))) subs[sub] = null
  if (Object.keys(subs).length) out.subtype_overrides = subs
  return out
}

/** Subtypes whose override lost a field: the merge cannot drop it, so clear them first. */
function shrunkSubtypes(next: TypePolicy, prev: TypePolicy | undefined): string[] {
  const before = prev?.subtype_overrides ?? {}
  return Object.entries(next.subtype_overrides ?? {})
    .filter(([sub, o]) => before[sub] && Object.keys(before[sub]).some((k) => !(k in o)))
    .map(([sub]) => sub)
}

export function HazardLifecycleSettingsForm({ readOnly }: { readOnly: boolean }) {
  const L = useM6Labels()
  const { t } = L
  const form = useSectionDraft<S>("hazard_lifecycle", D, {
    buildPatch: (draft, saved, changed) => {
      const body: Record<string, unknown> = {}
      for (const k of changed) {
        if (k === "policies") {
          const pol: Record<string, unknown> = {}
          for (const [ty, p] of Object.entries(draft.policies)) if (!same(p, saved.policies[ty])) pol[ty] = policyPatch(p, saved.policies[ty])
          body.policies = pol
        } else if (k === "default_policy") {
          body.default_policy = policyPatch(draft.default_policy, saved.default_policy)
        } else body[k] = draft[k]
      }
      return body
    },
    beforeSave: async (draft, saved) => {
      const pol: Record<string, unknown> = {}
      for (const [ty, p] of Object.entries(draft.policies)) {
        const subs = shrunkSubtypes(p, saved.policies[ty])
        if (subs.length) pol[ty] = { subtype_overrides: Object.fromEntries(subs.map((s) => [s, null])) }
      }
      const defSubs = shrunkSubtypes(draft.default_policy, saved.default_policy)
      const body: Record<string, unknown> = {}
      if (Object.keys(pol).length) body.policies = pol
      if (defSubs.length) body.default_policy = { subtype_overrides: Object.fromEntries(defSubs.map((s) => [s, null])) }
      if (Object.keys(body).length) await saveSettingsSection("hazard_lifecycle", body)
    },
  })
  const { draft: d, set, changed, saving, save, discard, loadError } = form
  const [addType, setAddType] = useState("")

  const local = useMemo(() => {
    const out: Record<string, string> = {}
    if (!d) return out
    for (const [k, spec] of Object.entries(GLOBAL_NUM)) {
      const p = numProblem(d[k as Key] as number | null, spec!)
      if (p) out[k] = t(p[0], p[1])
    }
    const [a, b] = d.daylight_hours ?? []
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > 24 || a >= b) out.daylight_hours = t("set.hl.err.daylight")
    if (!d.timezone?.trim()) out.timezone = t("set.err.required")
    const all: [string, TypePolicy][] = [[DEFAULT_KEY, d.default_policy], ...Object.entries(d.policies)]
    for (const [ty, p] of all) {
      const prefix = ty === DEFAULT_KEY ? "default_policy" : `policies.${ty}`
      policyProblems(p, prefix, t, out)
      for (const [sub, o] of Object.entries(p.subtype_overrides ?? {})) policyProblems(o, `${prefix}.subtype_overrides.${sub}`, t, out)
    }
    return out
  }, [d, t])

  if (loadError) return <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
  if (!d) return <LoadingBlock />

  const err = (path: string) => form.errors[path] ?? local[path]
  const anyErr = (prefix: string) => Object.keys({ ...form.errors, ...local }).some((f) => f === prefix || f.startsWith(`${prefix}.`))
  const unit = (u?: string) => (u ? t(`set.unit.${u}`) : undefined)
  const num = (k: Key) => {
    const spec = GLOBAL_NUM[k]!
    return (
      <NumField key={k} id={`hl-${k}`} label={t(`set.hl.${k}`)} help={t(`set.hl.${k}.help`)} unit={unit(spec.unit)}
        value={d[k] as number | null} def={D[k] as number | null} spec={spec} readOnly={readOnly} error={err(k)}
        onChange={(v) => set(k, v as never)} />
    )
  }
  const card = (g: Group, body: React.ReactNode) => (
    <GroupCard key={g.id} id={`hl-${g.id}`} icon={g.icon} tone={g.tone} title={t(`set.hl.g.${g.id}`)} description={t(`set.hl.g.${g.id}.desc`)}
      defaultOpen onReset={() => g.keys.forEach((k) => set(k, structuredClone(D[k]) as never))} isDefault={g.keys.every((k) => same(d[k], D[k]))}
      changedCount={g.keys.filter((k) => changed.includes(k)).length} hasError={g.keys.some((k) => anyErr(k))} readOnly={readOnly}>
      {body}
    </GroupCard>
  )
  const G = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<string, Group>
  const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"

  const setPolicy = (type: string, p: TypePolicy) => {
    if (type === DEFAULT_KEY) set("default_policy", p)
    else set("policies", { ...d.policies, [type]: p })
  }
  const policyTypes = Object.keys(d.policies)
  const missingTypes = DETECTION_TYPES.filter((ty) => !(ty in d.policies))
  const hours = (h: number | null | undefined) => (h == null ? t("set.hl.never") : t("set.hl.hoursN", { n: h }))
  const typeName = (ty: string) => (ty === DEFAULT_KEY ? t("set.hl.defaultPolicy") : L.typeLabel(ty))

  return (
    <div className="space-y-4">
      {card(G.timing, (
        <div className={grid}>
          {num("expiry_check_minutes")}
          <FieldBlock label={t("set.hl.timezone")} help={t("set.hl.timezone.help")} error={err("timezone")}>
            <Input value={d.timezone} onChange={(e) => set("timezone", e.target.value)} disabled={readOnly} className="h-8 w-48 font-mono text-xs"
              aria-label={t("set.hl.timezone")} aria-invalid={!!err("timezone")} />
            <p className="text-[11px] text-muted-foreground">{t("set.default")} <span className="font-mono">{D.timezone}</span></p>
          </FieldBlock>
          <FieldBlock label={t("set.hl.daylight_hours")} help={t("set.hl.daylight_hours.help")} error={err("daylight_hours")}>
            <div className="flex items-center gap-2 text-xs">
              {[0, 1].map((i) => (
                <Input key={i} type="number" min={0} max={24} step={1} className="h-8 w-20" disabled={readOnly}
                  aria-label={t(i === 0 ? "set.hl.from" : "set.hl.to")}
                  value={Number.isFinite(d.daylight_hours?.[i]) ? d.daylight_hours[i] : ""}
                  onChange={(e) => {
                    const next = [...(d.daylight_hours ?? [6, 18])]
                    next[i] = e.target.value === "" ? NaN : Number(e.target.value)
                    set("daylight_hours", next)
                  }} />
              )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <span key="sep">→</span>, el] : [el]), [])}
              <span className="text-muted-foreground">{t("set.unit.h")}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("set.default")} 6 → 18</p>
          </FieldBlock>
          <SwitchRow id="hl-osd-local" label={t("set.hl.osd_time_is_local")} help={t("set.hl.osd_time_is_local.help")} def={D.osd_time_is_local}
            checked={d.osd_time_is_local} onChange={(v) => set("osd_time_is_local", v)} readOnly={readOnly} />
        </div>
      ))}

      {card(G.passes, (
        <>
          <div className={grid}>
            {num("pass_max_distance_m")}{num("pass_max_speed_kmh")}{num("pass_heading_tolerance_deg")}
            <SwitchRow id="hl-pass-rec" label={t("set.hl.pass_require_recording_time")} help={t("set.hl.pass_require_recording_time.help")}
              def={D.pass_require_recording_time} checked={d.pass_require_recording_time} readOnly={readOnly}
              onChange={(v) => set("pass_require_recording_time", v)} />
            <SwitchRow id="hl-pass-approach" label={t("set.hl.pass_require_approach")} help={t("set.hl.pass_require_approach.help")}
              def={D.pass_require_approach} checked={d.pass_require_approach ?? D.pass_require_approach} readOnly={readOnly}
              onChange={(v) => set("pass_require_approach", v)} />
            {(d.pass_require_approach ?? D.pass_require_approach) && num("pass_approach_min_m")}
          </div>
          <FieldBlock label={t("set.hl.type_models")} help={t("set.hl.type_models.help")} error={err("type_models")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from(new Set([...DETECTION_TYPES, ...Object.keys(d.type_models ?? {})])).map((ty) => (
                <label key={ty} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0 truncate">{L.typeLabel(ty)}</span>
                  <Input className="h-8 font-mono text-xs" disabled={readOnly} placeholder={(D.type_models[ty] ?? []).join(", ")}
                    value={(d.type_models?.[ty] ?? []).join(", ")}
                    onChange={(e) => {
                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      const next = { ...d.type_models }
                      if (list.length) next[ty] = list
                      else delete next[ty]
                      set("type_models", next)
                    }} />
                </label>
              ))}
            </div>
          </FieldBlock>
        </>
      ))}

      {card(G.votes, <div className={grid}>{num("vote_max_distance_m")}{num("vote_cooldown_minutes")}</div>)}
      {card(G.recurring, <div className={grid}>{num("recurring_min_occurrences")}{num("recurring_window_days")}{num("recurring_radius_m")}</div>)}
      {card(G.heavy, (
        <FieldBlock label={t("set.hl.heavy_vehicle_classes")} help={t("set.hl.heavy_vehicle_classes.help")} error={err("heavy_vehicle_classes")}>
          <ChipToggles readOnly={readOnly} value={d.heavy_vehicle_classes} onChange={(v) => set("heavy_vehicle_classes", v)}
            options={VEHICLE_CLASSES.map((c) => ({ value: c, label: t(`pv.class.${c}`) }))} />
        </FieldBlock>
      ))}

      {/* Per-type policies */}
      <GroupCard id="policies" icon={ShieldAlert} tone="red" title={t("set.hl.g.policies")} description={t("set.hl.g.policies.desc")}
        readOnly={readOnly} changedCount={(["policies", "default_policy"] as Key[]).filter((k) => changed.includes(k)).length}
        hasError={anyErr("policies") || anyErr("default_policy")}
        onReset={() => { set("policies", structuredClone(D.policies)); set("default_policy", structuredClone(D.default_policy)) }}
        isDefault={same(d.policies, D.policies) && same(d.default_policy, D.default_policy)}>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("m6.filter.type")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.expiry")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.heavy")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.absence")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.votes")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.flags")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.priority")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("set.hl.col.subtypes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...policyTypes, DEFAULT_KEY].map((ty) => {
                const p = policyOf(d, ty)
                const flags = (["still_there_extends", "reopen_on_sighting", "recurring_enabled", "require_same_direction", "pass_daylight_only"] as const)
                  .filter((f) => p[f])
                return (
                  <TableRow key={ty} className={cn("cursor-pointer", anyErr(ty === DEFAULT_KEY ? "default_policy" : `policies.${ty}`) && "bg-destructive/5")}
                    onClick={() => document.getElementById(`policy-${ty === DEFAULT_KEY ? "default" : ty}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    <TableCell className="py-1.5 text-sm font-medium">{typeName(ty)}</TableCell>
                    <TableCell className="py-1.5 text-xs">{hours(p.expiry_hours)}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p.heavy_vehicle_expiry_hours == null ? "—" : hours(p.heavy_vehicle_expiry_hours)}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p.absence_resolution ? t("set.hl.afterPasses", { n: p.absences_to_resolve }) : t("set.off")}</TableCell>
                    <TableCell className="py-1.5 text-xs">{p.votes_enabled ? t("set.hl.afterVotes", { n: p.not_there_to_resolve }) : t("set.off")}</TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => <Badge key={f} variant="outline" className="text-[10px]">{t(`set.hl.flag.${f}`)}</Badge>)}
                        {p.auto_confirm_resightings === false && <Badge variant="outline" className="text-[10px]">{t("set.hl.flag.no_auto_confirm")}</Badge>}
                        {!p.show_to_drivers && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400">{t("set.hl.flag.hidden")}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs">{t(`set.hl.prio.${p.alert_priority}`)}</TableCell>
                    <TableCell className="py-1.5 text-xs">{Object.keys(p.subtype_overrides ?? {}).map((s) => L.subtypeLabel(ty, s) || s).join(", ") || "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("set.hl.policiesNote")}</p>

        {[...policyTypes, DEFAULT_KEY].map((ty) => (
          <PolicyEditor key={ty} type={ty} name={typeName(ty)} policy={policyOf(d, ty)} readOnly={readOnly}
            defaults={ty === DEFAULT_KEY ? D.default_policy : DEFAULT_POLICIES[ty]}
            prefix={ty === DEFAULT_KEY ? "default_policy" : `policies.${ty}`} err={err} hasError={anyErr(ty === DEFAULT_KEY ? "default_policy" : `policies.${ty}`)}
            onChange={(p) => setPolicy(ty, p)} />
        ))}

        {!readOnly && missingTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="h-8 w-56" aria-label={t("set.hl.addPolicy")}><SelectValue placeholder={t("set.hl.addPolicyPh")} /></SelectTrigger>
              <SelectContent>{missingTypes.map((ty) => <SelectItem key={ty} value={ty}>{L.typeLabel(ty)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!addType}
              onClick={() => { set("policies", { ...d.policies, [addType]: structuredClone({ ...d.default_policy, subtype_overrides: {} }) }); setAddType("") }}>
              <Plus className="h-3.5 w-3.5" />{t("set.hl.addPolicy")}
            </Button>
          </div>
        )}
      </GroupCard>

      <StickySaveBar readOnly={readOnly} changedCount={changed.length} saving={saving} onSave={save} onDiscard={discard}
        blocked={Object.keys(local).length > 0} generalError={form.errors[""]} />
    </div>
  )
}

// ── One policy ───────────────────────────────────────────────────────────────

function PolicyEditor({ type, name, policy, defaults, prefix, readOnly, err, hasError, onChange }: {
  type: string
  name: string
  policy: TypePolicy
  defaults?: TypePolicy
  prefix: string
  readOnly: boolean
  err: (path: string) => string | undefined
  hasError: boolean
  onChange: (p: TypePolicy) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const [newSub, setNewSub] = useState("")
  const p = { ...TYPE_POLICY_DEFAULTS, ...policy }
  const def = defaults ? { ...TYPE_POLICY_DEFAULTS, ...defaults } : undefined
  const subs = p.subtype_overrides ?? {}
  const anchor = `policy-${type === DEFAULT_KEY ? "default" : type}`
  const subtypeSuggestions = (SUBTYPES[type] ?? []).filter((s) => !(s in subs))

  const setSubs = (next: TypePolicy["subtype_overrides"]) => onChange({ ...p, subtype_overrides: next })

  return (
    <details id={anchor} className="scroll-mt-32 rounded-lg border target:ring-2 target:ring-primary/60" open={hasError || undefined}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-sm font-medium">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />{name}
        {def && !same(p, def) && <Badge variant="secondary" className="text-[10px]">{t("set.hl.customised")}</Badge>}
        {hasError && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">{t("set.hasErrors")}</Badge>}
        {!readOnly && def && !same(p, def) && (
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={(e) => { e.preventDefault(); onChange(structuredClone(def)) }}>
            {t("set.resetGroup")}
          </Button>
        )}
      </summary>
      <div className="space-y-4 border-t px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {POLICY_FIELDS.map((f) => (
            <PolicyFieldInput key={f} id={`${anchor}-${f}`} field={f} value={p[f]} def={def?.[f]} readOnly={readOnly}
              error={err(`${prefix}.${f}`)} onChange={(v) => onChange({ ...p, [f]: v })} />
          ))}
        </div>

        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">{t("set.hl.subtypeOverrides")}</p>
            <p className="text-[11px] text-muted-foreground">{t("set.hl.subtypeOverridesHelp")}</p>
          </div>
          {err(`${prefix}.subtype_overrides`) && <p className="text-xs text-destructive">{err(`${prefix}.subtype_overrides`)}</p>}
          {Object.keys(subs).length === 0 && <p className="text-xs text-muted-foreground">{t("set.hl.noOverrides")}</p>}
          {Object.entries(subs).map(([sub, o]) => {
            const unused = POLICY_FIELDS.filter((f) => !(f in o))
            return (
              <div key={sub} className="space-y-2 rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{L.subtypeLabel(type, sub) || sub}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>
                  </span>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive"
                      onClick={() => { const n = { ...subs }; delete n[sub]; setSubs(n) }}>
                      <Trash2 className="h-3.5 w-3.5" />{t("set.remove")}
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(Object.keys(o) as PolicyField[]).filter((f) => POLICY_FIELDS.includes(f)).map((f) => (
                    <div key={f} className="relative">
                      <PolicyFieldInput id={`${anchor}-${sub}-${f}`} field={f} value={o[f] as TypePolicy[PolicyField]} readOnly={readOnly}
                        inherited={p[f]} error={err(`${prefix}.subtype_overrides.${sub}.${f}`)}
                        onChange={(v) => setSubs({ ...subs, [sub]: { ...o, [f]: v } })} />
                      {!readOnly && (
                        <button type="button" className="absolute right-0 top-0 text-muted-foreground hover:text-destructive"
                          aria-label={t("set.remove")} title={t("set.hl.removeOverride")}
                          onClick={() => { const n = { ...o }; delete n[f]; setSubs({ ...subs, [sub]: n }) }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && unused.length > 0 && (
                  <Select value="" onValueChange={(f) => setSubs({ ...subs, [sub]: { ...o, [f]: p[f as PolicyField] } })}>
                    <SelectTrigger className="h-7 w-56 text-xs" aria-label={t("set.hl.addField")}><SelectValue placeholder={t("set.hl.addField")} /></SelectTrigger>
                    <SelectContent>{unused.map((f) => <SelectItem key={f} value={f}>{t(`set.hl.p.${f}`)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            )
          })}
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Input list={`${anchor}-subs`} value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={t("set.hl.subtypePh")}
                className="h-8 w-48 font-mono text-xs" aria-label={t("set.hl.subtype")} />
              <datalist id={`${anchor}-subs`}>{subtypeSuggestions.map((s) => <option key={s} value={s}>{L.subtypeLabel(type, s)}</option>)}</datalist>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!newSub.trim() || newSub.trim() in subs}
                onClick={() => { setSubs({ ...subs, [newSub.trim()]: {} }); setNewSub("") }}>
                <Plus className="h-3.5 w-3.5" />{t("set.hl.addSubtype")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </details>
  )
}

function PolicyFieldInput({ id, field, value, def, inherited, readOnly, error, onChange }: {
  id: string
  field: PolicyField
  value: TypePolicy[PolicyField] | undefined
  def?: TypePolicy[PolicyField]
  /** Value of the type policy (override editors). */
  inherited?: TypePolicy[PolicyField]
  readOnly: boolean
  error?: string
  onChange: (v: TypePolicy[PolicyField]) => void
}) {
  const { t } = useM6Labels()
  const kind = POLICY_FIELD_KIND[field]
  const label = t(`set.hl.p.${field}`)
  const help = t(`set.hl.p.${field}.help`)
  if (kind === "bool") {
    return (
      <div className="space-y-1 rounded-lg border px-3 py-2">
        <div className="flex items-center justify-between gap-2 pr-4">
          <label htmlFor={id} className="text-xs font-medium leading-snug">{label}</label>
          <Switch id={id} checked={!!value} onCheckedChange={(v) => onChange(v)} disabled={readOnly} />
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>
        {def !== undefined && <p className="text-[11px] text-muted-foreground">{t("set.default")} {def ? t("set.on") : t("set.off")}</p>}
        {inherited !== undefined && <p className="text-[11px] text-muted-foreground">{t("set.hl.typeValue")} {inherited ? t("set.on") : t("set.off")}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
  if (kind === "priority") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-medium">{label}</label>
        <Select value={String(value ?? "normal")} onValueChange={(v) => onChange(v as TypePolicy["alert_priority"])} disabled={readOnly}>
          <SelectTrigger id={id} className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{ALERT_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`set.hl.prio.${p}`)}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>
        {def !== undefined && <p className="text-[11px] text-muted-foreground">{t("set.default")} {t(`set.hl.prio.${def}`)}</p>}
        {inherited !== undefined && <p className="text-[11px] text-muted-foreground">{t("set.hl.typeValue")} {t(`set.hl.prio.${inherited}`)}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
  const spec = POLICY_SPEC[field]!
  return (
    <div>
      <NumField id={id} label={label} help={help} unit={kind === "hours" ? t("set.unit.h") : undefined}
        value={value as number | null} def={def as number | null | undefined} spec={spec} readOnly={readOnly} error={error}
        placeholder={kind === "hours" ? t("set.hl.never") : undefined} onChange={(v) => onChange(v)} compact />
      {inherited !== undefined && (
        <p className="text-[11px] text-muted-foreground">{t("set.hl.typeValue")} {inherited == null ? t("set.hl.never") : String(inherited)}</p>
      )}
    </div>
  )
}
