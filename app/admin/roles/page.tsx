"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, KeyRound, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2, Users as UsersIcon } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { useAuth } from "@/components/auth-provider"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { DataCard, DataToolbar } from "@/components/data-toolbar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  createRole, deleteRole, errorText, listModules, listRoles, updateRole,
  type Action, type ModuleInfo, type PermissionRow, type RoleRow,
} from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"

const ACTIONS: Action[] = ["view", "add", "edit", "delete"]
const ACTION_LABEL: Record<Action, string> = {
  view: "roles.view", add: "roles.add", edit: "roles.edit_perm", delete: "roles.delete",
}
const FIELD: Record<Action, keyof Omit<PermissionRow, "module">> = {
  view: "can_view", add: "can_add", edit: "can_edit", delete: "can_delete",
}

type Matrix = Record<string, Record<Action, boolean>>

export default function RolesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <RequirePermission module="roles">
            <RolesAdmin />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

/** Translated module label with the API's English label as fallback. */
function useModuleLabel() {
  const { t } = useI18n()
  return useCallback((m: ModuleInfo) => {
    const key = `admin.module.${m.key}`
    const text = t(key)
    return text === key ? m.label : text
  }, [t])
}

function RolesAdmin() {
  const { t } = useI18n()
  const { can } = useAuth()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ open: boolean; role: RoleRow | null }>({ open: false, role: null })
  const [toDelete, setToDelete] = useState<RoleRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([listRoles(), listModules()])
      setRoles(r)
      setModules(m)
    } catch (e) {
      toast.error(errorText(t, e, "roles"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteRole(toDelete.id)
      toast.success(t("roles.deleted"))
      setToDelete(null)
      await load()
    } catch (e) {
      toast.error(errorText(t, e, "roles"))
    } finally {
      setDeleting(false)
    }
  }

  const canEdit = can("roles", "edit")
  const canDelete = can("roles", "delete")

  const [search, setSearch] = useState("")
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roles
    return roles.filter((r) => r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q))
  }, [roles, search])

  const activeCount = roles.filter((r) => r.is_active).length
  const mfaCount = roles.filter((r) => r.mfa_required).length

  return (
    <>
      <PageHeader title={t("roles.title")} description={t("roles.subtitle")} />

      {/* KPI cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={KeyRound} tone="blue" value={roles.length} label={t("admin.kpi.roles")} />
        <StatCard icon={CheckCircle2} tone="green" value={activeCount} label={t("admin.kpi.activeRoles")} />
        <StatCard icon={ShieldCheck} tone="purple" value={mfaCount} label={t("admin.kpi.mfaRoles")} />
      </div>

      <DataCard>
        <DataToolbar
          search={search}
          onSearch={setSearch}
          placeholder={t("admin.roles.searchPlaceholder")}
          actions={can("roles", "add") && (
            <Button size="sm" className="h-9" onClick={() => setEditor({ open: true, role: null })} disabled={modules.length === 0}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("roles.new")}
            </Button>
          )}
        />

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">{t("common.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("admin.roles.usersCol")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("admin.roles.modulesCol")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("roles.mfaRequired")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center">
                  <KeyRound className="mx-auto h-7 w-7 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("admin.roles.empty")}</p>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const granted = r.is_system ? modules.length : r.permissions.filter((p) => p.can_view).length
                return (
                  <TableRow key={r.id} className="h-11">
                    <TableCell className="max-w-[360px] py-1.5 pl-4">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span className="truncate">{r.name}</span>
                        {r.is_system && (
                          <Badge variant="outline" className="text-[10px]"><Lock />{t("roles.system")}</Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={r.description ?? undefined}>
                        {r.description || <span className="italic">{t("admin.roles.noDescription")}</span>}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <UsersIcon className="h-3.5 w-3.5" />
                        <span>{t("roles.users", { count: r.user_count })}</span>
                        <span>·</span>
                        <span>{t("roles.activeUsers", { count: r.active_user_count })}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground lg:table-cell">
                      {t("admin.roles.modulesGranted", { count: granted })}
                    </TableCell>
                    <TableCell className="hidden py-1.5 sm:table-cell">
                      {r.mfa_required ? (
                        <StatusBadge tone="blue" dot={false}>
                          <ShieldCheck className="h-3 w-3" />{t("roles.mfaRequired")}
                        </StatusBadge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {r.is_active ? (
                        <StatusBadge tone="green">{t("common.active")}</StatusBadge>
                      ) : (
                        <StatusBadge tone="slate">{t("common.inactive")}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            title={t("common.edit")} aria-label={t("common.edit")}
                            onClick={() => setEditor({ open: true, role: r })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && !r.is_system && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title={t("common.delete")} aria-label={t("common.delete")}
                            onClick={() => setToDelete(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </DataCard>

      <RoleDialog
        open={editor.open}
        role={editor.role}
        modules={modules}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        onSaved={() => { setEditor({ open: false, role: null }); load() }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.roles.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("roles.deleteConfirm", { name: toDelete?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDelete() }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

const emptyRow = (): Record<Action, boolean> => ({ view: false, add: false, edit: false, delete: false })

function RoleDialog({
  open, role, modules, onOpenChange, onSaved,
}: {
  open: boolean
  role: RoleRow | null
  modules: ModuleInfo[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const label = useModuleLabel()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [active, setActive] = useState(true)
  const [mfa, setMfa] = useState(false)
  const [matrix, setMatrix] = useState<Matrix>({})
  const [busy, setBusy] = useState(false)
  const system = !!role?.is_system

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? "")
    setDescription(role?.description ?? "")
    setActive(role?.is_active ?? true)
    setMfa(role?.mfa_required ?? false)
    const m: Matrix = {}
    for (const mod of modules) {
      const p = role?.permissions.find((x) => x.module === mod.key)
      const row = emptyRow()
      for (const a of mod.actions) row[a] = system || !!p?.[FIELD[a]]
      m[mod.key] = row
    }
    setMatrix(m)
  }, [open, role, modules, system])

  const groups = useMemo(() => {
    const out: { group: string; modules: ModuleInfo[] }[] = []
    for (const m of modules) {
      const g = out.find((x) => x.group === m.group)
      if (g) g.modules.push(m)
      else out.push({ group: m.group, modules: [m] })
    }
    return out
  }, [modules])

  const has = (m: ModuleInfo, a: Action) => m.actions.includes(a)

  /** Apply one cell change with the view ⇄ write implications. */
  const applyCell = (row: Record<Action, boolean>, mod: ModuleInfo, a: Action, on: boolean) => {
    const next = { ...row }
    if (!has(mod, a)) return next
    next[a] = on
    if (a !== "view" && on) next.view = true
    if (a === "view" && !on) for (const x of ACTIONS) next[x] = false
    return next
  }

  const setCell = (mod: ModuleInfo, a: Action, on: boolean) =>
    setMatrix((m) => ({ ...m, [mod.key]: applyCell(m[mod.key] ?? emptyRow(), mod, a, on) }))

  const rowState = (mod: ModuleInfo): boolean | "indeterminate" => {
    const row = matrix[mod.key] ?? emptyRow()
    const n = mod.actions.filter((a) => row[a]).length
    return n === 0 ? false : n === mod.actions.length ? true : "indeterminate"
  }
  const setRow = (mod: ModuleInfo, on: boolean) =>
    setMatrix((m) => {
      const row = emptyRow()
      if (on) for (const a of mod.actions) row[a] = true
      return { ...m, [mod.key]: row }
    })

  const colState = (a: Action): boolean | "indeterminate" => {
    const mods = modules.filter((m) => has(m, a))
    const n = mods.filter((m) => matrix[m.key]?.[a]).length
    return n === 0 ? false : n === mods.length ? true : "indeterminate"
  }
  const setCol = (a: Action, on: boolean) =>
    setMatrix((m) => {
      const next = { ...m }
      for (const mod of modules) if (has(mod, a)) next[mod.key] = applyCell(next[mod.key] ?? emptyRow(), mod, a, on)
      return next
    })

  const setAll = (on: boolean) => {
    const next: Matrix = {}
    for (const mod of modules) {
      const row = emptyRow()
      if (on) for (const a of mod.actions) row[a] = true
      next[mod.key] = row
    }
    setMatrix(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (system && role) {
        await updateRole(role.id, { description: description.trim() || null, mfa_required: mfa })
      } else {
        const permissions: PermissionRow[] = modules
          .filter((m) => matrix[m.key]?.view)
          .map((m) => {
            const r = matrix[m.key]
            return { module: m.key, can_view: r.view, can_add: r.add, can_edit: r.edit, can_delete: r.delete }
          })
        const body = {
          name: name.trim(), description: description.trim() || null, is_active: active, mfa_required: mfa, permissions,
        }
        if (role) await updateRole(role.id, body)
        else await createRole(body)
      }
      toast.success(role ? t("roles.updated") : t("roles.created"))
      onSaved()
    } catch (err) {
      toast.error(errorText(t, err, "roles"))
    } finally {
      setBusy(false)
    }
  }

  const ro = system || busy

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {role ? t("roles.edit") : t("roles.new")}
            {system && <Badge variant="outline"><Lock />{t("roles.system")}</Badge>}
          </DialogTitle>
          {system && <DialogDescription>{t("roles.systemHint")}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="role-name" className="text-xs">{t("common.name")}<span className="text-destructive">*</span></Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                disabled={system}
                placeholder={t("admin.roles.namePlaceholder")}
              />
            </div>
            <div className="flex h-9 items-center justify-between gap-3 rounded-md border border-border px-3 sm:mt-5">
              <Label htmlFor="role-active" className="cursor-pointer">{t("common.active")}</Label>
              <Switch id="role-active" checked={active} onCheckedChange={setActive} disabled={system} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="role-desc" className="text-xs">{t("common.description")}</Label>
              <Textarea
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="role-mfa" className="flex cursor-pointer items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />{t("roles.mfaRequired")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("roles.mfaRequiredHint")}</p>
              </div>
              <Switch id="role-mfa" checked={mfa} onCheckedChange={setMfa} />
            </div>
          </div>

          {/* Permission matrix */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t("admin.roles.permissions")}</h3>
                <p className="text-xs text-muted-foreground">
                  {system ? t("admin.roles.readOnly") : t("roles.writeImpliesView")}
                </p>
              </div>
              {!system && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)} disabled={busy}>
                    {t("admin.roles.selectAll")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)} disabled={busy}>
                    {t("admin.roles.clearAll")}
                  </Button>
                </div>
              )}
            </div>

            {/* Desktop / tablet: table */}
            <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("roles.module")}</th>
                    {ACTIONS.map((a) => (
                      <th key={a} className="w-20 px-2 py-2 text-center font-medium text-muted-foreground">
                        <div className="flex flex-col items-center gap-1.5">
                          <span>{t(ACTION_LABEL[a])}</span>
                          <Checkbox
                            checked={colState(a)}
                            onCheckedChange={(c) => setCol(a, c === true)}
                            disabled={ro}
                            aria-label={`${t("admin.roles.selectAll")} — ${t(ACTION_LABEL[a])}`}
                          />
                        </div>
                      </th>
                    ))}
                    <th className="w-16 px-2 py-2 text-center font-medium text-muted-foreground">
                      {t("admin.roles.rowAll")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupRows key={g.group} group={g.group}>
                      {g.modules.map((m) => (
                        <tr key={m.key} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2 text-foreground">{label(m)}</td>
                          {ACTIONS.map((a) => (
                            <td key={a} className="px-2 py-2 text-center">
                              {has(m, a) ? (
                                <Checkbox
                                  checked={!!matrix[m.key]?.[a]}
                                  onCheckedChange={(c) => setCell(m, a, c === true)}
                                  disabled={ro}
                                  aria-label={`${label(m)} — ${t(ACTION_LABEL[a])}`}
                                />
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <Checkbox
                              checked={rowState(m)}
                              onCheckedChange={(c) => setRow(m, c === true)}
                              disabled={ro}
                              aria-label={`${label(m)} — ${t("admin.roles.rowAll")}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </GroupRows>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards */}
            <div className="space-y-4 sm:hidden">
              {groups.map((g) => (
                <div key={g.group} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupLabel(t, g.group)}
                  </div>
                  {g.modules.map((m) => (
                    <div key={m.key} className="rounded-md border border-border p-3">
                      <label className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                        {label(m)}
                        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                          {t("admin.roles.rowAll")}
                          <Checkbox
                            checked={rowState(m)}
                            onCheckedChange={(c) => setRow(m, c === true)}
                            disabled={ro}
                          />
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {m.actions.map((a) => (
                          <label
                            key={a}
                            className="flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs"
                          >
                            <Checkbox
                              checked={!!matrix[m.key]?.[a]}
                              onCheckedChange={(c) => setCell(m, a, c === true)}
                              disabled={ro}
                            />
                            {t(ACTION_LABEL[a])}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || (!system && !name.trim())}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {role ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function groupLabel(t: (k: string) => string, group: string) {
  const key = `admin.group.${group}`
  const text = t(key)
  return text === key ? group : text
}

function GroupRows({ group, children }: { group: string; children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <>
      <tr className="border-b border-border bg-muted/20">
        <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {groupLabel(t, group)}
        </td>
      </tr>
      {children}
    </>
  )
}
