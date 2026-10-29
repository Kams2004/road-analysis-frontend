"use client"

/**
 * "Files on the server" of an events source: the folder as the SFTP server lists it now
 * (GET …/event-files/remote) — every daily file with its provider and what happened to it:
 * imported, scheduled for its processing time, queued for the next hourly check, failed, or
 * changed since its import. "Process now" imports one (or every waiting one) at once. Paginated;
 * the section folds away (remembered per browser).
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FolderSearch, Loader2, Play, RefreshCw, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TablePagination } from "@/components/table-pagination"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  formatBytes, listRemoteEventFiles, processEventFiles, type CloudConnection, type RemoteEventFile,
} from "@/lib/cloud-sources-api"

const S = "cs"
const PAGE = 10
const OPEN_KEY = "viasafe.remoteEventFiles.open"
const STATE_TONE: Record<RemoteEventFile["state"], string> = {
  imported: "text-emerald-700 dark:text-emerald-400",
  scheduled: "text-slate-600 dark:text-slate-300",
  queued: "text-blue-700 dark:text-blue-400",
  failed: "text-destructive",
  changed: "text-amber-700 dark:text-amber-400",
}
const STATE_ICON = { imported: CheckCircle2, scheduled: Clock, queued: Clock, failed: AlertTriangle, changed: RotateCcw }
// A provider keeps its colour everywhere (stable hash of its name).
const SOURCE_TONES = [
  "bg-sky-500/10 text-sky-700 dark:text-sky-300", "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "bg-rose-500/10 text-rose-700 dark:text-rose-300",
]

export function sourceTone(source: string): string {
  let h = 0
  for (const c of source) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SOURCE_TONES[h % SOURCE_TONES.length]
}

export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  return <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold", sourceTone(source))}>{source}</span>
}

export function RemoteEventFiles({ connection, canEdit, onProcessed }: {
  connection: CloudConnection
  canEdit: boolean
  onProcessed: () => void
}) {
  const { t, locale } = useI18n()
  const [data, setData] = useState<{ listed_at: string; items: RemoteEventFile[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false) } catch { /* storage unavailable */ }
  }, [])
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(OPEN_KEY, o ? "0" : "1") } catch { /* storage unavailable */ }
    return !o
  })

  const list = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listRemoteEventFiles(connection.id))
      setError(null)
      setOpen(true)
    } catch (e) {
      setError(errorText(t, e, S))
    } finally {
      setLoading(false)
    }
  }, [connection.id, t])

  const run = async (names: string[], key: string) => {
    setBusy(key)
    try {
      await processEventFiles(connection.id, names)
      toast.success(t(`${S}.remote.queued`, { n: names.length }))
      // The worker needs a few seconds per file: refresh the listing and the imports twice.
      ;[5000, 15000].forEach((ms) => setTimeout(() => { void list(); onProcessed() }, ms))
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setBusy(null)
    }
  }

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")
  const waiting = (data?.items ?? []).filter((f) => f.state !== "imported").map((f) => f.name)
  const items = data?.items ?? []
  const pages = Math.max(1, Math.ceil(items.length / PAGE))
  const shown = items.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium">
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <FolderSearch className="h-4 w-4 text-muted-foreground" />{t(`${S}.remote.title`)}
          {data && <span className="text-xs font-normal text-muted-foreground">
            · {t(`${S}.remote.listedAt`, { at: fmt(data.listed_at) })} · {t(`${S}.remote.count`, { n: items.length })}
          </span>}
        </button>
        {canEdit && waiting.length > 1 && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy !== null || !connection.enabled}
            onClick={() => run(waiting.slice(0, 31), "all")}>
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {t(`${S}.remote.processAll`, { n: Math.min(waiting.length, 31) })}
          </Button>
        )}
        <Button size="sm" variant={data ? "ghost" : "outline"} className="h-8 gap-1.5" onClick={list}
          disabled={loading || !connection.enabled}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t(data ? `${S}.remote.refresh` : `${S}.remote.list`)}
        </Button>
      </div>
      {open && <>
      {!data && !error && <p className="text-[11px] text-muted-foreground">{t(`${S}.remote.hint`)}</p>}
      {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
      {data && (data.items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{t(`${S}.remote.empty`)}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-1.5 font-medium">{t(`${S}.remote.col.file`)}</th>
                <th className="px-2 py-1.5 font-medium">{t(`${S}.remote.col.source`)}</th>
                <th className="px-2 py-1.5 font-medium">{t(`${S}.remote.col.state`)}</th>
                <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">{t(`${S}.remote.col.size`)}</th>
                <th className="w-28 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const Icon = STATE_ICON[f.state]
                return (
                  <tr key={f.name} className="border-t border-border/60 align-top">
                    <td className="px-3 py-1.5">
                      <p className="font-mono">{f.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t(`${S}.remote.modified`, { at: fmt(f.modified_at) })}</p>
                    </td>
                    <td className="px-2 py-1.5"><SourceBadge source={f.source} /></td>
                    <td className="px-2 py-1.5">
                      <span className={cn("inline-flex items-center gap-1 font-medium", STATE_TONE[f.state])}>
                        <Icon className="h-3.5 w-3.5" />{t(`${S}.remote.state.${f.state}`)}
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        {f.state === "imported" ? t(`${S}.remote.importedInfo`, { n: f.events.toLocaleString(locale), at: fmt(f.imported_at) })
                          : f.state === "scheduled" ? t(`${S}.remote.dueAt`, { at: fmt(f.due_at) })
                          : f.state === "queued" ? t(`${S}.remote.nextCheck`)
                          : f.state === "failed" ? <span className="line-clamp-2 break-words" title={f.error ?? ""}>{f.error}</span>
                          : t(`${S}.remote.changedInfo`)}
                      </p>
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                      {formatBytes(f.size, locale)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {canEdit && (
                        <Button size="sm" variant={f.state === "imported" ? "ghost" : "default"} className="h-7 gap-1 px-2 text-xs"
                          disabled={busy !== null || !connection.enabled} onClick={() => run([f.name], f.name)}
                          title={t(f.state === "imported" ? `${S}.events.reimport` : `${S}.remote.processNow`)}>
                          {busy === f.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : f.state === "imported" ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          {f.state !== "imported" && t(`${S}.remote.processNow`)}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {data && items.length > PAGE && (
        <TablePagination page={Math.min(page, pages)} pageSize={PAGE} total={items.length} onPageChange={setPage} className="py-1" />
      )}
      </>}
    </div>
  )
}
