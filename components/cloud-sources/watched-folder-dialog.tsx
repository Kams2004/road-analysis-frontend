"use client"

/**
 * Watched folder of a connection = automatic import: pick the folder, turn
 * auto-import on/off, choose the models and frame sampling used for the
 * files it brings in (every cloud.sync_interval_minutes).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronRight, Folder, FolderSync, Home, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ModelSelector, DEFAULT_MODEL_IDS } from "@/components/model-selector"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { listCloudFolders, toBackendModels, toUiModels, type CloudFolder } from "@/lib/module7-api"
import { updateAutoImport, type CloudConnection } from "@/lib/cloud-sources-api"
import { OpenLinkButton } from "./open-link-dialog"

const S = "cs"

export function WatchedFolderDialog({ connection, onClose, onSaved }: {
  connection: CloudConnection | null
  onClose: () => void
  onSaved: (c: CloudConnection) => void
}) {
  const t = useT()
  const [trail, setTrail] = useState<CloudFolder[]>([])
  const [folders, setFolders] = useState<CloudFolder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ id: string | null; name: string | null }>({ id: null, name: null })
  const [auto, setAuto] = useState(false)
  const [models, setModels] = useState<string[]>(DEFAULT_MODEL_IDS)
  const [skip, setSkip] = useState("")
  const [saving, setSaving] = useState(false)
  const current = trail[trail.length - 1] ?? null

  useEffect(() => {
    if (!connection) return
    setTrail([])
    setPicked({ id: connection.folder_id, name: connection.folder_name })
    setAuto(!!connection.auto_import)
    setModels(connection.auto_import_models?.length ? toUiModels(connection.auto_import_models) : DEFAULT_MODEL_IDS)
    setSkip(connection.auto_import_frame_skip != null ? String(connection.auto_import_frame_skip) : "")
  }, [connection])

  useEffect(() => {
    if (!connection) return
    let alive = true
    setFolders(null)
    setError(null)
    listCloudFolders(connection.id, current?.id)
      .then((f) => alive && setFolders(f))
      .catch((e) => alive && setError(errorText(t, e, S)))
    return () => { alive = false }
  }, [connection, current, t])

  const skipNum = skip.trim() === "" ? null : Number(skip)
  const skipValid = skipNum === null || (Number.isInteger(skipNum) && skipNum >= 1 && skipNum <= 60)
  const canSave = !saving && skipValid && models.length > 0 && (!auto || !!picked.id)

  const save = async () => {
    if (!connection || !canSave) return
    setSaving(true)
    try {
      const next = await updateAutoImport(connection.id, {
        folder_id: picked.id, folder_name: picked.name, auto_import: auto,
        auto_import_models: toBackendModels(models), auto_import_frame_skip: skipNum,
      })
      toast.success(t(`${S}.watchSaved`))
      onSaved(next)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!connection} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderSync className="h-5 w-5 text-primary" />{t(`${S}.watchTitle`)}</DialogTitle>
          <DialogDescription>{t(`${S}.watchDesc`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">{t(`${S}.watched`)}</Label>
              <span className="truncate text-xs text-muted-foreground">
                {picked.id ? picked.name || picked.id : t(`${S}.none`)}
              </span>
            </div>
            <nav aria-label={t(`${S}.watched`)} className="flex flex-wrap items-center gap-1 text-sm">
              <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted" onClick={() => setTrail([])}>
                <Home className="h-3.5 w-3.5" />{t(`${S}.root`)}
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <button type="button" className="max-w-[160px] truncate rounded px-1.5 py-0.5 hover:bg-muted"
                    onClick={() => setTrail((tr) => tr.slice(0, i + 1))}>{f.name}</button>
                </span>
              ))}
            </nav>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {error ? (
                <p className="p-4 text-sm text-destructive">{error}</p>
              ) : !folders ? (
                <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : folders.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t(`${S}.noSubfolders`)}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {folders.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => setTrail((tr) => [...tr, f])}
                        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60",
                          picked.id === f.id && "bg-primary/5 text-primary")}>
                        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {connection?.provider === "onedrive" && (
                <OpenLinkButton connectionId={connection.id} onOpened={(r) => {
                  setTrail(r.breadcrumbs.map((c) => ({ id: c.id, name: c.name })))
                  setPicked({ id: r.id, name: r.name })
                }} />
              )}
              <Button type="button" size="sm" variant="outline" disabled={!current}
                onClick={() => current && setPicked({ id: current.id, name: current.name })}>
                {current ? t(`${S}.useFolder`, { name: current.name }) : t(`${S}.openFolderFirst`)}
              </Button>
              {picked.id && (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setPicked({ id: null, name: null }); setAuto(false) }}>
                  {t(`${S}.clearFolder`)}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="cs-auto" className="text-sm font-medium">{t(`${S}.autoImport`)}</Label>
              <p className="text-xs text-muted-foreground">{t(`${S}.autoImportHint`)}</p>
            </div>
            <Switch id="cs-auto" checked={auto} disabled={!picked.id} onCheckedChange={setAuto} />
          </div>

          {auto && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <ModelSelector selectedModels={models} onSelectionChange={setModels} />
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="cs-auto-skip" className="text-sm">{t("m7.upload.frameSkip")}</Label>
                <Input id="cs-auto-skip" type="number" min={1} max={60} className="h-8 w-24" value={skip}
                  placeholder={t(`${S}.defaultShort`)} onChange={(e) => setSkip(e.target.value)} aria-invalid={!skipValid} />
                {!skipValid && <span className="text-xs text-destructive">{t("m7.upload.frameSkipInvalid")}</span>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
