"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OtpBoxes } from "@/components/otp-boxes"
import { Label } from "@/components/ui/label"
import { errorText, mfaEnable, mfaSetup, type LoginResult } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"

/**
 * Authenticator-app enrolment: shows the QR code + manual key, then confirms
 * with a first code. Used both during a sign-in whose role requires MFA
 * (challengeToken set) and from the profile page (signed in).
 */
export function MfaEnrol({
  challengeToken,
  submitLabel,
  onDone,
  remember = true,
}: {
  challengeToken?: string
  remember?: boolean
  submitLabel: string
  onDone: (result: LoginResult) => void
}) {
  const t = useT()
  const [secret, setSecret] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    mfaSetup(challengeToken)
      .then(async (r) => {
        setSecret(r.secret)
        setQr(await QRCode.toDataURL(r.otpauth_uri, { margin: 1, width: 200 }))
      })
      .catch((e) => setError(errorText(t, e)))
  }, [challengeToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onDone(await mfaEnable(code.trim(), challengeToken, remember))
    } catch (err) {
      setError(errorText(t, err))
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex justify-center rounded-lg border border-border bg-white p-3">
        {qr ? <img src={qr} alt="QR code" width={200} height={200} /> : <Loader2 className="m-20 h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
      {secret && (
        <div className="text-xs text-muted-foreground">
          {t("auth.mfa.manualKey")}
          <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-foreground">
            {secret.replace(/(.{4})/g, "$1 ").trim()}
          </code>
        </div>
      )}
      <div className="space-y-2">
        <Label className="block text-center">{t("auth.mfa.code")}</Label>
        <OtpBoxes value={code} onChange={setCode} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6 || !secret}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
