"use client"

/**
 * Add / edit an SFTP server (cloud sources): host, port, username, base path and
 * the password. The password is write-only: sent once over HTTPS, stored
 * encrypted by the API, never returned — the edit form only says it is saved
 * (empty field = keep it). Servers set up before read theirs from
 * infra/secrets/sftp.env through a password key (shown read-only).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { updateSftpServer, type CloudConnection, type SftpServerInput } from "@/lib/cloud-sources-api"

const S = "cs"

const blank = { name: "", host: "", port: "22", username: "", base_path: "", password: "" }

/** What the server already has (edit form): a saved password / a legacy secrets-file key. */
interface Saved { password: boolean; legacyVar: string | null }

export function SftpServerForm({ value, onChange, idPrefix = "sftp", saved }: {
  value: typeof blank
  onChange: (v: typeof blank) => void
  idPrefix?: string
  saved?: Saved
}) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  const hasSaved = !!saved?.password || !!saved?.legacyVar
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-host`}>{t(`${S}.sftp.host`)}</Label>
          <Input id={`${idPrefix}-host`} value={value.host} onChange={set("host")} placeholder="bi.camtrack.mg"
            autoComplete="off" spellCheck={false} maxLength={253} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-port`}>{t(`${S}.sftp.port`)}</Label>
          <Input id={`${idPrefix}-port`} value={value.port} onChange={set("port")} inputMode="numeric" placeholder="22" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-user`}>{t(`${S}.sftp.username`)}</Label>
        <Input id={`${idPrefix}-user`} value={value.username} onChange={set("username")} placeholder="roadusertoread"
          autoComplete="off" spellCheck={false} maxLength={64} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-base`}>{t(`${S}.sftp.basePath`)}</Label>
        <Input id={`${idPrefix}-base`} value={value.base_path} onChange={set("base_path")} className="font-mono text-xs"
          placeholder="/home/Ymane-New/ft_violations" spellCheck={false} maxLength={1024} />
        <p className="text-[11px] text-muted-foreground">{t(`${S}.sftp.basePathHint`)}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-password`}>{t(`${S}.sftp.password`)}</Label>
        <div className="relative">
          {/* Never pre-filled (the API does not return it); "new-password" keeps browsers from auto-filling it. */}
          <Input id={`${idPrefix}-password`} type={show ? "text" : "password"} value={value.password}
            onChange={set("password")} className="pr-9" autoComplete="new-password" spellCheck={false}
            autoCapitalize="off" autoCorrect="off" maxLength={1024} data-lpignore="true" data-1p-ignore=""
            placeholder={saved?.password ? t(`${S}.sftp.passwordKeep`) : saved?.legacyVar ? t(`${S}.sftp.passwordLegacy`) : ""} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={t(show ? `${S}.sftp.hidePassword` : `${S}.sftp.showPassword`)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-2 text-[11px] text-emerald-800 dark:text-emerald-300">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t(`${S}.sftp.passwordHint`)}
            {hasSaved && <> {saved?.password ? t(`${S}.sftp.passwordHintKeep`) : (
              <>{t(`${S}.sftp.passwordHintLegacy`)} <code className="rounded bg-background/70 px-1 font-mono">{saved?.legacyVar}</code></>
            )}</>}
          </span>
        </div>
      </div>
    </div>
  )
}

export function sftpFormValue(c?: CloudConnection | null): typeof blank {
  if (!c?.sftp) return { ...blank }
  return {
    name: c.name, host: c.sftp.host, port: String(c.sftp.port || 22), username: c.sftp.username,
    base_path: c.sftp.base_path ?? "", password: "",
  }
}

function savedOf(c?: CloudConnection | null): Saved | undefined {
  return c?.sftp ? { password: c.sftp.password_saved, legacyVar: c.sftp.password_var } : undefined
}

/** Client-side checks (the API validates again); null when OK. `saved`: edit of a server that has one. */
export function sftpFormError(t: (k: string) => string, v: typeof blank, saved?: Saved): string | null {
  const port = Number(v.port)
  if (!v.host.trim()) return t(`${S}.sftp.err.host`)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return t(`${S}.sftp.err.port`)
  if (!v.username.trim()) return t(`${S}.sftp.err.username`)
  if (v.base_path.trim() && !v.base_path.trim().startsWith("/")) return t(`${S}.sftp.err.basePath`)
  if (!v.password && !saved?.password && !saved?.legacyVar) return t(`${S}.sftp.err.password`)
  return null
}

export function sftpPayload(v: typeof blank): SftpServerInput {
  return {
    name: v.name.trim() || null, host: v.host.trim(), port: Number(v.port) || 22, username: v.username.trim(),
    base_path: v.base_path.trim() || null, ...(v.password ? { password: v.password } : {}),
  }
}

/** Edit dialog of an existing server. */
export function SftpServerDialog({ connection, onClose, onSaved }: {
  connection: CloudConnection | null
  onClose: () => void
  onSaved: (c: CloudConnection) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(blank)
  const [saving, setSaving] = useState(false)

  // Opened → the server's profile; closed → cleared (the typed password is not kept in memory).
  useEffect(() => { setValue(connection ? sftpFormValue(connection) : { ...blank }) }, [connection])

  const save = async () => {
    if (!connection) return
    const err = sftpFormError(t, value, savedOf(connection))
    if (err) { toast.error(err); return }
    setSaving(true)
    try {
      const p = sftpPayload(value)
      const saved = await updateSftpServer(connection.id, { ...p, name: p.name ?? connection.name, base_path: p.base_path ?? "" })
      toast.success(t(`${S}.sftp.saved`))
      onSaved(saved)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!connection} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${S}.sftp.editTitle`)}</DialogTitle>
          <DialogDescription>{t(`${S}.sftp.editDesc`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sftp-edit-name">{t(`${S}.connName`)}</Label>
            <Input id="sftp-edit-name" value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} maxLength={120} />
          </div>
          <SftpServerForm value={value} onChange={setValue} idPrefix="sftp-edit" saved={savedOf(connection)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { blank as SFTP_BLANK }
