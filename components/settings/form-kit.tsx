"use client"

/**
 * Building blocks of the structured settings pages (Module 5 parked
 * vehicles, Module 6 hazard lifecycle …):
 *  - useSectionDraft: load one settings section, edit a draft, save only the
 *    changed top-level keys, keep the 422 per-field errors;
 *  - GroupCard: collapsible SectionCard with "Reset to defaults";
 *  - NumField / SwitchRow / ChipToggles: labelled inputs with help text,
 *    unit, default value (click to restore) and the field's error;
 *  - StickySaveBar: unsaved-changes bar with Discard / Save.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { LucideIcon } from "lucide-react"
import { ChevronDown, ChevronRight, Loader2, RotateCcw } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import type { Tone } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { errorText } from "@/lib/auth-api"
import { getSettingsSection, same, saveSettingsSection, settingsErrors } from "@/lib/settings-api"
import { useI18n, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ── Draft of one section ─────────────────────────────────────────────────────

export function useSectionDraft<T extends object>(section: string, defaults: T, opts: {
  /** Fields named in model-level error messages (attributes them to a field). */
  knownFields?: string[]
  /** Turns the changed keys into the PUT body (default: their draft values). */
  buildPatch?: (draft: T, saved: T, changed: (keyof T)[]) => Record<string, unknown>
  /** Runs before the main PUT (e.g. clearing nested maps). */
  beforeSave?: (draft: T, saved: T) => Promise<void>
} = {}) {
  const { t } = useI18n()
  const [saved, setSaved] = useState<T | null>(null)
  const [draft, setDraft] = useState<T | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoadError(null)
    return getSettingsSection<T>(section)
      .then((v) => {
        // Missing keys (older API) fall back to the defaults.
        const full = { ...defaults, ...(v ?? {}) } as T
        setSaved(full)
        setDraft(structuredClone(full))
      })
      .catch((err) => setLoadError(errorText(t, err, "account.platform")))
  }, [section]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const changed = useMemo(() => {
    if (!saved || !draft) return [] as (keyof T)[]
    return (Object.keys(draft) as (keyof T)[]).filter((k) => !same(draft[k], saved[k]))
  }, [saved, draft])

  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d))
    setErrors((e) => {
      const key = String(k)
      if (!Object.keys(e).some((f) => f === key || f.startsWith(`${key}.`) || f === "")) return e
      const n: Record<string, string> = {}
      for (const [f, m] of Object.entries(e)) if (!(f === key || f.startsWith(`${key}.`) || f === "")) n[f] = m
      return n
    })
  }, [])

  const save = async () => {
    if (!saved || !draft || !changed.length) return
    setSaving(true)
    setErrors({})
    try {
      if (opts.beforeSave) await opts.beforeSave(draft, saved)
      const body = opts.buildPatch
        ? opts.buildPatch(draft, saved, changed)
        : Object.fromEntries(changed.map((k) => [k, draft[k]]))
      const next = await saveSettingsSection<T>(section, body)
      const full = { ...defaults, ...(next ?? {}) } as T
      setSaved(full)
      setDraft(structuredClone(full))
      toast.success(t("set.saved"))
    } catch (err) {
      const fe = settingsErrors(err, opts.knownFields ?? Object.keys(defaults))
      setErrors(fe)
      toast.error(errorText(t, err, "account.platform"))
    } finally {
      setSaving(false)
    }
  }

  const discard = () => { if (saved) { setDraft(structuredClone(saved)); setErrors({}) } }

  /** Error of a field path, or of any of its children. */
  const errorOf = (path: string) =>
    errors[path] ?? Object.entries(errors).find(([f]) => f.startsWith(`${path}.`))?.[1]

  return { saved, draft, setDraft, set, changed, errors, errorOf, saving, save, discard, loadError, reload: load }
}

// ── Number validation ────────────────────────────────────────────────────────

export interface NumSpec {
  min?: number
  max?: number
  /** Bounds are exclusive (pydantic gt / lt). */
  minExclusive?: boolean
  maxExclusive?: boolean
  integer?: boolean
  nullable?: boolean
}

/** i18n key + vars of the problem with `v`, or null when valid. */
export function numProblem(v: number | null | undefined, s: NumSpec): [string, Record<string, string | number>] | null {
  if (v == null) return s.nullable ? null : ["set.err.required", {}]
  if (Number.isNaN(v)) return ["set.err.number", {}]
  if (s.integer && !Number.isInteger(v)) return ["set.err.integer", {}]
  const lo = s.min != null && (s.minExclusive ? v <= s.min : v < s.min)
  const hi = s.max != null && (s.maxExclusive ? v >= s.max : v > s.max)
  if (lo || hi) {
    if (s.min != null && s.max != null) return ["set.err.range", { min: s.min, max: s.max }]
    if (s.min != null) return [s.minExclusive ? "set.err.gt" : "set.err.ge", { n: s.min }]
    return [s.maxExclusive ? "set.err.lt" : "set.err.le", { n: s.max! }]
  }
  return null
}

// ── Widgets ──────────────────────────────────────────────────────────────────

const fmtNum = (v: number | null | undefined, locale: string) =>
  v == null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: 4 })

