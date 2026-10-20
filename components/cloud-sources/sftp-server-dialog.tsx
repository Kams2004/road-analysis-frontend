"use client"

/**
 * Add / edit an SFTP server (cloud sources). Host, port, username, base path
 * and the *password key* only: the password itself goes in the secrets file
 * infra/secrets/sftp.env as SFTP_PASSWORD_<KEY>=… — never in this form.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { updateSftpServer, type CloudConnection, type SftpServerInput } from "@/lib/cloud-sources-api"

const S = "cs"

const blank = { name: "", host: "", port: "22", username: "", base_path: "", password_key: "" }

/** The env-var suffix the API expects: letters, digits, _ (upper case). */
export const toPasswordKey = (v: string) => v.trim().replace(/[\s\-.]+/g, "_").toUpperCase()

export function SftpServerForm({ value, onChange, idPrefix = "sftp" }: {
  value: typeof blank
  onChange: (v: typeof blank) => void
  idPrefix?: string
}) {
  const { t } = useI18n()
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  const key = toPasswordKey(value.password_key) || "<KEY>"
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
        <Label htmlFor={`${idPrefix}-key`}>{t(`${S}.sftp.passwordKey`)}</Label>
        <Input id={`${idPrefix}-key`} value={value.password_key} onChange={set("password_key")} placeholder="CAMTRACK"
          className="font-mono uppercase" autoComplete="off" spellCheck={false} maxLength={64} />
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t(`${S}.sftp.passwordHintA`)}{" "}
            <code className="rounded bg-background/70 px-1 font-mono">infra/secrets/sftp.env</code>{" "}
            {t(`${S}.sftp.passwordHintB`)}{" "}
            <code className="rounded bg-background/70 px-1 font-mono">SFTP_PASSWORD_{key}=…</code>{" "}
            {t(`${S}.sftp.passwordHintC`)}
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
    base_path: c.sftp.base_path ?? "", password_key: c.sftp.password_key,
  }
}

/** Client-side checks (the API validates again); null when OK. */
export function sftpFormError(t: (k: string) => string, v: typeof blank): string | null {
  const port = Number(v.port)
  if (!v.host.trim()) return t(`${S}.sftp.err.host`)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return t(`${S}.sftp.err.port`)
  if (!v.username.trim()) return t(`${S}.sftp.err.username`)
  if (v.base_path.trim() && !v.base_path.trim().startsWith("/")) return t(`${S}.sftp.err.basePath`)
  if (!/^[A-Z0-9_]{1,64}$/.test(toPasswordKey(v.password_key))) return t(`${S}.sftp.err.key`)
  return null
}

export function sftpPayload(v: typeof blank): SftpServerInput {
  return {
    name: v.name.trim() || null, host: v.host.trim(), port: Number(v.port) || 22, username: v.username.trim(),
    base_path: v.base_path.trim() || null, password_key: toPasswordKey(v.password_key),
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

  useEffect(() => { if (connection) setValue(sftpFormValue(connection)) }, [connection])

  const save = async () => {
    if (!connection) return
    const err = sftpFormError(t, value)
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
          <SftpServerForm value={value} onChange={setValue} idPrefix="sftp-edit" />
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
