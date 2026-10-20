"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Ban, CheckCircle2, Copy, KeyRound, Loader2, Lock, MoreHorizontal,
  Briefcase, Pencil, Plus, ShieldCheck, ShieldOff, Smartphone, Trash2, Unlock, Users as UsersIcon,
} from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { PasswordInput } from "@/components/password-input"
import { useAuth } from "@/components/auth-provider"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  adminSetPassword, createUser, deleteUser, errorText, listRoles, listUsers, resetUserMfa, unlockUser,
  updateUser, type MapProviderPref, type RoleRow, type UserInput, type UserRow,
} from "@/lib/auth-api"
import { LANGS, useI18n, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const DEFAULT_PAGE_SIZE = 25
const MAP_PROVIDERS: MapProviderPref[] = ["default", "osm", "google"]

const isLocked = (u: UserRow) => !!u.locked_until && new Date(u.locked_until).getTime() > Date.now()

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <RequirePermission module="users">
            <UsersAdmin />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

function UsersAdmin() {
  const { t, locale } = useI18n()
  const { user: me, can } = useAuth()

  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [status, setStatus] = useState("all")
  const [roleId, setRoleId] = useState("all")
  const [accountType, setAccountType] = useState("all")
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [items, setItems] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [allTotal, setAllTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const reqId = useRef(0)

  // Dialog state
  const [form, setForm] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null })
  const [link, setLink] = useState<{ title: string; hint: string; url: string } | null>(null)
  const [pwdUser, setPwdUser] = useState<UserRow | null>(null)
  const [confirm, setConfirm] = useState<{ kind: "delete" | "mfa"; user: UserRow } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  useEffect(() => {
    const h = setTimeout(() => { setDebounced(search.trim()); setPage(0) }, 300)
    return () => clearTimeout(h)
  }, [search])

  useEffect(() => {
    listRoles().then(setRoles).catch(() => setRoles([]))
  }, [])

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await listUsers({
        search: debounced, status, role_id: roleId, account_type: accountType, skip: page * pageSize, limit: pageSize,
      })
      if (id !== reqId.current) return
      setItems(res.items)
      setTotal(res.total)
      // Unfiltered list → remember the overall user count for the KPI card.
      if (!debounced && status === "all" && roleId === "all" && accountType === "all") setAllTotal(res.total)
    } catch (e) {
      if (id === reqId.current) toast.error(errorText(t, e, "users"))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [debounced, status, roleId, accountType, page, pageSize, t])

  useEffect(() => { load() }, [load])

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : t("common.never")

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      await load()
    } catch (e) {
      toast.error(errorText(t, e, "users"))
    }
  }

  const doConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    const { kind, user } = confirm
    if (kind === "delete") await run(() => deleteUser(user.id), t("users.deleted"))
    else await run(() => resetUserMfa(user.id), t("admin.users.mfaReset"))
    setConfirmBusy(false)
    setConfirm(null)
  }

  const canEdit = can("users", "edit")
  const canDelete = can("users", "delete")

  const admins = roles.filter((r) => r.is_system).reduce((n, r) => n + r.user_count, 0)
  const activeRoles = roles.filter((r) => r.is_active).length

  return (
    <>
      <PageHeader title={t("users.title")} description={t("users.subtitle")} />

      {/* KPI cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={UsersIcon} tone="blue" value={allTotal ?? total} label={t("admin.kpi.users")} />
        <StatCard icon={ShieldCheck} tone="purple" value={admins} label={t("admin.kpi.admins")} />
        <StatCard icon={KeyRound} tone="teal" value={roles.length} label={t("admin.kpi.roles")} />
        <StatCard icon={CheckCircle2} tone="green" value={activeRoles} label={t("admin.kpi.activeRoles")} />
      </div>

      <DataCard>
        <DataToolbar
          search={search}
          onSearch={setSearch}
          placeholder={t("users.searchPlaceholder")}
          actions={can("users", "add") && (
            <Button size="sm" className="h-9" onClick={() => setForm({ open: true, user: null })}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("users.new")}
            </Button>
          )}
        >
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
            <SelectTrigger className={TOOLBAR_SELECT}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.users.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("common.active")}</SelectItem>
              <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleId} onValueChange={(v) => { setRoleId(v); setPage(0) }}>
            <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.users.allRoles")}</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}{!r.is_active && ` (${t("admin.users.roleInactive")})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountType} onValueChange={(v) => { setAccountType(v); setPage(0) }}>
            <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("admin.users.accountType")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.users.allAccountTypes")}</SelectItem>
              <SelectItem value="staff">{t("admin.users.accountStaff")}</SelectItem>
              <SelectItem value="mobile">{t("admin.users.accountMobile")}</SelectItem>
            </SelectContent>
          </Select>
        </DataToolbar>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">{t("common.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("common.email")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("admin.users.contact")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("users.roles")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("users.mfa")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("users.lastLogin")}</TableHead>
              <TableHead className="w-12 pr-4 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center">
                  <UsersIcon className="mx-auto h-7 w-7 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("users.empty")}</p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((u) => {
                const self = u.id === me?.id
                const locked = isLocked(u)
                return (
                  <TableRow key={u.id} className={cn("h-11", loading && "opacity-60")}>
                    <TableCell className="py-1.5 pl-4">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {u.full_name}
                        {self && <Badge variant="outline" className="text-[10px]">{t("admin.users.you")}</Badge>}
                        {u.account_type === "mobile" ? (
                          <StatusBadge tone="purple" dot={false} className="text-[10px]">
                            <Smartphone className="h-3 w-3" />{t("admin.users.accountMobile")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="slate" dot={false} className="text-[10px]">
                            <Briefcase className="h-3 w-3" />{t("admin.users.accountStaff")}
                          </StatusBadge>
                        )}
                      </div>
                      {u.username && <div className="text-xs text-muted-foreground">@{u.username}</div>}
                      <div className="text-xs text-muted-foreground md:hidden">{u.email}</div>
                    </TableCell>
                    <TableCell className="hidden py-1.5 md:table-cell">{u.email}</TableCell>
                    <TableCell className="hidden py-1.5 text-muted-foreground xl:table-cell">
                      {u.phone || u.whatsapp ? (
                        <div className="space-y-0.5">
                          {u.phone && <div>{u.phone}</div>}
                          {u.whatsapp && u.whatsapp !== u.phone && (
                            <div className="text-xs">WhatsApp: {u.whatsapp}</div>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="hidden py-1.5 lg:table-cell">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("users.noRoles")}</span>
                        ) : u.roles.map((r) => (
                          <Badge key={r.id} variant="secondary" className="text-xs font-normal">{r.name}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {u.status === "active" ? (
                          <StatusBadge tone="green">{t("common.active")}</StatusBadge>
                        ) : (
                          <StatusBadge tone="slate">{t("common.inactive")}</StatusBadge>
                        )}
                        {locked && (
                          <span title={t("admin.users.lockedUntil", { time: fmtDate(u.locked_until) })}>
                            <StatusBadge tone="red" dot={false}>
                              <Lock className="h-3 w-3" />{t("users.locked")}
                            </StatusBadge>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-1.5 md:table-cell">
                      {u.mfa_enabled ? (
                        <StatusBadge tone="blue" dot={false}>
                          <ShieldCheck className="h-3 w-3" />{t("admin.users.mfaOn")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="slate">{t("admin.users.mfaOff")}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground lg:table-cell">
                      {fmtDate(u.last_login_at)}
                    </TableCell>
                    <TableCell className="py-1.5 pr-4 text-right">
                      {(canEdit || (canDelete && !self)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("common.actions")}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canEdit && (
                              <>
                                <DropdownMenuItem onSelect={() => setForm({ open: true, user: u })}>
                                  <Pencil className="mr-2 h-4 w-4" />{t("common.edit")}
                                </DropdownMenuItem>
                                {!self && (
                                  u.status === "active" ? (
                                    <DropdownMenuItem onSelect={() =>
                                      run(() => updateUser(u.id, { status: "inactive" }), t("admin.users.deactivated"))}>
                                      <Ban className="mr-2 h-4 w-4" />{t("users.deactivate")}
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onSelect={() =>
                                      run(() => updateUser(u.id, { status: "active" }), t("admin.users.activated"))}>
                                      <CheckCircle2 className="mr-2 h-4 w-4" />{t("users.activate")}
                                    </DropdownMenuItem>
                                  )
                                )}
                                <DropdownMenuItem onSelect={() => setPwdUser(u)}>
                                  <KeyRound className="mr-2 h-4 w-4" />{t("users.resetPassword")}
                                </DropdownMenuItem>
                                {locked && (
                                  <DropdownMenuItem onSelect={() => run(() => unlockUser(u.id), t("admin.users.unlocked"))}>
                                    <Unlock className="mr-2 h-4 w-4" />{t("users.unlock")}
                                  </DropdownMenuItem>
                                )}
                                {u.mfa_enabled && (
                                  <DropdownMenuItem onSelect={() => setConfirm({ kind: "mfa", user: u })}>
                                    <ShieldOff className="mr-2 h-4 w-4" />{t("users.resetMfa")}
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {canDelete && !self && (
                              <>
                                {canEdit && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => setConfirm({ kind: "delete", user: u })}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <TablePagination
          page={page + 1}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setPage(p - 1)}
          onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
          pageSizes={[25, 50, 100]}
        />
      </DataCard>

      <UserFormDialog
        open={form.open}
        user={form.user}
        roles={roles}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        onSaved={(invite) => {
          setForm({ open: false, user: null })
          if (invite) setLink(invite)
          load()
        }}
      />

      <PasswordDialog
        user={pwdUser}
        onClose={() => setPwdUser(null)}
        onLink={(url) => setLink({ title: t("admin.users.resetTitle"), hint: t("admin.users.resetLinkHint"), url })}
      />

      <LinkDialog link={link} onClose={() => setLink(null)} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !confirmBusy) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" ? t("admin.users.deleteTitle") : t("admin.users.resetMfaTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (confirm.kind === "delete"
                ? t("users.deleteConfirm", { name: confirm.user.full_name })
                : t("users.resetMfaConfirm", { name: confirm.user.full_name }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              onClick={(e) => { e.preventDefault(); doConfirm() }}
              className={confirm?.kind === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {confirmBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm?.kind === "delete" ? t("common.delete") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Create / edit dialog ─────────────────────────────────────────────────────

interface FormState {
  email: string
  username: string
  full_name: string
  phone: string
  whatsapp: string
  status: "active" | "inactive"
  language: Lang
  map_provider: MapProviderPref
  role_ids: string[]
  password: string
  send_invite: boolean
}

const emptyForm = (lang: Lang): FormState => ({
  email: "", username: "", full_name: "", phone: "", whatsapp: "", status: "active",
  language: lang, map_provider: "default", role_ids: [], password: "", send_invite: false,
})

function UserFormDialog({
  open, user, roles, onOpenChange, onSaved,
}: {
  open: boolean
  user: UserRow | null
  roles: RoleRow[]
  onOpenChange: (open: boolean) => void
  onSaved: (invite: { title: string; hint: string; url: string } | null) => void
}) {
  const { t, lang } = useI18n()
  const [f, setF] = useState<FormState>(emptyForm(lang))
  const [busy, setBusy] = useState(false)
  const editing = !!user

  useEffect(() => {
    if (!open) return
    setF(user ? {
      email: user.email, username: user.username ?? "", full_name: user.full_name, phone: user.phone ?? "",
      whatsapp: user.whatsapp ?? "", status: user.status, language: user.language, map_provider: user.map_provider,
      role_ids: user.roles.map((r) => r.id), password: "", send_invite: false,
    } : emptyForm(lang))
  }, [open, user, lang])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const toggleRole = (id: string, on: boolean) =>
    setF((s) => ({ ...s, role_ids: on ? [...s.role_ids, id] : s.role_ids.filter((r) => r !== id) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body: UserInput = {
      email: f.email.trim(),
      username: f.username.trim() || null,
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      whatsapp: f.whatsapp.trim() || null,
      status: f.status,
      language: f.language,
      map_provider: f.map_provider,
      role_ids: f.role_ids,
    }
    setBusy(true)
    try {
      if (user) {
        await updateUser(user.id, body)
        toast.success(t("users.updated"))
        onSaved(null)
      } else {
        const res = await createUser({
          ...body,
          password: f.send_invite ? null : f.password,
          send_invite: f.send_invite,
        })
        toast.success(t("users.created"))
        if (res.invite_link) {
          onSaved({
            title: t("admin.users.inviteTitle"),
            hint: t("users.inviteLink", { error: res.invite_error ?? "" }),
            url: res.invite_link,
          })
        } else {
          if (f.send_invite) toast.success(t("admin.users.inviteSent"))
          onSaved(null)
        }
      }
    } catch (err) {
      toast.error(errorText(t, err, "users"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("users.edit") : t("users.new")}</DialogTitle>
          {editing && <DialogDescription>{user?.email}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("profile.fullName")} required>
              <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} required maxLength={200} />
            </Field>
            <Field label={t("common.email")} required>
              <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required autoComplete="off" />
            </Field>
            <Field label={t("users.username")} hint={t("admin.users.usernameHint")}>
              <Input value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="off"
                placeholder={t("common.optional")} />
            </Field>
            <Field label={t("profile.phone")}>
              <Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+237…" />
            </Field>
            <Field label={t("profile.whatsapp")}>
              <Input type="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+237…" />
            </Field>
            <Field label={t("common.status")}>
              <Select value={f.status} onValueChange={(v) => set("status", v as FormState["status"])}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("common.active")}</SelectItem>
                  <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("profile.language")}>
              <Select value={f.language} onValueChange={(v) => set("language", v as Lang)}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => <SelectItem key={l} value={l}>{t(`lang.${l}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("profile.mapProvider")}>
              <Select value={f.map_provider} onValueChange={(v) => set("map_provider", v as MapProviderPref)}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAP_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{t(`map.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>{t("users.roles")}</Label>
            <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
              {roles.length === 0 && <span className="text-sm text-muted-foreground">{t("users.noRoles")}</span>}
              {roles.map((r) => {
                const checked = f.role_ids.includes(r.id)
                return (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 ${
                      r.is_active ? "" : "opacity-60"}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={(c) => toggleRole(r.id, c === true)} className="mt-0.5" />
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={r.is_active ? "" : "line-through decoration-muted-foreground/50"}>{r.name}</span>
                      {r.is_system && <Badge variant="outline" className="text-[10px]">{t("roles.system")}</Badge>}
                      {!r.is_active && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("admin.users.roleInactive")}</Badge>
                      )}
                      {r.mfa_required && <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label={t("roles.mfaRequired")} />}
                    </span>
                  </label>
                )
              })}
            </div>
            {roles.some((r) => !r.is_active) && (
              <p className="text-xs text-muted-foreground">{t("admin.users.rolesHint")}</p>
            )}
          </div>

          {/* Password (create only) */}
          {!editing && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={f.send_invite}
                  onCheckedChange={(c) => set("send_invite", c === true)}
                  className="mt-0.5"
                />
                {t("users.sendInvite")}
              </label>
              {!f.send_invite && (
                <Field label={t("users.initialPassword")} required>
                  <PasswordInput
                    value={f.password}
                    onChange={(e) => set("password", e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </Field>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── Reset password dialog ────────────────────────────────────────────────────

function PasswordDialog({
  user, onClose, onLink,
}: { user: UserRow | null; onClose: () => void; onLink: (url: string) => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<"set" | "email">("email")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (user) { setMode("email"); setPassword("") } }, [user])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      const res = await adminSetPassword(
        user.id, mode === "set" ? { new_password: password } : { send_reset_email: true },
      )
      onClose()
      if (res.reset_link) onLink(res.reset_link)
      else toast.success(mode === "set" ? t("admin.users.passwordSet") : t("admin.users.resetSent"))
    } catch (err) {
      toast.error(errorText(t, err, "users"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.resetPassword")}</DialogTitle>
          <DialogDescription>{user?.full_name} · {user?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "set" | "email")}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="email" />
              {t("users.sendResetEmail")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="set" />
              {t("users.setPassword")}
            </label>
          </RadioGroup>
          {mode === "set" && (
            <div className="space-y-1.5">
              <Label>{t("admin.users.newPassword")}</Label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy || (mode === "set" && !password)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── One-time link dialog ─────────────────────────────────────────────────────

function LinkDialog({
  link, onClose,
}: { link: { title: string; hint: string; url: string } | null; onClose: () => void }) {
  const { t } = useI18n()
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success(t("common.copied"))
    } catch {
      toast.error(t("common.error"))
    }
  }
  return (
    <Dialog open={!!link} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link?.title}</DialogTitle>
          <DialogDescription>{link?.hint}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="mr-2 h-4 w-4" />{t("common.copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