export function NumField({
  id, label, help, unit, value, onChange, def, spec = {}, step, error, readOnly, placeholder, className, compact,
}: {
  id: string
  label: React.ReactNode
  help?: React.ReactNode
  unit?: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  /** Default value: shown as a hint, click restores it. `undefined` = no hint. */
  def?: number | null
  spec?: NumSpec
  step?: number
  error?: string
  readOnly: boolean
  placeholder?: string
  className?: string
  compact?: boolean
}) {
  const { t, locale } = useI18n()
  const [text, setText] = useState(value == null || Number.isNaN(value) ? "" : String(value))
  // Follow external changes (load, reset, discard) without fighting typing.
  useEffect(() => {
    const parsed = text.trim() === "" ? null : Number(text)
    if (!(parsed === value || (parsed != null && value != null && Number.isNaN(parsed) && Number.isNaN(value)))) {
      setText(value == null || Number.isNaN(value) ? "" : String(value))
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const problem = numProblem(value, spec)
  const local = problem ? t(problem[0], problem[1]) : undefined
  const shown = error ?? local
  const isDefault = def === undefined || same(def, value)
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" inputMode="decimal" step={step ?? (spec.integer ? 1 : "any")}
          min={spec.min} max={spec.max} value={text} disabled={readOnly} placeholder={placeholder ?? (spec.nullable ? t("set.off") : undefined)}
          aria-invalid={!!shown}
          className={cn("h-8", compact ? "w-24" : "w-28")}
          onChange={(e) => {
            setText(e.target.value)
            const raw = e.target.value.trim()
            onChange(raw === "" ? null : Number(raw))
          }} />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
      {def !== undefined && (
        <p className="text-[11px] text-muted-foreground">
          {t("set.default")}{" "}
          {isDefault || readOnly ? (
            <span className="tabular-nums">{fmtNum(def, locale)}{def != null && unit ? ` ${unit}` : ""}</span>
          ) : (
            <button type="button" className="tabular-nums text-primary underline-offset-2 hover:underline"
              title={t("set.restoreDefault")} onClick={() => onChange(def)}>
              {fmtNum(def, locale)}{def != null && unit ? ` ${unit}` : ""}
            </button>
          )}
        </p>
      )}
      {shown && <p className="text-xs text-destructive">{shown}</p>}
    </div>
  )
}

export function SwitchRow({ id, label, help, checked, onChange, def, readOnly, error }: {
  id: string; label: React.ReactNode; help?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void
  def?: boolean; readOnly: boolean; error?: string
}) {
  const t = useT()
  return (
    <div className="space-y-1 rounded-lg border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm leading-snug">{label}</Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={readOnly} />
      </div>
      {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
      {def !== undefined && (
        <p className="text-[11px] text-muted-foreground">{t("set.default")} {def ? t("set.on") : t("set.off")}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ChipToggles({ options, value, onChange, readOnly, label }: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  readOnly: boolean
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button key={o.value} type="button" disabled={readOnly} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              readOnly && "cursor-default opacity-70")}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Small "label + help + error" wrapper for custom widgets. */
export function FieldBlock({ label, help, error, children, className }: {
  label: React.ReactNode; help?: React.ReactNode; error?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium">{label}</p>
      {children}
      {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function GroupCard({
  id, icon, tone, title, description, defaultOpen = true, onReset, isDefault, changedCount = 0, hasError, readOnly, children,
}: {
  id: string
  icon: LucideIcon
  tone: Tone
  title: React.ReactNode
  description?: React.ReactNode
  defaultOpen?: boolean
  onReset?: () => void
  /** The group already holds the default values (reset disabled). */
  isDefault?: boolean
  changedCount?: number
  hasError?: boolean
  readOnly: boolean
  children: React.ReactNode
}) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (hasError) setOpen(true) }, [hasError])
  return (
    <SectionCard id={id} icon={icon} tone={tone} title={title} description={description}
      badge={<>
        {changedCount > 0 && <Badge variant="secondary" className="text-[10px]">{t("set.unsavedN", { n: changedCount })}</Badge>}
        {hasError && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">{t("set.hasErrors")}</Badge>}
      </>}
      contentClassName={open ? undefined : "hidden"}
      actions={<>
        {onReset && !readOnly && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={isDefault} onClick={onReset}
            title={t("set.resetGroupHint")}>
            <RotateCcw className="h-3.5 w-3.5" />{t("set.resetGroup")}
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-label={open ? t("set.collapse") : t("set.expand")}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </>}>
      {children}
    </SectionCard>
  )
}

export function StickySaveBar({ changedCount, saving, onSave, onDiscard, blocked, generalError, readOnly }: {
  changedCount: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  /** Local validation problems: saving disabled. */
  blocked?: boolean
  /** Server error not tied to a field. */
  generalError?: string
  readOnly: boolean
}) {
  const t = useT()
  if (readOnly) return null
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:border lg:shadow-sm">
      {generalError && (
        <Alert variant="destructive" className="mb-2 py-2"><AlertDescription className="text-xs">{generalError}</AlertDescription></Alert>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {changedCount ? t("set.unsavedFields", { n: changedCount }) : t("set.noChanges")}
          {blocked && <span className="ml-2 text-destructive">{t("set.fixErrors")}</span>}
        </span>
        <Button size="sm" variant="ghost" disabled={!changedCount || saving} onClick={onDiscard}>{t("m6.set.discard")}</Button>
        <Button size="sm" disabled={!changedCount || saving || blocked} onClick={onSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}
