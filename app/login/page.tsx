"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell, BackToSignIn } from "@/components/auth-shell"
import { CaptchaWidget, type CaptchaHandle } from "@/components/captcha-widget"
import { MfaEnrol } from "@/components/mfa-enrol"
import { OtpBoxes } from "@/components/otp-boxes"
import { PasswordInput } from "@/components/password-input"
import { ApiError, errorText, getAuthConfig, login, mfaVerify, type AuthConfig, type LoginResult } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"

/**
 * Sign-in flow, one screen per step:
 *   credentials → security check (CAPTCHA) → authenticator code
 *                                          ↘ authenticator enrolment (role requires MFA)
 */
type Step =
  | { kind: "credentials" }
  | { kind: "captcha" }
  | { kind: "mfa"; token: string }
  | { kind: "mfa_setup"; token: string }

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{children}</p>
}

function LoginFlow() {
  const { t, lang } = useI18n()
  const params = useSearchParams()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [step, setStep] = useState<Step>({ kind: "credentials" })
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [code, setCode] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const captcha = useRef<CaptchaHandle>(null)
  const onCaptcha = useCallback((tok: string | null) => setCaptchaToken(tok), [])
  const captchaEnabled = !!config && config.captcha.provider !== "disabled"

  useEffect(() => {
    getAuthConfig().then(setConfig).catch((e) => setError(errorText(t, e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (result: LoginResult) => {
    if (result.status === "ok") {
      // Only same-site relative targets, never an open redirect.
      const next = params.get("next")
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
    } else if (result.challenge_token) {
      setCode("")
      setError(null)
      setStep({ kind: result.status === "mfa_required" ? "mfa" : "mfa_setup", token: result.challenge_token })
    }
  }

  const backToCredentials = (message: string | null = null) => {
    setStep({ kind: "credentials" })
    setCaptchaToken(null)
    setCode("")
    setError(message)
  }

  const signIn = async (token: string | null) => {
    setBusy(true)
    setError(null)
    try {
      finish(await login(identifier.trim(), password, token, remember))
    } catch (err) {
      const message = errorText(t, err)
      const code = err instanceof ApiError ? err.detail.code : undefined
      if (code === "captcha_failed" || code === "captcha_unavailable") {
        // Stay on the security check with a fresh challenge.
        setError(message)
        captcha.current?.reset()
      } else {
        if (code === "invalid_credentials") setPassword("")
        backToCredentials(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return
    if (captchaEnabled) {
      setError(null)
      setCaptchaToken(null)
      setStep({ kind: "captcha" })
    } else {
      signIn(null)
    }
  }

  const submitCaptcha = (e: React.FormEvent) => {
    e.preventDefault()
    if (!captchaToken) { setError(t("auth.captchaRequired")); return }
    signIn(captchaToken)
  }

  const verifyCode = async (value = code) => {
    if (step.kind !== "mfa" || value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      finish(await mfaVerify(step.token, value, remember))
    } catch (err) {
      const c = err instanceof ApiError ? err.detail.code : undefined
      if (c === "challenge_expired" || c === "account_locked") backToCredentials(errorText(t, err))
      else { setError(errorText(t, err)); setCode("") }
    } finally {
      setBusy(false)
    }
  }

  if (step.kind === "captcha") {
    return (
      <AuthShell title={t("auth.captchaTitle")} subtitle={t("auth.captchaPrompt")}>
        <form onSubmit={submitCaptcha} className="space-y-5">
          <div className="flex justify-center rounded-xl border border-border bg-muted/30 p-4">
            {config && captchaEnabled && (
              <CaptchaWidget
                ref={captcha}
                provider={config.captcha.provider as "turnstile" | "recaptcha" | "hcaptcha"}
                siteKey={config.captcha.site_key}
                onToken={onCaptcha}
                lang={lang}
              />
            )}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !captchaToken}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? t("auth.signingIn") : t("auth.continue")}
          </Button>
        </form>
        <BackToSignIn onClick={() => backToCredentials()} />
      </AuthShell>
    )
  }

  if (step.kind === "mfa") {
    return (
      <AuthShell title={t("auth.mfa.title")} subtitle={t("auth.mfa.prompt")}>
        <form onSubmit={(e) => { e.preventDefault(); verifyCode() }} className="space-y-5">
          <OtpBoxes value={code} onChange={setCode} autoFocus onComplete={(v) => verifyCode(v)} />
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("auth.mfa.verify")}
          </Button>
        </form>
        <BackToSignIn onClick={() => backToCredentials()} />
      </AuthShell>
    )
  }

  if (step.kind === "mfa_setup") {
    return (
      <AuthShell title={t("auth.mfa.setupTitle")} subtitle={t("auth.mfa.setupPrompt")}>
        <MfaEnrol challengeToken={step.token} remember={remember} submitLabel={t("auth.mfa.activate")} onDone={finish} />
        <BackToSignIn onClick={() => backToCredentials()} />
      </AuthShell>
    )
  }

  return (
    <AuthShell split title={t("auth.welcomeBack")} subtitle={t("auth.welcomeSub")}>
      <form onSubmit={submitCredentials} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="identifier">{t("auth.identifier")}</Label>
          <Input
            id="identifier"
            autoFocus
            autoComplete="username"
            placeholder="you@example.com"
            className="h-11"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            {t("auth.rememberMe")}
          </label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t("auth.forgot")}
          </Link>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !config}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  )
}
