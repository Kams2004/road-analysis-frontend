"use client"

/**
 * FileZilla-style connection log of an SFTP server, under the file browser:
 * timestamped Status / Error lines written by the API (connect, listings) and
 * by the worker (downloads, retries, resumes). Collapsible, monospace, errors
 * in red, auto-scroll while at the bottom, copy and clear. Polls every 1.5 s
 * while the page is visible (5 s when collapsed — the link state still
 * refreshes the server card).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Copy, Eraser, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { errorText } from "@/lib/auth-api"
import {
  clearSftpLog, formatSftpLogLine, getSftpLog, type SftpLinkState, type SftpLogLine,
} from "@/lib/cloud-sources-api"
import { SftpStateBadge } from "./sftp-state-badge"

const S = "cs"
const OPEN_KEY = "rr_cs_sftp_log_open"
const MAX_LINES = 500

export function SftpLogPanel({ connectionId, canClear, onState }: {
  connectionId: string
  canClear: boolean
  onState?: (state: SftpLinkState, message: string | null) => void
}) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(true)
  const [lines, setLines] = useState<SftpLogLine[]>([])
  const [state, setState] = useState<SftpLinkState>("disconnected")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastSeq = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const onStateRef = useRef(onState)
  onStateRef.current = onState

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) !== "0") } catch { /* ignore */ }
  }, [])
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(OPEN_KEY, o ? "0" : "1") } catch { /* ignore */ }
    return !o
  })

  // New server → start over.
  useEffect(() => { setLines([]); lastSeq.current = 0; stick.current = true; setError(null) }, [connectionId])

  const poll = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await getSftpLog(connectionId, lastSeq.current, { signal })
      if (res.lines.length) {
        lastSeq.current = res.last_seq
        setLines((prev) => [...prev, ...res.lines].slice(-MAX_LINES))
      } else if (res.last_seq < lastSeq.current) {
        lastSeq.current = res.last_seq                  // log cleared / counter reset elsewhere
      }
      setState(res.link_state)
      setMessage(res.link_message)
      onStateRef.current?.(res.link_state, res.link_message)
      setError(null)
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setError(errorText(t, e, S))
    }
  }, [connectionId, t])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const ctrl = new AbortController()
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === "visible") await poll(ctrl.signal)
      if (!stopped) timer = setTimeout(tick, open ? 1500 : 5000)
    }
    tick()
    const onVis = () => { if (document.visibilityState === "visible") poll(ctrl.signal) }
    document.addEventListener("visibilitychange", onVis)
    return () => { stopped = true; ctrl.abort(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis) }
  }, [poll, open])

  // Auto-scroll while the user is at the bottom.
  useEffect(() => {
    const el = boxRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines, open])

  const onScroll = () => {
    const el = boxRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const copy = async () => {
    const text = lines.map((l) => formatSftpLogLine(l, locale)).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t(`${S}.sftp.log.copied`))
    } catch {
      toast.error(t(`${S}.sftp.log.copyFailed`))
    }
  }

  const clear = async () => {
    try {
      await clearSftpLog(connectionId)
      setLines([])
    } catch (e) {
      toast.error(errorText(t, e, S))
    }
  }

  const time = (ts: string) => {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  }

  return (
    <section className="mt-3 rounded-xl border border-border bg-card shadow-sm" aria-label={t(`${S}.sftp.log.title`)}
      data-testid="sftp-log-panel">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={toggle} aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t(`${S}.sftp.log.title`)}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">· {t(`${S}.sftp.log.lines`, { n: lines.length })}</span>
        </button>
        <SftpStateBadge state={state} title={message ?? undefined} />
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={copy} disabled={!lines.length}>
          <Copy className="h-3.5 w-3.5" />{t(`${S}.sftp.log.copy`)}
        </Button>
        {canClear && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={clear} disabled={!lines.length}>
            <Eraser className="h-3.5 w-3.5" />{t(`${S}.sftp.log.clear`)}
          </Button>
        )}
      </div>
      {open && (
        <div ref={boxRef} onScroll={onScroll} role="log" aria-live="polite"
          className="max-h-64 min-h-[120px] overflow-y-auto border-t border-border bg-muted/30 px-3 py-2 font-mono text-[11.5px] leading-[1.55]">
          {error && <p className="text-destructive">{error}</p>}
          {!lines.length && !error ? (
            <p className="py-6 text-center font-sans text-xs text-muted-foreground">{t(`${S}.sftp.log.empty`)}</p>
          ) : lines.map((l) => (
            <div key={l.seq || `${l.ts}-${l.message}`} className={cn("flex gap-3 whitespace-pre-wrap break-words",
              l.level === "error" && "text-red-600 dark:text-red-400")}>
              <span className="shrink-0 text-muted-foreground tabular-nums">{time(l.ts)}</span>
              <span className={cn("w-[3.75rem] shrink-0 whitespace-nowrap", l.level === "error" ? "font-semibold" : "text-muted-foreground")}>
                {l.level === "error" ? "Error:" : "Status:"}
              </span>
              <span className="min-w-0 flex-1">{l.message}</span>
              {l.source === "worker" && (
                <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">{t(`${S}.sftp.log.worker`)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
