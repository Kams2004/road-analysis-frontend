"use client"

/**
 * Month calendar of an "events" source: each UTC day coloured by its file — imported, missing,
 * failed, being imported, not due yet — with the alert settings (hour, e-mails) under it.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Loader2, Mail, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorText } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  checkEventFiles, getEventCalendar, reimportEventFile, updateAutoImport, type CloudConnection, type EventDay,
} from "@/lib/cloud-sources-api"

const S = "cs"
const TONE: Record<EventDay["status"], string> = {
  imported: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300",
  missing: "bg-amber-500/20 text-amber-800 ring-amber-500/40 dark:text-amber-300",
  failed: "bg-red-500/15 text-red-700 ring-red-500/40 dark:text-red-300",
  pending: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-300",
  waiting: "bg-muted/40 text-muted-foreground ring-border",
  none: "text-muted-foreground/50 ring-transparent",
}

const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

export function EventCalendar({ connection, canEdit, onChanged }: {
  connection: CloudConnection
  canEdit: boolean
  onChanged: () => void
}) {
  const { t, locale } = useI18n()
  const [month, setMonth] = useState(() => monthOf(new Date()))
  const [days, setDays] = useState<EventDay[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDays((await getEventCalendar(connection.id, month)).days)
    } catch (e) {
      toast.error(errorText(t, e, S))
    }
  }, [connection.id, month, t])
  useEffect(() => { load() }, [load, connection.last_sync_at])

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number)
    setMonth(monthOf(new Date(Date.UTC(y, m - 1 + n, 1))))
  }
  const act = async (d: EventDay) => {
    setBusy(d.day)
    try {
      if (d.file_id) await reimportEventFile(connection.id, d.file_id)
      else await checkEventFiles(connection.id)
      toast.success(t(`${S}.events.checkQueued`))
      setTimeout(() => { load(); onChanged() }, 5000)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setBusy(null)
    }
  }

  const [y, m] = month.split("-").map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7          // Monday first
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }))
  const isCurrent = month === monthOf(new Date())

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label={t("common.previous")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold capitalize">{title}</p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(1)} disabled={isCurrent} aria-label={t("common.next")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w) => <span key={w} className="text-[10px] font-medium uppercase text-muted-foreground">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {!days ? (
          <div className="col-span-7 flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : days.map((d) => {
          const actionable = canEdit && (d.status === "missing" || d.status === "failed")
          const cell = (
            <button type="button" disabled={!actionable || busy === d.day} onClick={() => act(d)}
              className={cn("relative flex h-11 flex-col items-center justify-center rounded-md text-xs ring-1 ring-inset",
                TONE[d.status], actionable ? "cursor-pointer hover:brightness-95" : "cursor-default")}>
              <span className="font-medium tabular-nums">{Number(d.day.slice(8))}</span>
              {d.status === "imported" && <span className="text-[9px] tabular-nums opacity-80">{d.events.toLocaleString(locale)}</span>}
              {busy === d.day && <Loader2 className="absolute right-0.5 top-0.5 h-3 w-3 animate-spin" />}
            </button>
          )
          if (d.status === "none") return <span key={d.day}>{cell}</span>
          return (
            <Tooltip key={d.day}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">{t(`${S}.cal.status.${d.status}`)}</p>
                {d.sources && Object.keys(d.sources).length > 1
                  ? Object.entries(d.sources).map(([src, st]) => (
                    <p key={src} className="text-[11px]"><span className="font-mono">{src}</span> · {t(`${S}.cal.status.${st}`)}</p>
                  ))
                  : d.file && <p className="font-mono text-[11px]">{d.file}</p>}
                {d.status === "imported" && <p>{t(`${S}.cal.events`, { n: d.events })}</p>}
                {d.error && <p className="break-words">{d.error}</p>}
                {actionable && <p className="mt-1 flex items-center gap-1"><RotateCcw className="h-3 w-3" />
                  {t(d.file_id ? `${S}.events.reimport` : `${S}.events.checkNow`)}</p>}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(["imported", "missing", "failed", "pending", "waiting"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={cn("h-2.5 w-2.5 rounded-sm ring-1 ring-inset", TONE[s])} />{t(`${S}.cal.status.${s}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Alert hour (UTC) and e-mail addresses of an event source. */
export function EventAlertSettings({ connection, onSaved }: {
  connection: CloudConnection
  onSaved: (c: CloudConnection) => void
}) {
  const { t } = useI18n()
  const feed = connection.event_feed
  const [hour, setHour] = useState(String(feed?.alert_hour ?? 10))
  const [processHour, setProcessHour] = useState(String(feed?.process_hour ?? 4))
  const [emails, setEmails] = useState((feed?.alert_emails ?? []).join(", "))
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setHour(String(connection.event_feed?.alert_hour ?? 10))
    setProcessHour(String(connection.event_feed?.process_hour ?? 4))
    setEmails((connection.event_feed?.alert_emails ?? []).join(", "))
  }, [connection.id, connection.event_feed?.alert_hour, connection.event_feed?.process_hour, connection.event_feed?.alert_emails])

  const save = async () => {
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)
    if (list.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) { toast.error(t(`${S}.alerts.badEmail`)); return }
    setSaving(true)
    try {
      onSaved(await updateAutoImport(connection.id, {
        event_alert_hour: Number(hour), event_process_hour: Number(processHour), event_alert_emails: list,
      }))
      toast.success(t(`${S}.alerts.saved`))
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Mail className="h-4 w-4 text-muted-foreground" />{t(`${S}.alerts.title`)}</p>
      <p className="text-[11px] text-muted-foreground">{t(`${S}.alerts.hint`)}</p>
      <div className="grid gap-2 sm:grid-cols-[150px_150px_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs" title={t(`${S}.alerts.processHourHint`)}>{t(`${S}.alerts.processHour`)}</Label>
          <Select value={processHour} onValueChange={setProcessHour}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00 UTC`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t(`${S}.alerts.hour`)}</Label>
          <Select value={hour} onValueChange={setHour}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00 UTC`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="ev-alert-emails">{t(`${S}.alerts.emails`)}</Label>
          <Input id="ev-alert-emails" className="h-9" value={emails} onChange={(e) => setEmails(e.target.value)}
            placeholder="ops@camtrack.net, …" />
        </div>
        <Button size="sm" className="h-9" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("common.save")}
        </Button>
      </div>
    </div>
  )
}
