"use client"

/**
 * "Saved folders" of a connection (file browser toolbar): folders bookmarked once — typically a
 * OneDrive folder shared through a link — reopened in one click. The menu saves the current
 * folder; "Manage…" renames, points an entry at another link (OneDrive) or removes it.
 * Stored on the connection (PATCH /cloud-connections/{id} `saved_folders`), shared by every user.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Bookmark, BookmarkPlus, Folder, Link2, Loader2, Settings2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import {
  resolveCloudLink, saveFolders, type CloudConnection, type Crumb, type SavedFolder,
} from "@/lib/cloud-sources-api"

const MAX = 50

/** Label of a new entry: "Parent › Folder" when it has a parent, else the folder name. */
export function savedName(trail: Crumb[]): string {
  const [parent, last] = [trail[trail.length - 2], trail[trail.length - 1]]
  const name = parent && parent.id !== "shared" ? `${parent.name} › ${last.name}` : last.name
  return name.slice(0, 120)
}

/** Adds (or refreshes) `entry` in the connection's list and saves it; returns the new connection. */
export async function rememberFolder(c: CloudConnection, entry: SavedFolder): Promise<CloudConnection> {
  const list = (c.saved_folders ?? []).filter((f) => f.id !== entry.id)
  return saveFolders(c.id, [...list, entry].slice(-MAX))
}

export function SavedFoldersMenu({ connection, trail, canEdit, onOpen, onChanged }: {
  connection: CloudConnection
  trail: Crumb[]
  canEdit: boolean
  onOpen: (f: SavedFolder) => void
  onChanged: (c: CloudConnection) => void
}) {
  const t = useT()
  const [manage, setManage] = useState(false)
  const saved = connection.saved_folders ?? []
  const current = trail[trail.length - 1]
  const alreadySaved = !!current && saved.some((f) => f.id === current.id)
  if (!saved.length && !canEdit) return null

  const saveCurrent = async () => {
    if (!current) return
    try {
      onChanged(await rememberFolder(connection, { id: current.id, name: savedName(trail), breadcrumbs: trail, link: null }))
      toast.success(t("cs.saved.added", { name: current.name }))
    } catch (e) {
      toast.error(errorText(t, e, "cs"))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-4 w-4" />{t("cs.saved.title")}
            {saved.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{saved.length}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("cs.saved.title")}</DropdownMenuLabel>
          {saved.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">{t("cs.saved.empty")}</p>
          ) : saved.map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => onOpen(f)} className="gap-2">
              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {f.breadcrumbs.map((b) => b.name).join(" › ")}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={saveCurrent} disabled={!current || alreadySaved || saved.length >= MAX}>
                <BookmarkPlus className="mr-2 h-4 w-4" />
                {alreadySaved ? t("cs.saved.isSaved") : t("cs.saved.saveCurrent")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setManage(true)} disabled={!saved.length}>
                <Settings2 className="mr-2 h-4 w-4" />{t("cs.saved.manage")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canEdit && (
        <ManageDialog open={manage} onOpenChange={setManage} connection={connection} onChanged={onChanged} />
      )}
    </>
  )
}

function ManageDialog({ open, onOpenChange, connection, onChanged }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  connection: CloudConnection
  onChanged: (c: CloudConnection) => void
}) {
  const t = useT()
  const [rows, setRows] = useState<SavedFolder[]>([])
  const [relink, setRelink] = useState<{ index: number; url: string; busy: boolean; error: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const canRelink = connection.provider === "onedrive"

  useEffect(() => { if (open) { setRows(connection.saved_folders ?? []); setRelink(null) } }, [open, connection.saved_folders])

  const set = (i: number, patch: Partial<SavedFolder>) => setRows((r) => r.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const applyLink = async () => {
    if (!relink || !relink.url.trim()) return
    setRelink({ ...relink, busy: true, error: null })
    try {
      const r = await resolveCloudLink(connection.id, relink.url.trim())
      if (r.kind !== "folder") { setRelink({ ...relink, busy: false, error: t("cs.link.notFolder") }); return }
      set(relink.index, { id: r.id, breadcrumbs: r.breadcrumbs, link: relink.url.trim() })
      setRelink(null)
    } catch (e) {
      setRelink({ ...relink, busy: false, error: errorText(t, e, "cs") })
    }
  }

  const save = async () => {
    if (rows.some((f) => !f.name.trim())) { toast.error(t("cs.saved.nameRequired")); return }
    setSaving(true)
    try {
      onChanged(await saveFolders(connection.id, rows.map((f) => ({ ...f, name: f.name.trim() }))))
      toast.success(t("cs.saved.saved"))
      onOpenChange(false)
    } catch (e) {
      toast.error(errorText(t, e, "cs"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bookmark className="h-5 w-5 text-primary" />{t("cs.saved.manageTitle")}</DialogTitle>
          <DialogDescription>{t("cs.saved.manageDesc")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("cs.saved.cleared")}</p>}
          {rows.map((f, i) => (
            <div key={`${f.id}-${i}`} className="space-y-1.5 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-2">
                <Input value={f.name} maxLength={120} onChange={(e) => set(i, { name: e.target.value })}
                  aria-label={t("cs.saved.name")} className="h-8" />
                {canRelink && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("cs.saved.changeLink")}
                    title={t("cs.saved.changeLink")} onClick={() => setRelink({ index: i, url: f.link ?? "", busy: false, error: null })}>
                    <Link2 className="h-4 w-4" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  aria-label={t("cs.saved.remove")} title={t("cs.saved.remove")}
                  onClick={() => { setRows((r) => r.filter((_, j) => j !== i)); setRelink(null) }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="truncate text-[11px] text-muted-foreground" title={f.link ?? undefined}>
                {f.breadcrumbs.map((b) => b.name).join(" › ")}
              </p>
              {relink?.index === i && (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Input autoFocus value={relink.url} placeholder="https://…sharepoint.com/…" className="h-8"
                      onChange={(e) => setRelink({ ...relink, url: e.target.value, error: null })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink() } }}
                      aria-label={t("cs.link.label")} aria-invalid={!!relink.error} />
                    <Button type="button" size="sm" className="h-8" onClick={applyLink} disabled={relink.busy || !relink.url.trim()}>
                      {relink.busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("cs.saved.useLink")}
                    </Button>
                  </div>
                  {relink.error && <p className="text-xs text-destructive">{relink.error}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={!rows.length || saving}
            onClick={() => { setRows([]); setRelink(null) }}>
            {t("cs.saved.clearAll")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
            <Button type="button" onClick={save} disabled={saving || !!relink?.busy}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
