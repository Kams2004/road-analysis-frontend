"use client"

/**
 * Settings → Platform (administrators): CAPTCHA, SMTP e-mail, maps and
 * security policy. Each card saves only its own section and only the fields
 * that changed; secrets are write-only (sent only when typed).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, KeyRound, Loader2, Lock, Mail, Map as MapIcon, Send, ShieldCheck } from "lucide-react"
import { SectionCard, SectionHeading } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PasswordInput } from "@/components/password-input"
import { useAuth } from "@/components/auth-provider"
import { invalidateMapTiles } from "@/hooks/use-map-tiles"
import {
  ApiError, errorText, getPlatformSettings, savePlatformSection, testGoogleMaps, testSmtp,
  type PlatformSettings,
} from "@/lib/auth-api"
import { useT } from "@/lib/i18n"

type Section = keyof PlatformSettings
type FieldErrors = Record<string, string>
type T = ReturnType<typeof useT>

const SCOPE = "account.platform"

/** Pull per-field messages out of a 422 invalid_settings error. */
export function fieldErrors(err: unknown): FieldErrors {
  const out: FieldErrors = {}
  if (err instanceof ApiError && Array.isArray(err.detail.errors)) {
    for (const e of err.detail.errors as { field?: string; message?: string }[]) {
      if (e.field) out[e.field.split(".").pop() as string] = e.message ?? ""
    }
  }
  return out
}

/**
 * Form state for one section: `values` mirrors the editable server fields,
 * `secrets` holds typed write-only values. save() sends the diff only.
 */
export function useSectionForm<S extends Section>(
  section: S,
  initial: PlatformSettings[S],
  secretFields: string[],
  onSaved: (next: PlatformSettings[S]) => void,
) {
  const t = useT()
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial })
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { setValues({ ...initial }) }, [initial])

  const base = initial as unknown as Record<string, unknown>
  const changed: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    if (k.endsWith("_set") || k === "configured" || k === "using_test_keys") continue
    if (v !== base[k]) changed[k] = v
  }
  for (const f of secretFields) if (secrets[f]) changed[f] = secrets[f]
  const dirty = Object.keys(changed).length > 0

  const set = (k: string, v: unknown) => {
    setValues((s) => ({ ...s, [k]: v }))
    setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }
  const setSecret = (k: string, v: string) => {
    setSecrets((s) => ({ ...s, [k]: v }))
    setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const next = await savePlatformSection(section, changed)
      setSecrets({})
      onSaved(next)
      toast.success(t(`${SCOPE}.saved`))
      return true
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      const unplaced = Object.entries(fe).filter(([k]) => !(k in values) && !secretFields.includes(k))
      toast.error(unplaced.length ? unplaced.map(([k, m]) => `${k}: ${m}`).join("; ") : errorText(t, err, SCOPE))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { values, secrets, errors, saving, dirty, set, setSecret, save }
}

export type Form = ReturnType<typeof useSectionForm>

