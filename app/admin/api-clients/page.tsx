"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Ban, Check, CheckCircle2, Copy, KeyRound, Loader2, Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { useAuth } from "@/components/auth-provider"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { DataCard, DataToolbar } from "@/components/data-toolbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  createApiClient, deleteApiClient, errorText, listApiClients, revokeApiClient, rotateApiClient,
  type ApiClientRow,
} from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"

type Confirm = { kind: "rotate" | "revoke" | "delete"; client: ApiClientRow } | null

export default function ApiClientsPage() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("clients.title")} description={t("clients.subtitle")} />
          <RequirePermission module="api_clients">
            <ApiClients />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

function ApiClients() {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const [rows, setRows] = useState<ApiClientRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [acting, setActing] = useState(false)
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listApiClients())
    } catch (err) {
      toast.error(errorText(t, err))
      setRows((r) => r ?? [])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : t("common.never"))

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await createApiClient(name.trim(), description.trim() || undefined)
      setCreateOpen(false)
      setSecret({ name: res.name, key: res.api_key })
      toast.success(t("account.clients.created"))
      load()
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setCreating(false)
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    const { kind, client } = confirm
    setActing(true)
    try {
      if (kind === "rotate") {
        const res = await rotateApiClient(client.id)
        setSecret({ name: res.name, key: res.api_key })
        toast.success(t("account.clients.rotated"))
      } else if (kind === "revoke") {
        await revokeApiClient(client.id)
        toast.success(t("account.clients.revoked"))
      } else {
        await deleteApiClient(client.id)
        toast.success(t("account.clients.deleted"))
      }
      setConfirm(null)
      load()
    } catch (err) {
      toast.error(errorText(t, err))
    } finally {
      setActing(false)
    }
  }

  const confirmText = confirm
    ? t(
        confirm.kind === "rotate" ? "clients.rotateConfirm" : confirm.kind === "revoke" ? "clients.revokeConfirm" : "account.clients.deleteConfirm",
        { name: confirm.client.name },
      )
    : ""
  const confirmTitle = confirm
    ? t(confirm.kind === "rotate" ? "clients.rotate" : confirm.kind === "revoke" ? "clients.revoke" : "common.delete")
    : ""

  const q = search.trim().toLowerCase()
  const visible = (rows ?? []).filter((c) => !q
    || c.name.toLowerCase().includes(q)
    || (c.description ?? "").toLowerCase().includes(q)
    || c.key_prefix.toLowerCase().includes(q)
    || (c.created_by ?? "").toLowerCase().includes(q))
  const activeCount = (rows ?? []).filter((c) => c.is_active).length
  const revokedCount = (rows ?? []).length - activeCount

  return (
    <>
      {/* KPI cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={KeyRound} tone="blue" value={rows?.length ?? "—"} label={t("admin.kpi.clients")} />
        <StatCard icon={CheckCircle2} tone="green" value={rows ? activeCount : "—"} label={t("admin.kpi.activeKeys")} />
        <StatCard icon={Ban} tone="red" value={rows ? revokedCount : "—"} label={t("admin.kpi.revokedKeys")} />
      </div>

      <DataCard>
        <DataToolbar
          search={search}
          onSearch={setSearch}
          placeholder={t("admin.clients.searchPlaceholder")}
          actions={
            <>
              <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("account.audit.refresh")}
              </Button>
              {can("api_clients", "add") && (
                <Button size="sm" className="h-9" onClick={() => { setName(""); setDescription(""); setCreateOpen(true) }}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("clients.new")}
                </Button>
              )}
            </>
          }
        />

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">{t("common.name")}</TableHead>
              <TableHead>{t("clients.prefix")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("account.clients.createdBy")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("common.created")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("clients.lastUsed")}</TableHead>
              <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center">
                  <KeyRound className="mx-auto h-7 w-7 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("clients.empty")}</p>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((c) => (
                <TableRow key={c.id} className="h-11">
                  <TableCell className="max-w-[260px] py-1.5 pl-4">
                    <div className="font-medium">{c.name}</div>
                    {c.description && <div className="truncate text-xs text-muted-foreground" title={c.description}>{c.description}</div>}
                  </TableCell>
                  <TableCell className="py-1.5"><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.key_prefix}…</code></TableCell>
                  <TableCell className="py-1.5">
                    {c.is_active ? (
                      <StatusBadge tone="green">{t("common.active")}</StatusBadge>
                    ) : (
                      <StatusBadge tone="red">{t("clients.revoked")}</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="hidden py-1.5 lg:table-cell">{c.created_by ?? "—"}</TableCell>
                  <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground md:table-cell">{fmt(c.created_at)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground md:table-cell">{fmt(c.last_used_at)}</TableCell>
                  <TableCell className="py-1.5 pr-4">
                    <div className="flex justify-end gap-1">
                      {can("api_clients", "edit") && c.is_active && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title={t("clients.rotate")} aria-label={t("clients.rotate")}
                            onClick={() => setConfirm({ kind: "rotate", client: c })}>
                            <RotateCw className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title={t("clients.revoke")} aria-label={t("clients.revoke")}
                            onClick={() => setConfirm({ kind: "revoke", client: c })}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {can("api_clients", "delete") && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={t("common.delete")} aria-label={t("common.delete")}
                          onClick={() => setConfirm({ kind: "delete", client: c })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataCard>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={create} className="space-y-3">
            <DialogHeader>
              <DialogTitle>{t("clients.new")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="client-name" className="text-xs">{t("common.name")}</Label>
              <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-desc" className="text-xs">{t("common.description")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
              <Textarea id="client-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm rotate / revoke / delete */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !acting) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              className={confirm?.kind === "rotate" ? "" : "bg-destructive text-white hover:bg-destructive/90"}
              onClick={(e) => { e.preventDefault(); runConfirm() }}
            >
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* One-time key display */}
      <KeyOnceDialog secret={secret} onClose={() => setSecret(null)} />
    </>
  )
}

function KeyOnceDialog({ secret, onClose }: { secret: { name: string; key: string } | null; onClose: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => { setCopied(false) }, [secret?.key])

  const copy = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.key)
      setCopied(true)
      toast.success(t("common.copied"))
    } catch {
      toast.error(t("account.clients.copyFailed"))
    }
  }

  return (
    <Dialog open={!!secret} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("account.clients.keyTitle", { name: secret?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("clients.keyOnce")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {secret?.key}
          </code>
          <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={t("common.copy")} title={t("common.copy")}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("account.clients.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
