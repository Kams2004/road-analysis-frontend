"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AuthShell, BackToSignIn } from "@/components/auth-shell"
import { PasswordInput } from "@/components/password-input"
import { checkResetToken, errorText, getAuthConfig, resetPassword } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"

function ResetForm() {
  const t = useT()
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<"checking" | "invalid" | "form" | "done">("checking")
  const [email, setEmail] = useState<string | null>(null)
  const [minLength, setMinLength] = useState(8)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getAuthConfig().then((c) => setMinLength(c.password_min_length)).catch(() => {})
    if (!token) { setState("invalid"); return }
    checkResetToken(token)
      .then((r) => { setEmail(r.email); setState(r.valid ? "form" : "invalid") })
      .catch(() => setState("invalid"))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError(t("auth.passwordsDiffer")); return }
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      setState("done")
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  if (state === "checking") {
    return (
      <AuthShell title={t("auth.resetTitle")}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("auth.checkingLink")}</p>
      </AuthShell>
    )
  }
  if (state === "invalid") {
    return (
      <AuthShell title={t("auth.resetTitle")}>
        <p className="text-sm text-destructive">{t("auth.err.invalid_reset_token")}</p>
        <Link href="/forgot-password" className="mt-4 block text-sm font-medium text-primary hover:underline">{t("auth.forgot")}</Link>
        <BackToSignIn />
      </AuthShell>
    )
  }
  if (state === "done") {
    return (
      <AuthShell title={t("auth.resetTitle")}>
        <div className="flex items-start gap-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p>{t("auth.resetDone")}</p>
        </div>
        <Button asChild className="mt-6 w-full"><Link href="/login">{t("auth.signIn")}</Link></Button>
      </AuthShell>
    )
  }
  return (
    <AuthShell title={t("auth.resetTitle")} subtitle={email ?? undefined}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new">{t("auth.newPassword")}</Label>
          <PasswordInput id="new" autoComplete="new-password" autoFocus value={password}
                         onChange={(e) => setPassword(e.target.value)} minLength={minLength} required />
          <p className="text-xs text-muted-foreground">{t("auth.passwordHint", { min: minLength })}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
          <PasswordInput id="confirm" autoComplete="new-password" value={confirm}
                         onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("auth.setPassword")}
        </Button>
      </form>
      <BackToSignIn />
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
