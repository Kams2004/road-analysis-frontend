"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Loader2, RefreshCw, X } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorText, listAudit, type AuditRow } from "@/lib/auth-api"
import { useI18n } from "@/lib/i18n"

const DEFAULT_PAGE_SIZE = 50

interface Filters {
  actor: string
  action: string
  outcome: "all" | "success" | "failure"
  date_from: string
  date_to: string
}
const EMPTY: Filters = { actor: "", action: "", outcome: "all", date_from: "", date_to: "" }

export default function AuditPage() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
          <RequirePermission module="audit">
            <AuditTrail />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

/** datetime-local value (local time, no zone) → ISO string with zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined)

function AuditTrail() {
  const { t, locale } = useI18n()
  const [draft, setDraft] = useState<Filters>(EMPTY)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [data, setData] = useState<{ total: number; items: AuditRow[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listAudit({
        actor: filters.actor.trim(),
        action: filters.action.trim(),
        outcome: filters.outcome,
        date_from: toIso(filters.date_from),
        date_to: toIso(filters.date_to),
        skip: page * pageSize,
        limit: pageSize,
      }))
    } catch (err) {
      toast.error(errorText(t, err))
      setData((d) => d ?? { total: 0, items: [] })
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize, t])

  useEffect(() => { load() }, [filters, page, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault()
    setPage(0)
    setExpanded(null)
    setFilters({ ...draft })
  }
  const clear = () => { setDraft(EMPTY); setPage(0); setExpanded(null); setFilters(EMPTY) }

  const total = data?.total ?? 0

  return (
    <DataCard>
      <form onSubmit={apply}>
        <DataToolbar
          search={draft.actor}
          onSearch={(v) => setDraft((d) => ({ ...d, actor: v }))}
          placeholder={t("audit.actorFilter")}
          actions={
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("account.audit.refresh")}
            </Button>
          }
        >
          <Input
            id="f-action"
            aria-label={t("audit.actionPrefix")}
            placeholder={t("audit.actionPrefix")}
            className="h-9 w-full font-mono text-xs sm:w-48"
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
          <Select value={draft.outcome} onValueChange={(v) => setDraft({ ...draft, outcome: v as Filters["outcome"] })}>
            <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("audit.outcome")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("audit.outcome")}: {t("common.all")}</SelectItem>
              <SelectItem value="success">{t("audit.success")}</SelectItem>
              <SelectItem value="failure">{t("audit.failure")}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto">
            <span className="shrink-0">{t("audit.from")}</span>
            <Input id="f-from" type="datetime-local" className="h-9 w-full text-xs sm:w-48"
              value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </label>
          <label className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto">
            <span className="shrink-0">{t("audit.to")}</span>
            <Input id="f-to" type="datetime-local" className="h-9 w-full text-xs sm:w-48"
              value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="h-9">{t("common.search")}</Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={clear}
              title={t("account.audit.clear")} aria-label={t("account.audit.clear")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DataToolbar>
      </form>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-8 pl-4" />
            <TableHead>{t("audit.when")}</TableHead>
            <TableHead>{t("audit.actor")}</TableHead>
            <TableHead>{t("audit.action")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("audit.object")}</TableHead>
            <TableHead>{t("audit.outcome")}</TableHead>
            <TableHead className="hidden pr-4 md:table-cell">{t("audit.ip")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data === null ? (
            <TableRow>
              <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell>
            </TableRow>
          ) : data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">{t("audit.empty")}</TableCell>
            </TableRow>
          ) : (
            data.items.map((row) => {
              const open = expanded === row.id
              return (
                <Fragment key={row.id}>
                  <TableRow className="h-11 cursor-pointer" onClick={() => setExpanded(open ? null : row.id)} aria-expanded={open}>
                    <TableCell className="py-1.5 pl-4 text-muted-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString(locale)}</TableCell>
                    <TableCell className="max-w-[240px] py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm" title={row.actor_label ?? row.actor_id ?? ""}>
                          {row.actor_label ?? row.actor_id ?? t("account.audit.system")}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{row.actor_type}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5"><code className="font-mono text-xs">{row.action}</code></TableCell>
                    <TableCell className="hidden max-w-[220px] py-1.5 lg:table-cell">
                      {row.object_type ? (
                        <span className="block truncate text-xs" title={`${row.object_type}${row.object_id ? ` / ${row.object_id}` : ""}`}>
                          <span className="font-medium">{row.object_type}</span>
                          {row.object_id && <span className="font-mono text-muted-foreground"> / {row.object_id}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {row.outcome === "success" ? (
                        <StatusBadge tone="green">{t("audit.success")}</StatusBadge>
                      ) : (
                        <StatusBadge tone="red">{t("audit.failure")}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap py-1.5 pr-4 font-mono text-xs md:table-cell">{row.ip ?? "—"}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell />
                      <TableCell colSpan={6} className="space-y-3 whitespace-normal py-3 pr-4">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("audit.details")}</p>
                          {row.details && Object.keys(row.details).length ? (
                            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
                              {JSON.stringify(row.details, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-muted-foreground">{t("account.audit.noDetails")}</p>
                          )}
                        </div>
                        {row.object_id && (
                          <p className="break-all text-xs"><span className="text-muted-foreground">{t("audit.object")}: </span>
                            <span className="font-mono">{row.object_type} / {row.object_id}</span></p>
                        )}
                        <p className="break-all text-xs">
                          <span className="text-muted-foreground">{t("account.audit.userAgent")}: </span>
                          <span className="font-mono">{row.user_agent ?? "—"}</span>
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
          )}
        </TableBody>
      </Table>

      <TablePagination
        page={page + 1}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => { setExpanded(null); setPage(p - 1) }}
        onPageSizeChange={(n) => { setExpanded(null); setPageSize(n); setPage(0) }}
      />
    </DataCard>
  )
}
