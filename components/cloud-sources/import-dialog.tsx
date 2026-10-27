"use client"

/**
 * Import options for a drive selection: summary (files, size, folders),
 * the same model picker and frame sampling as the manual upload (parked
 * vehicles unchecked by default), "include sub-folders" for selected
 * folders and "import again" for files already imported.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Film, Folder, FolderTree, Loader2, Repeat, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ModelSelector, DEFAULT_MODEL_IDS } from "@/components/model-selector"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { getModule7Settings, toBackendModels } from "@/lib/module7-api"
import {
  createImport, formatBytes, type CloudConnection, type DriveEntry, type ImportBatch,
} from "@/lib/cloud-sources-api"
import { ProviderIcon } from "./provider-icon"

const S = "cs"

export function ImportDialog({ open, onOpenChange, connection, files, folders, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  connection: CloudConnection
  files: DriveEntry[]
  folders: DriveEntry[]
  onDone: (b: ImportBatch) => void
}) {
  const { t, locale } = useI18n()
  const [models, setModels] = useState<string[]>(DEFAULT_MODEL_IDS)
  const [defaultSkip, setDefaultSkip] = useState<number | null>(null)
  const [overrideSkip, setOverrideSkip] = useState(false)
  const [skip, setSkip] = useState("5")
  const [subfolders, setSubfolders] = useState(true)
  const [reimport, setReimport] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    getModule7Settings()
      .then(({ processing }) => {
        const v = processing?.frame_skip_by_source?.[connection.provider] ?? processing?.frame_skip_default
        if (typeof v === "number") { setDefaultSkip(v); setSkip(String(v)) }
      })
      .catch(() => { /* settings:view missing — server default applies */ })
  }, [open, connection.provider])

  const skipNum = Number(skip)
  const skipValid = !overrideSkip || (Number.isInteger(skipNum) && skipNum >= 1 && skipNum <= 60)
  const bytes = files.reduce((s, f) => s + (f.size ?? 0), 0)
  const alreadyImported = files.filter((f) => f.imported && ["imported", "importing", "processing"].includes(f.imported.state)).length
  const videos = files.filter((f) => f.media === "video").length
  const images = files.filter((f) => f.media === "image").length

  const submit = async () => {
    if (!models.length || !skipValid) return
    setSubmitting(true)
    try {
      const batch = await createImport(connection.id, {
        files: files.map((f) => f.id),
        folder_ids: folders.map((f) => f.id),
        models: toBackendModels(models),
        frame_skip: overrideSkip ? skipNum : null,
        options: { include_subfolders: subfolders, reimport },
      })
      const queued = batch.counts.queued ?? 0
      const skipped = batch.counts.skipped_duplicate ?? 0
      toast.success(t(`${S}.importStarted`, { n: queued }) + (skipped ? ` ${t(`${S}.importSkipped`, { n: skipped })}` : ""))
      onDone(batch)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o) }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon provider={connection.provider} />{t(`${S}.importTitle`, { name: connection.name })}
          </DialogTitle>
          <DialogDescription>{t(`${S}.importDesc`, { name: connection.name })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{files.length}</p>
              <p className="text-[11px] text-muted-foreground">{t(`${S}.sumFiles`, { v: videos, i: images })}</p>
            </div>
            <div className="rounded-lg border border-border px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{formatBytes(bytes, locale)}</p>
              <p className="text-[11px] text-muted-foreground">{t(`${S}.sumSize`)}</p>
            </div>
            <div className="rounded-lg border border-border px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{folders.length}</p>
              <p className="text-[11px] text-muted-foreground">{t(`${S}.sumFolders`)}</p>
            </div>
          </div>

          {folders.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white"><FolderTree className="h-4 w-4" /></div>
                  <div>
                    <Label htmlFor="cs-sub" className="text-sm font-medium">{t(`${S}.includeSubfolders`)}</Label>
                    <p className="text-xs text-muted-foreground">{t(`${S}.includeSubfoldersHint`)}</p>
                  </div>
                </div>
                <Switch id="cs-sub" checked={subfolders} onCheckedChange={setSubfolders} />
              </div>
              <ul className="flex flex-wrap gap-1.5 sm:pl-11">
                {folders.map((f) => (
                  <li key={f.id} className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                    <Folder className="h-3 w-3 shrink-0 text-amber-500" /><span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ModelSelector selectedModels={models} onSelectionChange={setModels} />

          <div className="space-y-2 rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-white"><Film className="h-4 w-4" /></div>
                <div>
                  <Label htmlFor="cs-skip-override" className="text-sm font-medium">{t("m7.upload.frameSkip")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {defaultSkip != null ? t("m7.upload.frameSkipDefault", { n: defaultSkip }) : t("m7.upload.frameSkipServer")}
                  </p>
                </div>
              </div>
              <Switch id="cs-skip-override" checked={overrideSkip} onCheckedChange={setOverrideSkip} />
            </div>
            {overrideSkip && (
              <div className="flex flex-wrap items-center gap-3 sm:pl-11">
                <Input type="number" min={1} max={60} step={1} value={skip} onChange={(e) => setSkip(e.target.value)}
                  className="h-9 w-24" aria-label={t("m7.upload.frameSkip")} aria-invalid={!skipValid} />
                <span className="text-sm text-muted-foreground">
                  {skipValid ? t("m7.common.everyN", { n: skipNum }) : t("m7.upload.frameSkipInvalid")}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500 text-white"><Repeat className="h-4 w-4" /></div>
              <div>
                <Label htmlFor="cs-reimport" className="text-sm font-medium">{t(`${S}.reimport`)}</Label>
                <p className="text-xs text-muted-foreground">
                  {alreadyImported ? t(`${S}.reimportHintN`, { n: alreadyImported }) : t(`${S}.reimportHint`)}
                </p>
              </div>
            </div>
            <Switch id="cs-reimport" checked={reimport} onCheckedChange={setReimport} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={submitting || !models.length || !skipValid || (!files.length && !folders.length)} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {submitting ? t(`${S}.preparing`) : t(`${S}.startImport`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
