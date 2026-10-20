"use client"

/**
 * Settings → Platform, Module 7 cards:
 *  - Processing (settings section `processing`, RRAP-07-009/013/014):
 *    concurrency, attempts, frame sampling defaults, media retention.
 *  - Cloud storage (section `cloud`): OAuth client credentials for Google
 *    Drive / OneDrive (secrets write-only) + the redirect URI to register.
 * The drive connections themselves (connect, browse, import, watched folder)
 * are an input source: /cloud-sources (components/cloud-sources/*).
 * Settings need settings:edit.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Cloud, Copy, Cpu, KeyRound, Loader2, Lock } from "lucide-react"
import { SectionCard, SectionHeading } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PasswordInput } from "@/components/password-input"
import { useAuth } from "@/components/auth-provider"
import { ApiError, errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import {
  BACKEND_MODELS, DEFAULT_PROCESSING, JOB_SOURCES, cloudRedirectUri, getModule7Settings, saveCloudSettings,
  saveProcessingSettings, type CloudSettings, type ProcessingSettings,
} from "@/lib/module7-api"

const SCOPE = "m7.settings"
type FieldErrors = Record<string, string>

function fieldErrors(err: unknown): FieldErrors {
  const out: FieldErrors = {}
  if (err instanceof ApiError && Array.isArray(err.detail.errors)) {
    for (const e of err.detail.errors as { field?: string; message?: string }[]) {
      if (e.field) out[e.field.replace(/^body\./, "").split(".").slice(-2).join(".")] = e.message ?? ""
    }
  }
  return out
}

const errFor = (errors: FieldErrors, key: string) =>
  errors[key] ?? errors[key.split(".").pop() as string]

function NumField({ id, label, value, onChange, min, max, disabled, error, hint, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; min: number; max?: number
  disabled: boolean; error?: string; hint?: string; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={!!error} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── Processing ──────────────────────────────────────────────────────────────

interface ProcForm {
  max_concurrent_jobs: string
  max_attempts: string
  frame_skip_default: string
  retain_failed_hours: string
  cloud_import_concurrency: string
  by_source: Record<string, string>
  by_model: Record<string, string>
}

const toProcForm = (p: ProcessingSettings): ProcForm => ({
  max_concurrent_jobs: String(p.max_concurrent_jobs),
  max_attempts: String(p.max_attempts),
  frame_skip_default: String(p.frame_skip_default),
  retain_failed_hours: String(p.retain_failed_hours),
  cloud_import_concurrency: String(p.cloud_import_concurrency ?? 2),
  by_source: Object.fromEntries(JOB_SOURCES.map((s) => [s, p.frame_skip_by_source?.[s] != null ? String(p.frame_skip_by_source[s]) : ""])),
  by_model: Object.fromEntries(
    Array.from(new Set<string>([...BACKEND_MODELS, ...Object.keys(p.frame_skip_by_model ?? {})]))
      .map((m) => [m, p.frame_skip_by_model?.[m] != null ? String(p.frame_skip_by_model[m]) : ""]),
  ),
})

function ProcessingCard({ data, onSaved, readOnly }: {
  data: ProcessingSettings; onSaved: (p: ProcessingSettings) => void; readOnly: boolean
}) {
  const t = useT()
  const [form, setForm] = useState<ProcForm>(() => toProcForm(data))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(toProcForm(data)) }, [data])

  const setTop = (k: keyof Omit<ProcForm, "by_source" | "by_model">, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }
  const setMap = (k: "by_source" | "by_model", key: string, v: string) => {
    setForm((f) => ({ ...f, [k]: { ...f[k], [key]: v } }))
    setErrors((e) => { const n = { ...e }; delete n[key]; delete n[`${k === "by_source" ? "frame_skip_by_source" : "frame_skip_by_model"}.${key}`]; return n })
  }

  const build = (): { body: Partial<ProcessingSettings>; errors: FieldErrors } => {
    const e: FieldErrors = {}
    const int = (key: string, v: string, min: number, max: number) => {
      const n = Number(v)
      if (v.trim() === "" || !Number.isInteger(n) || n < min || n > max) {
        e[key] = t(`${SCOPE}.err.range`, { min, max })
        return NaN
      }
      return n
    }
    const next: ProcessingSettings = {
      max_concurrent_jobs: int("max_concurrent_jobs", form.max_concurrent_jobs, 1, 32),
      max_attempts: int("max_attempts", form.max_attempts, 1, 10),
      frame_skip_default: int("frame_skip_default", form.frame_skip_default, 1, 60),
      retain_failed_hours: int("retain_failed_hours", form.retain_failed_hours, 1, 8760),
      cloud_import_concurrency: int("cloud_import_concurrency", form.cloud_import_concurrency, 1, 16),
      frame_skip_by_source: {},
      frame_skip_by_model: {},
    }
    for (const [s, v] of Object.entries(form.by_source)) {
      if (v.trim() !== "") next.frame_skip_by_source[s] = int(s, v, 1, 60)
    }
    for (const [m, v] of Object.entries(form.by_model)) {
      if (v.trim() !== "") next.frame_skip_by_model[m] = int(m, v, 1, 60)
    }
    const body: Partial<ProcessingSettings> = {}
    const base = data as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(next)) {
      if (JSON.stringify(v) !== JSON.stringify(base[k] ?? (typeof v === "object" ? {} : undefined))) {
        (body as Record<string, unknown>)[k] = v
      }
    }
    return { body, errors: e }
  }

  const { body } = build()
  const dirty = Object.keys(body).length > 0

  const save = async () => {
    const { body, errors: e } = build()
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const next = await saveProcessingSettings(body)
      onSaved({ ...data, ...next })
      toast.success(t(`${SCOPE}.saved`))
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard id="processing" icon={Cpu} tone="blue" title={t(`${SCOPE}.processing`)} description={t(`${SCOPE}.processingDesc`)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField id="pr-conc" label={t(`${SCOPE}.maxConcurrent`)} hint={t(`${SCOPE}.maxConcurrentHint`)}
            value={form.max_concurrent_jobs} onChange={(v) => setTop("max_concurrent_jobs", v)} min={1} max={32}
            disabled={readOnly} error={errFor(errors, "max_concurrent_jobs")} />
          <NumField id="pr-att" label={t(`${SCOPE}.maxAttempts`)} hint={t(`${SCOPE}.maxAttemptsHint`)}
            value={form.max_attempts} onChange={(v) => setTop("max_attempts", v)} min={1} max={10}
            disabled={readOnly} error={errFor(errors, "max_attempts")} />
          <NumField id="pr-skip" label={t(`${SCOPE}.frameSkipDefault`)} hint={t(`${SCOPE}.frameSkipDefaultHint`)}
            value={form.frame_skip_default} onChange={(v) => setTop("frame_skip_default", v)} min={1} max={60}
            disabled={readOnly} error={errFor(errors, "frame_skip_default")} />
          <NumField id="pr-ret" label={t(`${SCOPE}.retainHours`)} hint={t(`${SCOPE}.retainHoursHint`)}
            value={form.retain_failed_hours} onChange={(v) => setTop("retain_failed_hours", v)} min={1}
            disabled={readOnly} error={errFor(errors, "retain_failed_hours")} />
          <NumField id="pr-cloud-conc" label={t("cs.set.importConcurrency")} hint={t("cs.set.importConcurrencyHint")}
            value={form.cloud_import_concurrency} onChange={(v) => setTop("cloud_import_concurrency", v)} min={1} max={16}
            disabled={readOnly} error={errFor(errors, "cloud_import_concurrency")} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t(`${SCOPE}.bySource`)}</p>
          <p className="text-xs text-muted-foreground">{t(`${SCOPE}.bySourceHint`)}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.keys(form.by_source).map((s) => (
              <NumField key={s} id={`pr-src-${s}`} label={t(`m7.jobs.source.${s}`)} value={form.by_source[s]}
                placeholder={form.frame_skip_default} onChange={(v) => setMap("by_source", s, v)} min={1} max={60}
                disabled={readOnly} error={errFor(errors, `frame_skip_by_source.${s}`) ?? errors[s]} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t(`${SCOPE}.byModel`)}</p>
          <p className="text-xs text-muted-foreground">{t(`${SCOPE}.byModelHint`)}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(form.by_model).map((m) => {
              const k = `m7.model.${m}`
              const label = t(k) === k ? m : t(k)
              return (
                <NumField key={m} id={`pr-mod-${m}`} label={label} value={form.by_model[m]} placeholder="1"
                  onChange={(v) => setMap("by_model", m, v)} min={1} max={60}
                  disabled={readOnly} error={errFor(errors, `frame_skip_by_model.${m}`) ?? errors[m]} />
              )
            })}
          </div>
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        )}
    </SectionCard>
  )
}

// ── Cloud storage credentials ──────────────────────────────────────────────

const CLOUD_TEXT = ["google_client_id", "microsoft_client_id", "microsoft_tenant", "sync_interval_minutes"] as const
const CLOUD_SECRETS = ["google_client_secret", "microsoft_client_secret"] as const

function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error(t("common.error")) }
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor="cl-redirect" className="text-xs font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input id="cl-redirect" readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={copy}>
          <Copy className="h-4 w-4" />{copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
    </div>
  )
}

function CloudStorageCard({ data, onSaved, readOnly }: {
  data: CloudSettings; onSaved: (c: CloudSettings) => void; readOnly: boolean
}) {
  const t = useT()
  const [values, setValues] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [redirect, setRedirect] = useState("")

  useEffect(() => { setRedirect(cloudRedirectUri()) }, [])
  useEffect(() => {
    setValues(Object.fromEntries(CLOUD_TEXT.map((k) => [k, data[k] == null ? "" : String(data[k])])))
  }, [data])

  const changed: Record<string, unknown> = {}
  for (const k of CLOUD_TEXT) {
    const orig = data[k] == null ? "" : String(data[k])
    if ((values[k] ?? "") !== orig) changed[k] = k === "sync_interval_minutes" ? Number(values[k]) : values[k]
  }
  for (const k of CLOUD_SECRETS) if (secrets[k]) changed[k] = secrets[k]
  const dirty = Object.keys(changed).length > 0

  const save = async () => {
    const e: FieldErrors = {}
    if ("sync_interval_minutes" in changed) {
      const n = changed.sync_interval_minutes as number
      if (!Number.isInteger(n) || n < 1 || n > 1440) e.sync_interval_minutes = t(`${SCOPE}.err.range`, { min: 1, max: 1440 })
    }
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const next = await saveCloudSettings(changed)
      setSecrets({})
      onSaved({ ...data, ...next })
      toast.success(t(`${SCOPE}.saved`))
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setSaving(false)
    }
  }

  const text = (k: (typeof CLOUD_TEXT)[number], label: string, extra?: { type?: string; hint?: string; mono?: boolean }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`cl-${k}`} className="text-xs font-medium">{label}</Label>
      <Input id={`cl-${k}`} type={extra?.type ?? "text"} value={values[k] ?? ""} disabled={readOnly}
        className={extra?.mono ? "font-mono text-xs" : undefined} aria-invalid={!!errFor(errors, k)}
        onChange={(e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => { const n = { ...x }; delete n[k]; return n }) }} />
      {extra?.hint && <p className="text-xs text-muted-foreground">{extra.hint}</p>}
      {errFor(errors, k) && <p className="text-xs text-destructive">{errFor(errors, k)}</p>}
    </div>
  )
  const secret = (k: (typeof CLOUD_SECRETS)[number], label: string) => {
    const isSet = !!data[`${k}_set`]
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`cl-${k}`} className="text-xs font-medium">{label}</Label>
        <PasswordInput id={`cl-${k}`} autoComplete="new-password" value={secrets[k] ?? ""} disabled={readOnly}
          placeholder={isSet ? t("platform.secretSet") : t("platform.secretUnset")}
          onChange={(e) => setSecrets((s) => ({ ...s, [k]: e.target.value }))} aria-invalid={!!errFor(errors, k)} />
        {errFor(errors, k) && <p className="text-xs text-destructive">{errFor(errors, k)}</p>}
      </div>
    )
  }

  return (
    <SectionCard id="cloud" icon={KeyRound} tone="purple" title={t(`${SCOPE}.cloud`)} description={t(`${SCOPE}.cloudDesc`)}>
        <CopyField value={redirect} label={t(`${SCOPE}.redirectUri`)} />
        <p className="-mt-2 text-xs text-muted-foreground">{t(`${SCOPE}.redirectHint`)}</p>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("m7.jobs.source.google_drive")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {text("google_client_id", t(`${SCOPE}.clientId`), { mono: true })}
            {secret("google_client_secret", t(`${SCOPE}.clientSecret`))}
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("m7.jobs.source.onedrive")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {text("microsoft_client_id", t(`${SCOPE}.clientId`), { mono: true })}
            {secret("microsoft_client_secret", t(`${SCOPE}.clientSecret`))}
            {text("microsoft_tenant", t(`${SCOPE}.tenant`), { hint: t(`${SCOPE}.tenantHint`) })}
          </div>
        </div>
        <div className="sm:max-w-xs">
          {text("sync_interval_minutes", t(`${SCOPE}.syncInterval`), { type: "number", hint: t(`${SCOPE}.syncIntervalHint`) })}
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        )}
    </SectionCard>
  )
}

// ── Cloud sources (moved) ──────────────────────────────────────────────────

/** Drive connections are an input source now: pointer to /cloud-sources. */
function CloudSourcesLinkCard() {
  const t = useT()
  return (
    <SectionCard id="cloud-sources" icon={Cloud} tone="teal" title={t("cs.set.movedTitle")} description={t("cs.set.movedDesc")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("cs.set.movedBody")}</p>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/cloud-sources">{t("cs.set.open")}<ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>
    </SectionCard>
  )
}