export function Field({ id, label, error, hint, children }: {
  id?: string; label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function TextField({ form, name, label, readOnly, type = "text", mono, hint, step }: {
  form: Form; name: string; label: string; readOnly: boolean; type?: string; mono?: boolean
  hint?: React.ReactNode; step?: string
}) {
  const id = `ps-${name}`
  const v = form.values[name]
  return (
    <Field id={id} label={label} error={form.errors[name]} hint={hint}>
      <Input
        id={id}
        type={type}
        value={v === undefined || v === null ? "" : String(v)}
        step={step}
        className={mono ? "font-mono text-xs" : undefined}
        onChange={(e) => form.set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        disabled={readOnly}
        aria-invalid={!!form.errors[name]}
      />
    </Field>
  )
}

function SecretField({ form, name, label, isSet, readOnly, t }: {
  form: Form; name: string; label: string; isSet: boolean; readOnly: boolean; t: T
}) {
  const id = `ps-${name}`
  return (
    <Field id={id} label={label} error={form.errors[name]}>
      <PasswordInput
        id={id}
        autoComplete="new-password"
        value={form.secrets[name] ?? ""}
        placeholder={isSet ? t("platform.secretSet") : t("platform.secretUnset")}
        onChange={(e) => form.setSecret(name, e.target.value)}
        disabled={readOnly}
        aria-invalid={!!form.errors[name]}
      />
    </Field>
  )
}

function SelectField({ form, name, label, readOnly, options }: {
  form: Form; name: string; label: string; readOnly: boolean; options: { value: string; label: string }[]
}) {
  return (
    <Field label={label} error={form.errors[name]}>
      <Select value={String(form.values[name] ?? "")} onValueChange={(v) => form.set(name, v)} disabled={readOnly}>
        <SelectTrigger className="h-9 w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function SaveBar({ form, readOnly, t, children }: { form: Form; readOnly: boolean; t: T; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
      {children}
      {!readOnly && (
        <Button size="sm" onClick={() => form.save()} disabled={form.saving || !form.dirty}>
          {form.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.saving ? t("common.saving") : t("common.save")}
        </Button>
      )}
    </div>
  )
}

// ── Sections ────────────────────────────────────────────────────────────────

function CaptchaCard({ data, onSaved, readOnly }: {
  data: PlatformSettings["captcha"]; onSaved: (v: PlatformSettings["captcha"]) => void; readOnly: boolean
}) {
  const t = useT()
  const form = useSectionForm("captcha", data, ["secret_key"], onSaved) as unknown as Form
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{label}</a>
  )
  return (
    <SectionCard id="captcha" icon={ShieldCheck} tone="green" title={t("platform.captcha")} description={t("platform.captchaHint")}>
        {data.using_test_keys && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("platform.testKeys")}</AlertDescription>
          </Alert>
        )}
        <SelectField form={form} name="provider" label={t("platform.captchaProvider")} readOnly={readOnly} options={[
          { value: "turnstile", label: "Cloudflare Turnstile" },
          { value: "recaptcha", label: "Google reCAPTCHA" },
          { value: "hcaptcha", label: "hCaptcha" },
          { value: "disabled", label: t("platform.captchaDisabled") },
        ]} />
        {form.values.provider !== "disabled" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="site_key" label={t("platform.siteKey")} readOnly={readOnly} mono />
            <SecretField form={form} name="secret_key" label={t("platform.secretKey")} isSet={data.secret_key_set} readOnly={readOnly} t={t} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t(`${SCOPE}.getKeys`)}{" "}
          {link("https://dash.cloudflare.com/?to=/:account/turnstile", "Cloudflare Turnstile")}
          {" · "}
          {link("https://www.google.com/recaptcha/admin", "Google reCAPTCHA")}
          {" · "}
          {link("https://dashboard.hcaptcha.com/sites", "hCaptcha")}
        </p>
        <SaveBar form={form} readOnly={readOnly} t={t} />
      </SectionCard>
  )
}

