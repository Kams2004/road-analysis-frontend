"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell, BackToSignIn } from "@/components/auth-shell"
import { CaptchaWidget, type CaptchaHandle } from "@/components/captcha-widget"
import { errorText, forgotPassword, getAuthConfig, type AuthConfig } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"

export default function ForgotPasswordPage() {
  const { t, lang } = useI18n()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const captcha = useRef<CaptchaHandle>(null)
  const onCaptcha = useCallback((tok: string | null) => setCaptchaToken(tok), [])

  useEffect(() => {
    getAuthConfig().then(setConfig).catch((e) => setError(errorText(t, e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (config?.captcha.provider !== "disabled" && !captchaToken) {
      setError(t("auth.captchaRequired"))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await forgotPassword(email.trim(), captchaToken)
      setSent(true)
    } catch (err) {
      setError(errorText(t, err))
      captcha.current?.reset()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={t("auth.forgotTitle")} subtitle={sent ? undefined : t("auth.forgotSub")}>
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p>{t("auth.linkSent")}</p>
          </div>
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input id="email" type="email" placeholder="you@example.com" className="h-11" autoComplete="email" autoFocus value={email}
                   onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {config && config.captcha.provider !== "disabled" && (
            <CaptchaWidget ref={captcha} provider={config.captcha.provider} siteKey={config.captcha.site_key}
                           onToken={onCaptcha} lang={lang} />
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !config}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("auth.sendLink")}
          </Button>
        </form>
      )}
      {!sent && <BackToSignIn />}
    </AuthShell>
  )
}