// ── Public block ────────────────────────────────────────────────────────────

export function ProcessingSettingsSection({ heading = true }: { heading?: boolean } = {}) {
  const t = useT()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  const canSeeSources = can("jobs", "view")
  const [processing, setProcessing] = useState<ProcessingSettings | null>(null)
  const [cloud, setCloud] = useState<CloudSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getModule7Settings()
      .then(({ processing, cloud }) => {
        setProcessing(processing ? { ...DEFAULT_PROCESSING, ...processing } : null)
        setCloud(cloud)
      })
      .catch((err) => setError(errorText(t, err, SCOPE)))
      .finally(() => setLoaded(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-4">
      {heading && <SectionHeading title={t(`${SCOPE}.title`)} description={t(`${SCOPE}.subtitle`)} />}
      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>{t(`${SCOPE}.readOnly`)}</AlertDescription>
        </Alert>
      )}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!loaded ? (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {processing
            ? <ProcessingCard data={processing} onSaved={setProcessing} readOnly={readOnly} />
            : !error && <Alert><AlertDescription>{t(`${SCOPE}.unavailable`)}</AlertDescription></Alert>}
          {cloud && <CloudStorageCard data={cloud} onSaved={setCloud} readOnly={readOnly} />}
          {canSeeSources && <CloudSourcesLinkCard />}
        </div>
      )}
    </section>
  )
}
