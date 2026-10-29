"use client"

/**
 * An "events" source (cloud sources page, instead of the file browser): the daily exception files
 * its providers drop (YYYY-MM-DD_<source>.csv, ~03:00 for the previous day, several a day), the
 * files on the server now (scheduled ones can be processed at once), what each import did, "Check
 * now" and "Import again". The events feed Historical analysis and Exception patterns.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle, CalendarDays, CheckCircle2, CircleDashed, FileSpreadsheet, Gauge, History, Loader2, RefreshCw, RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TablePagination } from "@/components/table-pagination"
import { EventAlertSettings, EventCalendar } from "./event-calendar"
import { RemoteEventFiles, SourceBadge } from "./remote-event-files"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  checkEventFiles, formatBytes, listEventFiles, reimportEventFile, type CloudConnection, type EventFile,
} from "@/lib/cloud-sources-api"

const S = "cs"
const PAGE = 31
const TYPE_TONE: Record<string, string> = {
  SPEEDING: "bg-red-500/10 text-red-700 dark:text-red-400",
  HARD_ACCELERATION: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  HARD_BRAKING: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  HARSH_CORNERING: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
}

export function EventFeedPanel({ connection, canEdit, onChanged }: {
  connection: CloudConnection
  canEdit: boolean
  onChanged: () => void
}) {
  const { t, locale } = useI18n()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: EventFile[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const feed = connection.event_feed

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await listEventFiles(connection.id, (page - 1) * PAGE, PAGE, { signal }))
      setError(null)
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setError(errorText(t, e, S))
    }
  }, [connection.id, page, t])

  useEffect(() => { setPage(1) }, [connection.id])
  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load, connection.last_sync_at])

  // After "Check now" / "Import again": the worker needs a few seconds — refresh twice.
  const refreshSoon = () => { [4000, 12000].forEach((ms) => setTimeout(() => { load(); onChanged() }, ms)) }

  const check = async () => {
    setBusy("check")
    try {
      await checkEventFiles(connection.id)
      toast.success(t(`${S}.events.checkQueued`))
      refreshSoon()
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setBusy(null)
    }
  }

  const reimport = async (f: EventFile) => {
    setBusy(f.id)
    try {
      await reimportEventFile(connection.id, f.id)
      toast.success(t(`${S}.events.reimportQueued`, { name: f.name }))
      refreshSoon()
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setBusy(null)
    }
  }

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })

  return (
    <div className="flex min-h-[520px] flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t(`${S}.events.title`)}</p>
            <p className="text-xs text-muted-foreground">
              {t(`${S}.events.subtitle`, { folder: connection.sftp?.base_path || t(`${S}.sftp.home`) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/exception-patterns"><Gauge className="h-4 w-4" />{t(`${S}.events.openBehaviour`)}</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/historical"><History className="h-4 w-4" />{t(`${S}.events.openHistorical`)}</Link>
            </Button>
            {canEdit && (
              <Button size="sm" className="gap-1.5" onClick={check} disabled={busy === "check" || !connection.enabled}>
                {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t(`${S}.events.checkNow`)}
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "events", v: (feed?.events ?? 0).toLocaleString(locale) },
            { k: "days", v: String(feed?.imported ?? 0) },
            { k: "lastDay", v: feed?.last_day ? day(feed.last_day) : "—" },
            { k: "lastCheck", v: fmt(connection.last_sync_at) },
          ].map(({ k, v }) => (
            <div key={k} className="rounded-lg border border-border bg-background px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{t(`${S}.events.kpi.${k}`)}</dt>
              <dd className="truncate text-sm font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-muted-foreground">{t(`${S}.events.schedule`)}</p>
        {feed && ((feed.missing?.length ?? 0) > 0 || (feed.failed_days?.length ?? 0) > 0) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              {(feed.missing?.length ?? 0) > 0 && (
                <p><span className="font-semibold">{t(`${S}.alerts.missing`)}</span> {feed.missing!.map((d) => {
                  const who = feed.missing_sources?.[d]
                  return who?.length ? `${day(d)} (${who.join(", ")})` : day(d)
                }).join(" · ")}</p>
              )}
              {(feed.failed_days?.length ?? 0) > 0 && (
                <p><span className="font-semibold">{t(`${S}.alerts.failed`)}</span> {feed.failed_days!.map(day).join(" · ")}</p>
              )}
              <p className="opacity-80">
                {feed.complete_until ? t(`${S}.alerts.completeUntil`, { day: day(feed.complete_until) }) : t(`${S}.alerts.notComplete`)}
              </p>
            </div>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <EventCalendar connection={connection} canEdit={canEdit} onChanged={onChanged} />
          {canEdit ? <EventAlertSettings connection={connection} onSaved={() => onChanged()} /> : <div />}
        </div>
        <RemoteEventFiles connection={connection} canEdit={canEdit} onProcessed={() => { load(); onChanged() }} />
        {connection.last_sync_status === "error" && connection.last_sync_error && (
          <Alert variant="destructive"><AlertDescription className="text-xs">{connection.last_sync_error}</AlertDescription></Alert>
        )}
      </div>

      <div className="flex-1 overflow-x-auto">
        {error ? (
          <div className="p-4"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div>
        ) : !data ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : data.items.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t(`${S}.events.empty`)}</p>
            <p className="max-w-md text-xs">{t(`${S}.events.emptyHint`)}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 font-medium">{t(`${S}.events.col.day`)}</th>
                <th className="py-2 pr-3 font-medium">{t(`${S}.events.col.status`)}</th>
                <th className="py-2 pr-3 text-right font-medium">{t(`${S}.events.col.events`)}</th>
                <th className="hidden py-2 pr-3 font-medium lg:table-cell">{t(`${S}.events.col.types`)}</th>
                <th className="hidden py-2 pr-3 font-medium md:table-cell">{t(`${S}.events.col.imported`)}</th>
                <th className="w-10 py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((f) => (
                <tr key={f.id} className="border-b border-border/60 align-top">
                  <td className="px-4 py-2">
                    <p className="font-medium">{day(f.day)}</p>
                    <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      <SourceBadge source={f.source} />{f.name} · {formatBytes(f.size, locale)}
                    </p>
                  </td>
                  <td className="py-2 pr-3"><FileStatus f={f} /></td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                    {f.status === "imported" ? (
                      <>
                        <p className="font-medium">{(f.inserted + f.updated).toLocaleString(locale)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t(`${S}.events.newUpdated`, { n: f.inserted, u: f.updated })}
                          {f.invalid > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 cursor-help text-amber-700 underline decoration-dotted dark:text-amber-400">
                                  {t(`${S}.events.skipped`, { n: f.invalid })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                {(f.problems ?? []).map((p) => <p key={p.line}>{t(`${S}.events.line`, { n: p.line })}: {p.reason}</p>)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </p>
                      </>
                    ) : "—"}
                  </td>
                  <td className="hidden py-2 pr-3 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(f.by_type ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                        <span key={k} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TYPE_TONE[k] ?? "bg-muted text-muted-foreground")}>
                          {t(`${S}.events.type.${k}`)} {n}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground md:table-cell">{fmt(f.imported_at)}</td>
                  <td className="py-2 pr-3">
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy === f.id || !connection.enabled}
                        onClick={() => reimport(f)} aria-label={t(`${S}.events.reimport`)} title={t(`${S}.events.reimport`)}>
                        {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > PAGE && (
        <TablePagination page={page} pageSize={PAGE} total={data.total} onPageChange={setPage} className="py-2" />
      )}
    </div>
  )
}

function FileStatus({ f }: { f: EventFile }) {
  const { t } = useI18n()
  if (f.status === "imported") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />{t(`${S}.events.status.imported`)}</span>
  }
  if (f.status === "pending") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
      <CircleDashed className="h-3.5 w-3.5 animate-spin [animation-duration:3s]" />{t(`${S}.events.status.pending`)}</span>
  }
  return (
    <div className="max-w-[260px]">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />{t(`${S}.events.status.failed`)}
      </span>
      {f.error && <p className="line-clamp-2 break-words text-[11px] text-muted-foreground" title={f.error}>{f.error}</p>}
    </div>
  )
}
