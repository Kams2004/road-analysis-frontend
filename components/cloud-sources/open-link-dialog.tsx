"use client"

/**
 * "Open a link…" (OneDrive): paste the address of a folder shared with the account — the share link
 * or what the browser shows when the folder is open — and jump to it (GET /cloud-connections/{id}/resolve).
 */
import { useState } from "react"
import { Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import { resolveCloudLink, type ResolvedLink } from "@/lib/cloud-sources-api"

export function OpenLinkButton({ connectionId, onOpened, size = "sm", canRemember = false }: {
  connectionId: string
  /** `url`: the address pasted; `remember`: "Keep it in Saved folders" was ticked. */
  onOpened: (r: ResolvedLink, url: string, remember: boolean) => void
  size?: "sm" | "default"
  canRemember?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await resolveCloudLink(connectionId, url.trim())
      if (r.kind !== "folder") { setError(t("cs.link.notFolder")); return }
      onOpened(r, url.trim(), canRemember && remember)
      setOpen(false)
      setUrl("")
    } catch (err) {
      setError(errorText(t, err, "cs"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} className="gap-1.5" onClick={() => { setError(null); setOpen(true) }}>
        <Link2 className="h-4 w-4" />{t("cs.link.open")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />{t("cs.link.title")}</DialogTitle>
            <DialogDescription>{t("cs.link.desc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-2">
            <Label htmlFor="cs-link-url" className="text-xs font-medium">{t("cs.link.label")}</Label>
            <Input id="cs-link-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…sharepoint.com/…" aria-invalid={!!error} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            {canRemember && (
              <label className="flex items-center gap-2 pt-1 text-sm">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                {t("cs.link.remember")}
              </label>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={busy || !url.trim()}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("cs.link.go")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