function SmtpCard({ data, onSaved, readOnly }: {
  data: PlatformSettings["smtp"]; onSaved: (v: PlatformSettings["smtp"]) => void; readOnly: boolean
}) {
  const t = useT()
  const { user } = useAuth()
  const form = useSectionForm("smtp", data, ["password"], onSaved) as unknown as Form
  const [to, setTo] = useState(user?.email ?? "")
  const [testing, setTesting] = useState(false)

  useEffect(() => { if (!to && user?.email) setTo(user.email) }, [user?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendTest = async () => {
    if (form.dirty) { toast.warning(t(`${SCOPE}.saveFirst`)); return }
    setTesting(true)
    try {
      await testSmtp(to.trim())
      toast.success(t(`${SCOPE}.testSent`, { to: to.trim() }))
    } catch (err) {
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setTesting(false)
    }
  }

  return (
    <SectionCard
      id="email" icon={Mail} tone="blue" title={t("platform.email")} description={t("platform.emailHint")}
      badge={data.configured
        ? <StatusBadge tone="green">{t("platform.configured")}</StatusBadge>
        : <StatusBadge tone="slate">{t("platform.notConfigured")}</StatusBadge>}
    >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><TextField form={form} name="host" label={t("platform.host")} readOnly={readOnly} /></div>
          <TextField form={form} name="port" label={t("platform.port")} readOnly={readOnly} type="number" />
        </div>
        <SelectField form={form} name="security" label={t("platform.security")} readOnly={readOnly} options={[
          { value: "starttls", label: "STARTTLS" },
          { value: "ssl", label: "SSL/TLS" },
          { value: "none", label: t(`${SCOPE}.secNone`) },
        ]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="username" label={t("platform.username")} readOnly={readOnly} />
          <SecretField form={form} name="password" label={t("platform.smtpPassword")} isSet={data.password_set} readOnly={readOnly} t={t} />
          <TextField form={form} name="from_email" label={t("platform.fromEmail")} readOnly={readOnly} type="email" />
          <TextField form={form} name="from_name" label={t("platform.fromName")} readOnly={readOnly} />
        </div>
        <SaveBar form={form} readOnly={readOnly} t={t} />
        {!readOnly && (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="ps-test-to" className="text-xs font-medium">{t("platform.testTo")}</Label>
              <Input id="ps-test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" className="h-9" onClick={sendTest} disabled={testing || !to.trim()}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t("platform.sendTest")}
            </Button>
          </div>
        )}
      </SectionCard>
  )
}

function MapsCard({ data, onSaved, readOnly }: {
  data: PlatformSettings["maps"]; onSaved: (v: PlatformSettings["maps"]) => void; readOnly: boolean
}) {
  const t = useT()
  const form = useSectionForm("maps", data, ["google_api_key"], (v) => { invalidateMapTiles(); onSaved(v) }) as unknown as Form
  const [testing, setTesting] = useState(false)

  const test = async () => {
    if (form.dirty) { toast.warning(t(`${SCOPE}.saveFirst`)); return }
    setTesting(true)
    try {
      await testGoogleMaps()
      toast.success(t(`${SCOPE}.googleOk`))
    } catch (err) {
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setTesting(false)
    }
  }

  return (
    <SectionCard
      id="maps" icon={MapIcon} tone="teal" title={t("platform.maps")} description={t("platform.mapsHint")}
      badge={data.google_api_key_set
        ? <StatusBadge tone="green">Google · {t(`${SCOPE}.keySet`)}</StatusBadge>
        : <StatusBadge tone="slate">Google · {t(`${SCOPE}.keyUnset`)}</StatusBadge>}
    >
        <SelectField form={form} name="default_provider" label={t("platform.defaultProvider")} readOnly={readOnly} options={[
          { value: "osm", label: t("map.osm") },
          { value: "google", label: t("map.google") },
        ]} />
        <TextField form={form} name="osm_tile_url" label={t("platform.osmUrl")} readOnly={readOnly} mono />
        <div className="grid gap-4 sm:grid-cols-2">
          <SecretField form={form} name="google_api_key" label={t("platform.googleKey")} isSet={data.google_api_key_set} readOnly={readOnly} t={t} />
          <SelectField form={form} name="google_map_type" label={t("platform.googleMapType")} readOnly={readOnly} options={[
            { value: "roadmap", label: t(`${SCOPE}.typeRoadmap`) },
            { value: "satellite", label: t(`${SCOPE}.typeSatellite`) },
            { value: "terrain", label: t(`${SCOPE}.typeTerrain`) },
          ]} />
        </div>
        <SaveBar form={form} readOnly={readOnly} t={t}>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={test} disabled={testing || !data.google_api_key_set}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("platform.testGoogle")}
            </Button>
          )}
        </SaveBar>
      </SectionCard>
  )
}

