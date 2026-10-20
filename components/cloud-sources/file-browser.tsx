"use client"

/**
 * Drive file browser of a connection: breadcrumbs, folder navigation
 * (double-click / Enter, Backspace = up), search in the folder, list / grid
 * views, sorting, multi-select with checkboxes and Shift-range, folders
 * selectable as a whole ("include sub-folders" at import), already-imported
 * badges, non-media files shown disabled, and a selection bar that opens the
 * import options.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ChevronRight, ExternalLink, File as FileIcon, FileVideo, Folder,
  ImageIcon, LayoutGrid, List, Loader2, RefreshCw, Search, X, CircleDashed, History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ApiError, errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { formatDuration } from "@/lib/module7-api"
import {
  browseDrive, connectSftp, formatBytes, thumbnailUrl,
  type CloudConnection, type CloudProviderInfo, type Crumb, type DriveEntry, type ImportBatch,
} from "@/lib/cloud-sources-api"
import { ProviderIcon } from "./provider-icon"
import { ImportDialog } from "./import-dialog"

const S = "cs"
type SortKey = "name" | "size" | "modified" | "type"
type View = "list" | "grid"
const VIEW_KEY = "rr_cs_view"

function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list" } catch { return "list" }
}

function typeLabel(e: DriveEntry): string {
  if (e.kind === "folder") return "folder"
  const ext = e.name.includes(".") ? e.name.split(".").pop()!.toLowerCase() : ""
  return e.media ? `${e.media}:${ext}` : `other:${ext}`
}

export function FileBrowser({ connection, provider, canImport, onImported }: {
  connection: CloudConnection
  provider: CloudProviderInfo | null
  canImport: boolean
  onImported: (b: ImportBatch) => void
}) {
  const { t, locale } = useI18n()
  const [trail, setTrail] = useState<Crumb[]>([])
  const folderId = trail[trail.length - 1]?.id ?? null
  const [query, setQuery] = useState("")
  const [appliedQuery, setAppliedQuery] = useState("")
  const [folders, setFolders] = useState<DriveEntry[]>([])
  const [files, setFiles] = useState<DriveEntry[]>([])
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SFTP server disconnected on purpose: no listing (it would reconnect) until Connect.
  const held = connection.provider === "sftp" && !!connection.sftp?.link_held
  const [heldByServer, setHeldByServer] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const isHeld = held || heldByServer
  const [view, setView] = useState<View>("list")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 })
  const [selFiles, setSelFiles] = useState<Map<string, DriveEntry>>(new Map())
  const [selFolders, setSelFolders] = useState<Map<string, DriveEntry>>(new Map())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [focus, setFocus] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { setView(readView()) }, [])
  const changeView = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }

  // New connection → back to its root, selection cleared.
  useEffect(() => {
    setTrail([]); setQuery(""); setAppliedQuery(""); setSelFiles(new Map()); setSelFolders(new Map())
  }, [connection.id])

  // Debounced search inside the current folder.
  useEffect(() => {
    const id = setTimeout(() => setAppliedQuery(query.trim()), 400)
    return () => clearTimeout(id)
  }, [query])

  // Connect clicked on the server card (new link state) → listing allowed again.
  useEffect(() => { if (!held) setHeldByServer(false) }, [held, connection.sftp?.link_state, connection.sftp?.link_at])

  const load = useCallback(async () => {
    abortRef.current?.abort()
    if (isHeld) {
      setFolders([]); setFiles([]); setNextToken(null); setLoading(false); setError(null)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const page = await browseDrive(connection.id, { folderId, q: appliedQuery || null }, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setFolders(page.folders)
      setFiles(page.files)
      setNextToken(page.next_page_token)
      // Deep link / refresh: the server knows the real path.
      if (page.breadcrumbs.length && page.breadcrumbs.map((c) => c.id).join("/") !== trail.map((c) => c.id).join("/")) {
        setTrail(page.breadcrumbs)
      }
      setFocus(0)
      setAnchor(null)
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return
      setFolders([]); setFiles([]); setNextToken(null)
      if (e instanceof ApiError && e.detail.code === "sftp_disconnected") { setHeldByServer(true); return }
      setError(errorText(t, e, S))
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, folderId, appliedQuery, t, isHeld])

  useEffect(() => { load() }, [load, reloadKey])

  const reconnect = async () => {
    setReconnecting(true)
    try {
      await connectSftp(connection.id)
      setHeldByServer(false)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setError(errorText(t, e, S))
    } finally {
      setReconnecting(false)
    }
  }

  const loadMore = async () => {
    if (!nextToken) return
    setLoadingMore(true)
    try {
      const page = await browseDrive(connection.id, { folderId, q: appliedQuery || null, pageToken: nextToken })
      setFolders((f) => [...f, ...page.folders])
      setFiles((f) => [...f, ...page.files])
      setNextToken(page.next_page_token)
    } catch (e) {
      setError(errorText(t, e, S))
    } finally {
      setLoadingMore(false)
    }
  }

  const sortFn = useCallback((a: DriveEntry, b: DriveEntry) => {
    const { key, dir } = sort
    let v = 0
    if (key === "size") v = (a.size ?? -1) - (b.size ?? -1)
    else if (key === "modified") v = (a.modified ?? "").localeCompare(b.modified ?? "")
    else if (key === "type") v = typeLabel(a).localeCompare(typeLabel(b))
    if (v === 0) v = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: "base" })
    return v * dir
  }, [sort, locale])

  // Folders always first, then files; both sorted.
  const rows = useMemo(() => [...[...folders].sort(sortFn), ...[...files].sort(sortFn)], [folders, files, sortFn])
  const selectableFiles = useMemo(() => files.filter((f) => f.importable), [files])

  const open = (f: DriveEntry) => {
    if (f.kind !== "folder") return
    setQuery(""); setAppliedQuery("")
    setTrail((tr) => [...tr, { id: f.id, name: f.name }])
  }
  const up = () => setTrail((tr) => tr.slice(0, -1))

  const isSelected = (e: DriveEntry) => (e.kind === "folder" ? selFolders.has(e.id) : selFiles.has(e.id))

  const setOne = (e: DriveEntry, on: boolean) => {
    if (e.kind === "folder") {
      setSelFolders((m) => { const n = new Map(m); if (on) n.set(e.id, e); else n.delete(e.id); return n })
    } else if (e.importable) {
      setSelFiles((m) => { const n = new Map(m); if (on) n.set(e.id, e); else n.delete(e.id); return n })
    }
  }

  const toggle = (idx: number, shift: boolean) => {
    const e = rows[idx]
    if (!e || (e.kind === "file" && !e.importable)) return
    const target = !isSelected(e)
    if (shift && anchor !== null) {
      const [a, b] = anchor < idx ? [anchor, idx] : [idx, anchor]
      for (let i = a; i <= b; i++) setOne(rows[i], target)
    } else {
      setOne(e, target)
    }
    setAnchor(idx)
    setFocus(idx)
  }

  const allSelected = selectableFiles.length > 0 && selectableFiles.every((f) => selFiles.has(f.id))
  const toggleAll = () => {
    setSelFiles((m) => {
      const n = new Map(m)
      if (allSelected) selectableFiles.forEach((f) => n.delete(f.id))
      else selectableFiles.forEach((f) => n.set(f.id, f))
      return n
    })
  }
  const clearSelection = () => { setSelFiles(new Map()); setSelFolders(new Map()) }

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).tagName === "INPUT") return
    const cols = view === "grid" ? Math.max(1, Math.floor((listRef.current?.clientWidth ?? 800) / 180)) : 1
    if (ev.key === "ArrowDown" || (view === "grid" && ev.key === "ArrowRight")) {
      ev.preventDefault(); setFocus((f) => Math.min(rows.length - 1, f + (ev.key === "ArrowDown" ? cols : 1)))
    } else if (ev.key === "ArrowUp" || (view === "grid" && ev.key === "ArrowLeft")) {
      ev.preventDefault(); setFocus((f) => Math.max(0, f - (ev.key === "ArrowUp" ? cols : 1)))
    } else if (ev.key === "Enter") {
      ev.preventDefault(); const e = rows[focus]; if (e?.kind === "folder") open(e); else toggle(focus, ev.shiftKey)
    } else if (ev.key === " ") {
      ev.preventDefault(); toggle(focus, ev.shiftKey)
    } else if (ev.key === "Backspace" && trail.length) {
      ev.preventDefault(); up()
    } else if ((ev.key === "a" || ev.key === "A") && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault(); toggleAll()
    }
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${focus}"]`)?.scrollIntoView({ block: "nearest" })
  }, [focus])

  const selectedBytes = Array.from(selFiles.values()).reduce((s, f) => s + (f.size ?? 0), 0)
  const unknownSizes = Array.from(selFiles.values()).some((f) => f.size == null)
  const nSel = selFiles.size + selFolders.size

  const fmtDate = (s: string | null) => {
    if (!s) return "—"
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const sortHeader = (key: SortKey, label: string, className?: string) => (
    <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === key && "text-foreground", className)}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  )

  return (
    <div className="flex min-h-[520px] flex-col rounded-xl border border-border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="space-y-2.5 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={up} disabled={!trail.length} aria-label={t(`${S}.up`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <nav aria-label={t(`${S}.location`)} className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm">
            <button type="button" onClick={() => { setTrail([]); setQuery("") }}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted", !trail.length && "font-semibold")}>
              <ProviderIcon provider={connection.provider} className="h-4 w-4" />
              <span className="max-w-[180px] truncate">{connection.name}</span>
            </button>
            {trail.map((c, i) => (
              <span key={c.id} className="inline-flex min-w-0 items-center gap-0.5">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => { setTrail((tr) => tr.slice(0, i + 1)); setQuery("") }}
                  className={cn("max-w-[180px] truncate rounded-md px-1.5 py-1 hover:bg-muted", i === trail.length - 1 && "font-semibold")}>
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReloadKey((k) => k + 1)} aria-label={t("ops.common.refresh")}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {provider?.supports_search !== false && (
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8 pr-8"
                placeholder={trail.length ? t(`${S}.searchIn`, { folder: trail[trail.length - 1].name }) : t(`${S}.searchRoot`)}
                aria-label={t(`${S}.search`)} />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label={t(`${S}.clearSearch`)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <Select value={`${sort.key}:${sort.dir}`} onValueChange={(v) => { const [k, d] = v.split(":"); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }) }}>
            <SelectTrigger className="h-8 w-[170px]" aria-label={t(`${S}.sort`)}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name:1">{t(`${S}.sort.nameAsc`)}</SelectItem>
              <SelectItem value="name:-1">{t(`${S}.sort.nameDesc`)}</SelectItem>
              <SelectItem value="modified:-1">{t(`${S}.sort.newest`)}</SelectItem>
              <SelectItem value="modified:1">{t(`${S}.sort.oldest`)}</SelectItem>
              <SelectItem value="size:-1">{t(`${S}.sort.largest`)}</SelectItem>
              <SelectItem value="size:1">{t(`${S}.sort.smallest`)}</SelectItem>
              <SelectItem value="type:1">{t(`${S}.sort.type`)}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label={t(`${S}.view`)}>
            <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => changeView("list")}
              aria-pressed={view === "list"} aria-label={t(`${S}.viewList`)}><List className="h-4 w-4" /></Button>
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => changeView("grid")}
              aria-pressed={view === "grid"} aria-label={t(`${S}.viewGrid`)}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>
        {appliedQuery && (
          <p className="text-xs text-muted-foreground">
            {t(provider?.search_recursive ? `${S}.resultsRecursive` : `${S}.results`, { q: appliedQuery })}
          </p>
        )}
      </div>

      {/* Listing */}
      <div ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label={t(`${S}.files`)}
        className="relative flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        style={{ maxHeight: "62vh" }}>
        {isHeld ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <p>{t(`${S}.sftp.heldBrowse`)}</p>
            <Button size="sm" onClick={reconnect} disabled={reconnecting}>
              {reconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(`${S}.sftp.connect`)}
            </Button>
            {error && <Alert variant="destructive" className="text-left"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
        ) : error ? (
          <div className="p-4"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div>
        ) : loading && rows.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Folder className="h-8 w-8 opacity-40" />
            <p className="text-sm">{appliedQuery ? t(`${S}.noResults`) : t(`${S}.emptyFolder`)}</p>
          </div>
        ) : view === "list" ? (
          <table className={cn("w-full text-sm", loading && "opacity-60")}>
            <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground backdrop-blur">
              <tr className="border-b border-border">
                <th className="w-10 px-3 py-2 text-left">
                  <Checkbox checked={allSelected ? true : selectableFiles.some((f) => selFiles.has(f.id)) ? "indeterminate" : false}
                    onCheckedChange={toggleAll} disabled={!selectableFiles.length || !canImport} aria-label={t(`${S}.selectAll`)} />
                </th>
                <th className="w-full py-2 pr-3 text-left font-medium">{sortHeader("name", t(`${S}.col.name`))}</th>
                <th className="hidden py-2 pr-3 text-left font-medium md:table-cell">{sortHeader("type", t(`${S}.col.type`))}</th>
                <th className="py-2 pr-3 text-right font-medium">{sortHeader("size", t(`${S}.col.size`), "justify-end")}</th>
                <th className="hidden py-2 pr-4 text-left font-medium lg:table-cell">{sortHeader("modified", t(`${S}.col.modified`))}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, idx) => {
                const disabled = e.kind === "file" && !e.importable
                const selected = isSelected(e)
                return (
                  <tr key={`${e.kind}-${e.id}`} data-idx={idx}
                    onClick={(ev) => { if (e.kind === "folder") { setFocus(idx) } else toggle(idx, ev.shiftKey) }}
                    onDoubleClick={() => open(e)}
                    className={cn(
                      "group cursor-default select-none border-b border-border/60 transition-colors",
                      selected ? "bg-primary/[0.07]" : "hover:bg-muted/50",
                      focus === idx && "outline outline-2 -outline-offset-2 outline-primary/40",
                      disabled && "text-muted-foreground",
                    )}>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={selected} disabled={disabled || !canImport}
                        onClick={(ev) => { ev.preventDefault(); toggle(idx, ev.shiftKey) }}
                        aria-label={t(`${S}.select`, { name: e.name })} />
                    </td>
                    <td className="max-w-0 py-2 pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <EntryThumb e={e} connectionId={connection.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          {e.kind === "folder" ? (
                            <button type="button" onClick={(ev) => { ev.stopPropagation(); open(e) }}
                              className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline">{e.name}</button>
                          ) : (
                            <p className={cn("truncate", !disabled && "font-medium")} title={e.name}>{e.name}</p>
                          )}
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {e.path && <span className="truncate">{e.path}</span>}
                            {e.duration_s != null && <span className="tabular-nums">{formatDuration(e.duration_s)}</span>}
                            {disabled && <span>{t(`${S}.notSupported`)}</span>}
                            {e.kind === "folder" && selected && <span className="text-primary">{t(`${S}.folderSelected`)}</span>}
                          </div>
                        </div>
                        <ImportedBadge e={e} />
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground md:table-cell">{entryType(t, e)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">
                      {e.kind === "folder" ? (e.child_count != null ? t(`${S}.items`, { n: e.child_count }) : "—") : formatBytes(e.size, locale)}
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-4 text-xs text-muted-foreground lg:table-cell">{fmtDate(e.modified)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className={cn("grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]", loading && "opacity-60")}>
            {rows.map((e, idx) => {
              const disabled = e.kind === "file" && !e.importable
              const selected = isSelected(e)
              return (
                <div key={`${e.kind}-${e.id}`} data-idx={idx}
                  onClick={(ev) => { if (e.kind === "folder") setFocus(idx); else toggle(idx, ev.shiftKey) }}
                  onDoubleClick={() => open(e)}
                  className={cn(
                    "group relative flex select-none flex-col overflow-hidden rounded-xl border bg-background transition-all",
                    selected ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/40 hover:shadow-sm",
                    focus === idx && !selected && "ring-2 ring-primary/30",
                    disabled && "opacity-55",
                  )}>
                  <div className="relative aspect-video bg-muted/60">
                    <EntryThumb e={e} connectionId={connection.id} size="lg" />
                    {e.duration_s != null && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                        {formatDuration(e.duration_s)}
                      </span>
                    )}
                    <div className={cn("absolute left-2 top-2 rounded bg-background/90 p-0.5 shadow-sm transition-opacity",
                      selected || focus === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100", (disabled || !canImport) && "hidden")}
                      onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={selected} onClick={(ev) => { ev.preventDefault(); toggle(idx, ev.shiftKey) }}
                        aria-label={t(`${S}.select`, { name: e.name })} />
                    </div>
                    <div className="absolute right-2 top-2"><ImportedBadge e={e} compact /></div>
                  </div>
                  <div className="space-y-0.5 px-2.5 py-2">
                    {e.kind === "folder" ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); open(e) }}
                        className="block w-full truncate text-left text-sm font-medium hover:text-primary hover:underline">{e.name}</button>
                    ) : (
                      <p className="truncate text-sm font-medium" title={e.name}>{e.name}</p>
                    )}
                    <p className="truncate text-[11px] text-muted-foreground">
                      {e.kind === "folder" ? t(`${S}.folder`) : disabled ? t(`${S}.notSupported`) : `${formatBytes(e.size, locale)} · ${fmtDate(e.modified)}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {nextToken && !error && (
          <div className="flex justify-center p-3">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="gap-1.5">
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}{t(`${S}.loadMore`)}
            </Button>
          </div>
        )}
      </div>

      {/* Selection bar */}
      <div className={cn("flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 transition-colors",
        nSel ? "bg-primary/[0.06]" : "bg-muted/30")}>
        <div className="min-w-0 flex-1 text-sm">
          {nSel ? (
            <span>
              <span className="font-semibold">{t(`${S}.selFiles`, { n: selFiles.size })}</span>
              {selFiles.size > 0 && <span className="text-muted-foreground"> · {formatBytes(selectedBytes, locale)}{unknownSizes ? "+" : ""}</span>}
              {selFolders.size > 0 && <span className="text-muted-foreground"> · {t(`${S}.selFolders`, { n: selFolders.size })}</span>}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{canImport ? t(`${S}.selHint`) : t(`${S}.readOnly`)}</span>
          )}
        </div>
        {nSel > 0 && (
          <Button variant="ghost" size="sm" onClick={clearSelection}>{t(`${S}.clear`)}</Button>
        )}
        {canImport && (
          <Button size="sm" className="gap-1.5" disabled={!nSel} onClick={() => setImportOpen(true)}>
            <FileVideo className="h-4 w-4" />{t(`${S}.importN`, { n: nSel })}
          </Button>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        connection={connection}
        files={Array.from(selFiles.values())}
        folders={Array.from(selFolders.values())}
        onDone={(b) => { clearSelection(); setImportOpen(false); onImported(b); setReloadKey((k) => k + 1) }}
      />
    </div>
  )
}

function entryType(t: (k: string, v?: Record<string, string | number>) => string, e: DriveEntry): string {
  if (e.kind === "folder") return t(`${S}.folder`)
  const ext = e.name.includes(".") ? e.name.split(".").pop()!.toUpperCase() : ""
  if (e.media === "video") return t(`${S}.typeVideo`, { ext })
  if (e.media === "image") return t(`${S}.typeImage`, { ext })
  return ext || e.mime_type || t(`${S}.typeOther`)
}

function EntryThumb({ e, connectionId, size }: { e: DriveEntry; connectionId: string; size: "sm" | "lg" }) {
  const [failed, setFailed] = useState(false)
  const Icon = e.kind === "folder" ? Folder : e.media === "video" ? FileVideo : e.media === "image" ? ImageIcon : FileIcon
  const tone = e.kind === "folder" ? "text-amber-500" : e.media === "video" ? "text-blue-500" : e.media === "image" ? "text-teal-500" : "text-muted-foreground"
  const showImg = e.kind === "file" && e.has_thumbnail && !failed
  if (size === "lg") {
    return showImg ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnailUrl(connectionId, e.id)} alt="" loading="lazy" onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover" />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center"><Icon className={cn("h-10 w-10", tone)} strokeWidth={1.5} /></div>
    )
  }
  return (
    <div className="relative flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(connectionId, e.id)} alt="" loading="lazy" onError={() => setFailed(true)}
          className="h-full w-full object-cover" />
      ) : (
        <Icon className={cn("h-5 w-5", tone)} strokeWidth={1.75} />
      )}
    </div>
  )
}

function ImportedBadge({ e, compact = false }: { e: DriveEntry; compact?: boolean }) {
  const { t } = useI18n()
  const st = e.imported?.state
  if (!st || st === "none") return null
  const conf = {
    imported: { icon: CheckCircle2, cls: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400", label: t(`${S}.badge.imported`) },
    importing: { icon: CircleDashed, cls: "bg-blue-500/12 text-blue-700 ring-blue-500/30 dark:text-blue-400", label: t(`${S}.badge.importing`) },
    changed: { icon: History, cls: "bg-amber-500/12 text-amber-700 ring-amber-500/30 dark:text-amber-400", label: t(`${S}.badge.changed`) },
  }[st]
  const Icon = conf.icon
  const badge = (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", conf.cls,
      compact && "bg-background/95")}>
      <Icon className={cn("h-3 w-3", st === "importing" && "animate-spin [animation-duration:3s]")} />
      {!compact && conf.label}
    </span>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <p>{t(`${S}.badgeHint.${st}`)}</p>
        {e.imported?.job_id && (
          <Link href={`/detections?job_id=${e.imported.job_id}`} className="mt-1 inline-flex items-center gap-1 underline">
            {t(`${S}.viewDetections`)}<ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
