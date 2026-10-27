"use client"

/**
 * Sources (cloud sources): one compact card per connection — provider,
 * account, status, watched folder / auto-import, last sync — with reconnect,
 * sync, enable/disable and remove. "Add a source" picks a provider among
 * those with a working flow: a drive starts the OAuth consent; an SFTP
 * server is a profile (host, port, user, base path and its password, stored
 * encrypted by the API and never shown again). SFTP cards show the live
 * link state with Connect / Reconnect / Disconnect / Edit / Forget host key.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle, Eye, FolderSync, KeyRound, Loader2, MoreHorizontal, Pencil, Plug, PlugZap, Plus, Power, RefreshCw,
  ShieldOff, Trash2, Unplug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge, type BadgeTone } from "@/components/status-badge"
import { useAuth } from "@/components/auth-provider"
import { errorText } from "@/lib/auth-api"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import {
  createCloudConnection, deleteCloudConnection, parseDate, syncCloudConnection, updateCloudConnection,
} from "@/lib/module7-api"
import {
  connectSftp, createSftpServer, disconnectSftp, forgetSftpHostKey, reauthorizeConnection,
  type CloudConnection, type CloudProviderInfo, type SftpLinkState,
} from "@/lib/cloud-sources-api"
import { ProviderIcon } from "./provider-icon"
import { WatchedFolderDialog } from "./watched-folder-dialog"
import { SftpStateBadge } from "./sftp-state-badge"
import { SFTP_BLANK, SftpServerDialog, SftpServerForm, sftpFormError, sftpPayload } from "./sftp-server-dialog"

const S = "cs"

const CONN_TONE: Record<string, BadgeTone> = { active: "green", pending_auth: "amber", error: "red", disabled: "slate" }

export function ConnectionsPanel({ connections, providers, selectedId, onSelect, onChanged, loading, linkStates = {} }: {
  connections: CloudConnection[]
  providers: CloudProviderInfo[]
  selectedId: string | null
  onSelect: (c: CloudConnection) => void
  onChanged: (c?: CloudConnection | null, removedId?: string) => void
  loading: boolean
  /** Live SFTP link states polled by the log panel (fresher than the list). */
  linkStates?: Record<string, SftpLinkState>
}) {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const canAdd = can("jobs", "add")
  const canEdit = can("jobs", "edit")
  const canDelete = can("jobs", "delete")
  const [connectOpen, setConnectOpen] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [toDelete, setToDelete] = useState<CloudConnection | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [watchFor, setWatchFor] = useState<CloudConnection | null>(null)
  const [editSftp, setEditSftp] = useState<CloudConnection | null>(null)
  const [forgetFor, setForgetFor] = useState<CloudConnection | null>(null)

  const fmt = (s: string | null) => {
    const d = parseDate(s)
    return d ? d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"
  }

  const run = async (c: CloudConnection, fn: () => Promise<void>) => {
    setBusy((b) => ({ ...b, [c.id]: true }))
    try { await fn() } catch (e) { toast.error(errorText(t, e, S)) } finally { setBusy((b) => ({ ...b, [c.id]: false })) }
  }

  const reconnect = (c: CloudConnection) => run(c, async () => {
    const { authorize_url } = await reauthorizeConnection(c.id)
    window.location.assign(authorize_url)
  })
  const sync = (c: CloudConnection) => run(c, async () => {
    await syncCloudConnection(c.id)
    toast.success(t(`${S}.syncQueued`))
    setTimeout(() => onChanged(), 3000)
  })
  const toggle = (c: CloudConnection) => run(c, async () => {
    onChanged(await updateCloudConnection(c.id, { enabled: !c.enabled }))
  })
  const sftpConnect = (c: CloudConnection) => run(c, async () => {
    try {
      const res = await connectSftp(c.id)
      onChanged(res.connection)
      toast.success(t(`${S}.sftp.connected`, { n: res.entries, path: res.base_path }))
    } catch (e) {
      onChanged()                                   // the card shows the error state from the server
      throw e
    }
  })
  const sftpDisconnect = (c: CloudConnection) => run(c, async () => {
    onChanged(await disconnectSftp(c.id))
    toast.success(t(`${S}.sftp.disconnected`))
  })
  const forget = async () => {
    const c = forgetFor
    if (!c) return
    setForgetFor(null)
    await run(c, async () => {
      onChanged(await forgetSftpHostKey(c.id))
      toast.success(t(`${S}.sftp.forgotten`))
    })
  }
  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteCloudConnection(toDelete.id)
      toast.success(t(`${S}.removed`, { name: toDelete.name }))
      onChanged(null, toDelete.id)
      setToDelete(null)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t(`${S}.connections`)}</h2>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChanged()} aria-label={t("ops.common.refresh")}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {canAdd && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setConnectOpen(true)}>
              <Plus className="h-4 w-4" />{t(`${S}.connect`)}
            </Button>
          )}
        </div>
      </div>

      {loading && connections.length === 0 ? (
        <div className="flex justify-center rounded-xl border border-dashed border-border py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex w-fit gap-2">
            <ProviderIcon provider="google_drive" className="h-7 w-7" />
            <ProviderIcon provider="onedrive" className="h-7 w-7" />
            <ProviderIcon provider="sftp" className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium">{t(`${S}.empty`)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t(`${S}.emptyHint`)}</p>
          {canAdd && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setConnectOpen(true)}>
              <Plus className="h-4 w-4" />{t(`${S}.connect`)}
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => {
            const selected = c.id === selectedId
            const isSftp = c.provider === "sftp"
            const usable = isSftp ? c.enabled : c.status === "active" && c.enabled
            const link: SftpLinkState = linkStates[c.id] ?? c.sftp?.link_state ?? "disconnected"
            return (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c) } }}
                  className={cn(
                    "group rounded-xl border bg-card p-3 text-left shadow-sm outline-none transition-all",
                    "hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50",
                    selected ? "border-primary ring-1 ring-primary/40" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                      <ProviderIcon provider={c.provider} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={c.account_email ?? undefined}>
                        {c.account_email || t(`m7.jobs.source.${c.provider}`)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}
                          aria-label={t(`${S}.actions`)} disabled={busy[c.id]}>
                          {busy[c.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => onSelect(c)} disabled={!usable}>
                          <Eye className="mr-2 h-4 w-4" />{t(`${S}.browse`)}
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onSelect={() => setWatchFor(c)} disabled={!usable}>
                            <FolderSync className="mr-2 h-4 w-4" />{t(`${S}.watchedFolder`)}
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onSelect={() => sync(c)} disabled={!usable || !c.folder_id}>
                            <RefreshCw className="mr-2 h-4 w-4" />{t(`${S}.syncNow`)}
                          </DropdownMenuItem>
                        )}
                        {canEdit && !isSftp && (
                          <DropdownMenuItem onSelect={() => reconnect(c)}>
                            <Plug className="mr-2 h-4 w-4" />{t(`${S}.reconnect`)}
                          </DropdownMenuItem>
                        )}
                        {isSftp && (
                          <>
                            <DropdownMenuItem onSelect={() => sftpConnect(c)} disabled={!c.enabled}>
                              <PlugZap className="mr-2 h-4 w-4" />
                              {link === "connected" ? t(`${S}.sftp.reconnect`) : t(`${S}.sftp.test`)}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => sftpDisconnect(c)} disabled={link !== "connected"}>
                              <Unplug className="mr-2 h-4 w-4" />{t(`${S}.sftp.disconnect`)}
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onSelect={() => setEditSftp(c)}>
                                <Pencil className="mr-2 h-4 w-4" />{t(`${S}.sftp.edit`)}
                              </DropdownMenuItem>
                            )}
                            {canEdit && c.sftp?.host_key_fingerprint && (
                              <DropdownMenuItem onSelect={() => setForgetFor(c)}>
                                <ShieldOff className="mr-2 h-4 w-4" />{t(`${S}.sftp.forgetHostKey`)}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {canEdit && c.status !== "pending_auth" && (
                          <DropdownMenuItem onSelect={() => toggle(c)}>
                            <Power className="mr-2 h-4 w-4" />{c.enabled ? t(`${S}.disable`) : t(`${S}.enable`)}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setToDelete(c)}>
                              <Trash2 className="mr-2 h-4 w-4" />{t(`${S}.remove`)}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {isSftp && c.enabled ? (
                      <SftpStateBadge state={link} title={c.sftp?.link_message ?? undefined} />
                    ) : (
                      <StatusBadge tone={c.enabled ? CONN_TONE[c.status] ?? "slate" : "slate"}>
                        {c.enabled ? t(`${S}.status.${c.status}`) : t(`${S}.status.disabled`)}
                      </StatusBadge>
                    )}
                    {c.auto_import && c.enabled && (
                      <StatusBadge tone="blue" dot={false}>
                        <FolderSync className="mr-1 h-3 w-3" />{t(`${S}.autoImportOn`)}
                      </StatusBadge>
                    )}
                  </div>

                  {isSftp && c.sftp && (
                    <dl className="mt-2.5 space-y-1 text-[11px]">
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-muted-foreground">{t(`${S}.sftp.baseFolder`)}</dt>
                        <dd className="min-w-0 truncate font-mono font-medium" title={c.sftp.base_path ?? undefined}>
                          {c.sftp.base_path || t(`${S}.sftp.home`)}
                        </dd>
                      </div>
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-muted-foreground">{t(`${S}.sftp.password`)}</dt>
                        <dd className={cn("min-w-0 truncate font-medium", !c.sftp.credentials && "text-amber-700 dark:text-amber-400")}
                          title={!c.sftp.password_saved && c.sftp.password_var ? c.sftp.password_var : undefined}>
                          {c.sftp.password_saved
                            ? <><KeyRound className="mr-1 inline h-3 w-3" />{t(`${S}.sftp.passwordSaved`)}</>
                            : c.sftp.credentials
                              ? <><KeyRound className="mr-1 inline h-3 w-3" />{t(`${S}.sftp.passwordSet`, { method: c.sftp.credentials })}</>
                              : t(`${S}.sftp.passwordMissing`)}
                        </dd>
                      </div>
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-muted-foreground">{t(`${S}.sftp.hostKey`)}</dt>
                        <dd className="min-w-0 truncate font-mono" title={c.sftp.host_key_fingerprint ?? undefined}>
                          {c.sftp.host_key_fingerprint?.split(" ").pop() ?? t(`${S}.sftp.hostKeyNone`)}
                        </dd>
                      </div>
                    </dl>
                  )}

                  {isSftp && c.enabled && (canAdd || canEdit) && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant={link === "connected" ? "outline" : "default"} className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => sftpConnect(c)} disabled={busy[c.id]}>
                        <PlugZap className="h-3.5 w-3.5" />{link === "connected" ? t(`${S}.sftp.reconnect`) : t(`${S}.sftp.connect`)}
                      </Button>
                      {link === "connected" && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => sftpDisconnect(c)} disabled={busy[c.id]}>
                          <Unplug className="h-3.5 w-3.5" />{t(`${S}.sftp.disconnect`)}
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setEditSftp(c)}>
                          <Pencil className="h-3.5 w-3.5" />{t(`${S}.sftp.edit`).replace("…", "")}
                        </Button>
                      )}
                    </div>
                  )}

                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">{t(`${S}.watched`)}</dt>
                      <dd className="truncate font-medium">{c.folder_name || (c.folder_id ? c.folder_id : t(`${S}.none`))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t(`${S}.lastSync`)}</dt>
                      <dd className={cn("font-medium", c.last_sync_status === "error" && "text-destructive")}>
                        {c.auto_import || c.last_sync_at ? fmt(c.last_sync_at) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t(`${S}.imported`)}</dt>
                      <dd className="font-medium tabular-nums">{c.files_imported_total ?? 0}</dd>
                    </div>
                  </dl>

                  {c.status === "pending_auth" && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <span>{t(`${S}.pendingAuth`)}</span>
                      {canEdit && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); reconnect(c) }}>{t(`${S}.finish`)}</Button>
                      )}
                    </div>
                  )}
                  {isSftp && c.enabled && link === "error" && c.sftp?.link_message && (
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-3 break-words">{c.sftp.link_message}</span>
                    </div>
                  )}
                  {c.status === "error" && c.last_sync_error && !(isSftp && link === "error") && (
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-3 break-words">{c.last_sync_error}</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} providers={providers}
        onSftpCreated={(c) => { onChanged(); onSelect(c); if (c.sftp?.credentials) sftpConnect(c) }} />

      <SftpServerDialog connection={editSftp} onClose={() => setEditSftp(null)}
        onSaved={(c) => { onChanged(c); setEditSftp(null) }} />

      <AlertDialog open={!!forgetFor} onOpenChange={(o) => { if (!o) setForgetFor(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${S}.sftp.forgetTitle`)}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t(`${S}.sftp.forgetBody`, { fp: forgetFor?.sftp?.host_key_fingerprint ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); forget() }}>{t(`${S}.sftp.forgetHostKey`)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WatchedFolderDialog connection={watchFor} onClose={() => setWatchFor(null)}
        onSaved={(c) => { onChanged(c); setWatchFor(null) }} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${S}.removeTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(toDelete?.provider === "sftp" ? `${S}.sftp.removeBody` : `${S}.removeBody`, { name: toDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); remove() }} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(`${S}.remove`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConnectDialog({ open, onOpenChange, providers, onSftpCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  providers: CloudProviderInfo[]
  onSftpCreated: (c: CloudConnection) => void
}) {
  const { t } = useI18n()
  const { can } = useAuth()
  const [provider, setProvider] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [sftp, setSftp] = useState(SFTP_BLANK)
  const [connecting, setConnecting] = useState(false)
  const chosen = providers.find((p) => p.id === provider) ?? null
  const isServer = chosen?.auth === "server" || chosen?.id === "sftp"

  useEffect(() => {
    if (!open) return
    setProvider(providers.find((p) => p.configured && p.auth !== "server")?.id ?? providers.find((p) => p.configured)?.id ?? null)
    setName("")
    setSftp({ ...SFTP_BLANK })
  }, [open, providers])
  useEffect(() => { if (!open) setSftp({ ...SFTP_BLANK }) }, [open])

  const addServer = async () => {
    const err = sftpFormError(t, sftp)
    if (err) { toast.error(err); return }
    setConnecting(true)
    try {
      const c = await createSftpServer({ ...sftpPayload(sftp), name: name.trim() || null })
      toast.success(t(`${S}.sftp.added`, { name: c.name }))
      setSftp({ ...SFTP_BLANK })                    // the typed password is not kept in memory
      onOpenChange(false)
      onSftpCreated(c)
    } catch (e) {
      toast.error(errorText(t, e, S))
    } finally {
      setConnecting(false)
    }
  }

  const reset = (o: boolean) => {
    if (!connecting) onOpenChange(o)
  }

  const connect = async () => {
    if (!chosen || !chosen.configured) return
    setConnecting(true)
    try {
      const { authorize_url } = await createCloudConnection({
        provider: chosen.id as "google_drive" | "onedrive",
        name: name.trim() || chosen.label,
      })
      window.location.assign(authorize_url)
    } catch (e) {
      toast.error(errorText(t, e, S))
      setConnecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${S}.connectTitle`)}</DialogTitle>
          <DialogDescription>{t(`${S}.connectDesc`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2" role="radiogroup" aria-label={t(`${S}.provider`)}>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={provider === p.id}
                disabled={!p.configured}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  provider === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border hover:bg-muted/50",
                  !p.configured && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background">
                  <ProviderIcon provider={p.id} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`m7.jobs.source.${p.id}`) === `m7.jobs.source.${p.id}` ? p.label : t(`m7.jobs.source.${p.id}`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.auth === "server" ? t(`${S}.sftp.providerHint`)
                      : p.configured ? t(`${S}.providerReady`) : t(`${S}.providerNotConfigured`)}
                  </p>
                </div>
              </button>
            ))}
            {providers.length > 0 && !providers.some((p) => p.configured && p.auth !== "server") && !isServer && (
              <p className="text-xs text-muted-foreground">
                {t(`${S}.configureHint`)}{" "}
                {can("settings") && (
                  <Link href="/settings/jobs#cloud" className="font-medium text-primary hover:underline">
                    {t(`${S}.configureLink`)}
                  </Link>
                )}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-name">{t(`${S}.connName`)}</Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
              placeholder={isServer ? (sftp.host.trim() || "bi.camtrack.mg") : chosen ? t(`${S}.connNamePh`, { provider: chosen.label }) : ""} />
          </div>
          {isServer ? (
            <SftpServerForm value={sftp} onChange={setSftp} idPrefix="sftp-new" />
          ) : (
            <p className="text-xs text-muted-foreground">{t(`${S}.consentHint`)}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)} disabled={connecting}>{t("common.cancel")}</Button>
          {isServer ? (
            <Button onClick={addServer} disabled={connecting}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(`${S}.sftp.add`)}
            </Button>
          ) : (
            <Button onClick={connect} disabled={connecting || !chosen?.configured}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(`${S}.continueTo`, { provider: chosen?.label ?? "" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
