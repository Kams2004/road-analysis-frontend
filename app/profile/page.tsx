"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { KeyRound, Loader2, Settings2, ShieldCheck, ShieldOff, UserCircle } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/components/auth-provider"
import { PasswordInput } from "@/components/password-input"
import { MfaEnrol } from "@/components/mfa-enrol"
import { invalidateMapTiles } from "@/hooks/use-map-tiles"
import { changePassword, disableMfa, errorText, updateMe, type MapProviderPref } from "@/lib/auth-api"
import { LANGS, translate, useI18n, type Lang } from "@/lib/i18n"

export default function ProfilePage() {
  const { t } = useI18n()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("profile.title")} description={t("profile.subtitle")} />
          {!user ? (
            <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
              <DetailsCard />
              <PreferencesCard />
              <PasswordCard />
              <MfaCard />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function DetailsCard() {
  const { t, locale } = useI18n()
  const { user, setUser } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setFullName(user?.full_name ?? "")
    setPhone(user?.phone ?? "")
    setWhatsapp(user?.whatsapp ?? "")
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null
  const dirty = fullName !== user.full_name || phone !== (user.phone ?? "") || whatsapp !== (user.whatsapp ?? "")

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      setUser(await updateMe({ full_name: fullName.trim(), phone: phone.trim() || null, whatsapp: whatsapp.trim() || null }))
      toast.success(t("profile.updated"))
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={UserCircle} tone="blue" title={t("profile.details")}>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-email" className="text-xs font-medium">{t("common.email")}</Label>
            <Input id="p-email" value={user.email} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-name" className="text-xs font-medium">{t("profile.fullName")}</Label>
            <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={200} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-phone" className="text-xs font-medium">{t("profile.phone")}</Label>
              <Input id="p-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-wa" className="text-xs font-medium">{t("profile.whatsapp")}</Label>
              <Input id="p-wa" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("profile.roles")}</Label>
            <div className="flex flex-wrap gap-2">
              {user.roles.length ? (
                user.roles.map((r) => <Badge key={r.id} variant="secondary">{r.name}</Badge>)
              ) : (
                <span className="text-sm text-muted-foreground">{t("account.noRoles")}</span>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("profile.lastLogin")}:{" "}
            {user.last_login_at ? new Date(user.last_login_at).toLocaleString(locale) : t("common.never")}
          </p>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !dirty || !fullName.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
    </SectionCard>
  )
}

function PreferencesCard() {
  const { t, setLang } = useI18n()
  const { user, setUser } = useAuth()
  const [busy, setBusy] = useState<"language" | "map" | null>(null)
  if (!user) return null

  const changeLanguage = async (value: string) => {
    const next = value as Lang
    setLang(next)
    setBusy("language")
    try {
      setUser(await updateMe({ language: next }))
      toast.success(translate(next, "account.languageSaved"))
    } catch (err) {
      setLang(user.language)
      toast.error(errorText(t, err))
    } finally {
      setBusy(null)
    }
  }

  const changeMap = async (value: string) => {
    setBusy("map")
    try {
      setUser(await updateMe({ map_provider: value as MapProviderPref }))
      invalidateMapTiles()
      toast.success(t("account.mapSaved"))
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SectionCard icon={Settings2} tone="teal" title={t("profile.preferences")}>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t("profile.language")}</Label>
          <Select value={user.language} onValueChange={changeLanguage} disabled={busy !== null}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => <SelectItem key={l} value={l}>{t(`lang.${l}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t("profile.mapProvider")}</Label>
          <Select value={user.map_provider} onValueChange={changeMap} disabled={busy !== null}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["default", "osm", "google"] as const).map((p) => (
                <SelectItem key={p} value={p}>{t(`map.${p}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("profile.mapProviderHint")}</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </SectionCard>
  )
}

function PasswordCard() {
  const { t } = useI18n()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next !== confirm) { setError(t("auth.passwordsDiffer")); return }
    setBusy(true)
    try {
      await changePassword(current, next)
      toast.success(t("profile.passwordChanged"))
      setCurrent(""); setNext(""); setConfirm("")
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard icon={KeyRound} tone="orange" title={t("profile.changePassword")} description={t("profile.security")}>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current" className="text-xs font-medium">{t("profile.currentPassword")}</Label>
            <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new" className="text-xs font-medium">{t("auth.newPassword")}</Label>
            <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm" className="text-xs font-medium">{t("auth.confirmPassword")}</Label>
            <PasswordInput id="pw-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("profile.changePassword")}
            </Button>
          </div>
        </form>
    </SectionCard>
  )
}

function MfaCard() {
  const { t } = useI18n()
  const { user, refresh } = useAuth()
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const openDisable = () => { setPassword(""); setCode(""); setError(null); setDisableOpen(true) }

  const submitDisable = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await disableMfa(password, code.trim())
      toast.success(t("profile.mfaDisabled"))
      setDisableOpen(false)
      await refresh()
    } catch (err) {
      setError(errorText(t, err))
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      icon={user.mfa_enabled ? ShieldCheck : ShieldOff}
      tone={user.mfa_enabled ? "green" : "slate"}
      title={t("profile.mfa")}
      description={t("profile.security")}
    >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={user.mfa_enabled ? "green" : "slate"}>
            {user.mfa_enabled ? t("account.mfaStatusOn") : t("account.mfaStatusOff")}
          </StatusBadge>
          {user.mfa_required && <Badge variant="secondary">{t("profile.mfaRequired")}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{user.mfa_enabled ? t("profile.mfaOn") : t("profile.mfaOff")}</p>
        <Separator />
        {user.mfa_enabled ? (
          user.mfa_required ? (
            <p className="text-xs text-muted-foreground">{t("account.mfaRequiredHint")}</p>
          ) : (
            <Button size="sm" variant="outline" onClick={openDisable}>{t("profile.mfaDisable")}</Button>
          )
        ) : (
          <Button size="sm" onClick={() => setEnrolOpen(true)}>{t("profile.mfaEnable")}</Button>
        )}

      <Dialog open={enrolOpen} onOpenChange={setEnrolOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("profile.mfaEnable")}</DialogTitle>
            <DialogDescription>{t("profile.mfaScan")}</DialogDescription>
          </DialogHeader>
          {enrolOpen && (
            <MfaEnrol
              submitLabel={t("account.mfaActivate")}
              onDone={async () => {
                setEnrolOpen(false)
                toast.success(t("profile.mfaEnabled"))
                await refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitDisable} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("account.mfaDisableTitle")}</DialogTitle>
              <DialogDescription>{t("account.mfaDisableHint")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-off-pw">{t("auth.password")}</Label>
              <PasswordInput id="mfa-off-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-off-code">{t("auth.mfa.code")}</Label>
              <Input
                id="mfa-off-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono tracking-[0.4em]"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" variant="destructive" disabled={busy || !password || code.length !== 6}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("profile.mfaDisable")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