function SecurityCard({ data, onSaved, readOnly }: {
  data: PlatformSettings["security"]; onSaved: (v: PlatformSettings["security"]) => void; readOnly: boolean
}) {
  const t = useT()
  const form = useSectionForm("security", data, [], onSaved) as unknown as Form
  const num = (name: string, label: string) => (
    <TextField form={form} name={name} label={label} readOnly={readOnly} type="number" />
  )
  return (
    <SectionCard id="security" icon={Lock} tone="purple" title={t("platform.securityPolicy")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num("session_hours", t("platform.sessionHours"))}
          {num("lockout_threshold", t("platform.lockoutThreshold"))}
          {num("lockout_minutes", t("platform.lockoutMinutes"))}
          {num("password_min_length", t("platform.passwordMin"))}
          {num("reset_token_minutes", t("platform.resetMinutes"))}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <Label htmlFor="ps-mfa-all" className="leading-snug">{t("platform.mfaAll")}</Label>
          <Switch
            id="ps-mfa-all"
            checked={!!form.values.mfa_required_for_all}
            onCheckedChange={(v) => form.set("mfa_required_for_all", v)}
            disabled={readOnly}
          />
        </div>
        {form.errors.mfa_required_for_all && <p className="text-xs text-destructive">{form.errors.mfa_required_for_all}</p>}
        <SaveBar form={form} readOnly={readOnly} t={t} />
      </SectionCard>
  )
}

function GoogleSigninCard({ data, onSaved, readOnly }: {
  data: PlatformSettings["google_signin"]; onSaved: (v: PlatformSettings["google_signin"]) => void; readOnly: boolean
}) {
  const t = useT()
  const form = useSectionForm("google_signin", data, [], onSaved) as unknown as Form
  return (
    <SectionCard
      id="google-signin" icon={KeyRound} tone="orange" title={t("cm.google.title")} description={t("cm.google.desc")}
      badge={data.configured
        ? <StatusBadge tone="green">{t("platform.configured")}</StatusBadge>
        : <StatusBadge tone="slate">{t("platform.notConfigured")}</StatusBadge>}
    >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <Label htmlFor="ps-google-enabled" className="leading-snug">{t("cm.google.enabled")}</Label>
          <Switch
            id="ps-google-enabled"
            checked={!!form.values.enabled}
            onCheckedChange={(v) => form.set("enabled", v)}
            disabled={readOnly}
          />
        </div>
        <TextField form={form} name="web_client_id" label={t("cm.google.web")} readOnly={readOnly} mono />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="android_client_id" label={t("cm.google.android")} readOnly={readOnly} mono />
          <TextField form={form} name="ios_client_id" label={t("cm.google.ios")} readOnly={readOnly} mono />
        </div>
        <SaveBar form={form} readOnly={readOnly} t={t} />
      </SectionCard>
  )
}

// ── Public block ────────────────────────────────────────────────────────────

/** `only` limits the cards (settings sub-pages); `heading` hides the section title. */
export function PlatformSettingsSection({ only, heading = true }: { only?: Section[]; heading?: boolean } = {}) {
  const t = useT()
  const { can } = useAuth()
  const [data, setData] = useState<PlatformSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const readOnly = !can("settings", "edit")

  useEffect(() => {
    getPlatformSettings().then(setData).catch((err) => setError(errorText(t, err, SCOPE)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = <S extends Section>(section: S) => (value: PlatformSettings[S]) =>
    setData((d) => (d ? { ...d, [section]: value } : d))
  const show = (s: Section) => !only || only.includes(s)

  return (
    <section className="space-y-4">
      {heading && <SectionHeading id="platform" title={t("platform.title")} description={t(`${SCOPE}.subtitle`)} />}
      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>{t(`${SCOPE}.readOnly`)}</AlertDescription>
        </Alert>
      )}
      {error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : !data ? (
        <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {show("captcha") && <CaptchaCard data={data.captcha} onSaved={update("captcha")} readOnly={readOnly} />}
          {show("smtp") && <SmtpCard data={data.smtp} onSaved={update("smtp")} readOnly={readOnly} />}
          {show("maps") && <MapsCard data={data.maps} onSaved={update("maps")} readOnly={readOnly} />}
          {show("security") && <SecurityCard data={data.security} onSaved={update("security")} readOnly={readOnly} />}
          {show("google_signin") && data.google_signin && (
            <GoogleSigninCard data={data.google_signin} onSaved={update("google_signin")} readOnly={readOnly} />
          )}
        </div>
      )}
    </section>
  )
}
