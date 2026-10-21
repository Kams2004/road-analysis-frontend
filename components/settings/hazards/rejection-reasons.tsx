"use client"

/**
 * Settings → Module 6 · Hazards → Rejection reasons: every reason offered
 * when rejecting a detection, grouped by detection type, with its kind
 * (what the rejection teaches the training set, see RejectionKind).
 * System reasons are read-only; custom reasons can be edited (PATCH
 * /rejection-reasons/{id}: changing the kind re-files their past training
 * samples) and new custom reasons can be added.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Ban, Loader2, Pencil, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionCard } from "@/components/section-card"
import { LoadingBlock } from "@/components/settings/form-kit"
import { useM6Labels } from "@/components/m6-shared"
import {
  REJECTION_KINDS, createRejectionReason, fetchRejectionReasons, updateRejectionReason,
  type RejectionKind, type RejectionReason,
} from "@/lib/api"
import { DETECTION_TYPES } from "@/lib/module6-api"
import { cn } from "@/lib/utils"

export const KIND_BADGE: Record<RejectionKind, string> = {
  false_positive: "border-destructive/30 bg-destructive/10 text-destructive",
  real_redundant: "border-info/30 bg-info/10 text-info",
  unusable: "border-border bg-muted text-muted-foreground",
}

export const kindOf = (r: Pick<RejectionReason, "kind">): RejectionKind => r.kind ?? "false_positive"

export function RejectionKindBadge({ kind, className }: { kind: RejectionKind; className?: string }) {
  const { t } = useM6Labels()
  return (
    <Badge variant="outline" title={t(`rej.kind.${kind}.help`)} className={cn("whitespace-nowrap text-[10px]", KIND_BADGE[kind], className)}>
      {t(`rej.kind.${kind}.short`)}
    </Badge>
  )
}

function KindSelect({ value, onChange, disabled, className }: {
  value: RejectionKind; onChange: (k: RejectionKind) => void; disabled?: boolean; className?: string
}) {
  const { t } = useM6Labels()
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RejectionKind)} disabled={disabled}>
      <SelectTrigger className={cn("h-8 w-full text-xs", className)} aria-label={t("rej.kind.label")}><SelectValue /></SelectTrigger>
      <SelectContent>
        {REJECTION_KINDS.map((k) => (
          <SelectItem key={k} value={k} className="text-xs">{t(`rej.kind.${k}`)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const toCode = (label: string) => label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

interface Draft { label: string; description: string; kind: RejectionKind }

export function RejectionReasonsSettings({ readOnly }: { readOnly: boolean }) {
  const { t, tl, typeLabel } = useM6Labels()
  const [reasons, setReasons] = useState<RejectionReason[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ label: "", description: "", kind: "false_positive" })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setReasons(await fetchRejectionReasons())
    } catch (err) {
      setReasons([])
      toast.error(t("rr.loadFailed"), { description: err instanceof Error ? err.message : undefined })
    }
  }, [t])
  useEffect(() => { void load() }, [load])

  const byType = useMemo(() => {
    const types = [...DETECTION_TYPES, ...new Set((reasons ?? []).map((r) => r.detection_type))]
    return [...new Set(types)].map((type) => ({
      type,
      items: (reasons ?? []).filter((r) => r.detection_type === type)
        .sort((a, b) => REJECTION_KINDS.indexOf(kindOf(a)) - REJECTION_KINDS.indexOf(kindOf(b))
          || Number(a.is_custom) - Number(b.is_custom) || a.code.localeCompare(b.code)),
    }))
  }, [reasons])

  const startEdit = (r: RejectionReason) => {
    setEditing(r.id)
    setDraft({ label: r.label, description: r.description ?? "", kind: kindOf(r) })
  }

  const save = async (r: RejectionReason) => {
    const body: { label?: string; description?: string; kind?: RejectionKind } = {}
    if (draft.label.trim() && draft.label.trim() !== r.label) body.label = draft.label.trim()
    if (draft.description.trim() !== (r.description ?? "")) body.description = draft.description.trim()
    if (draft.kind !== kindOf(r)) body.kind = draft.kind
    if (!Object.keys(body).length) { setEditing(null); return }
    setBusy(true)
    try {
      const updated = await updateRejectionReason(r.id, body)
      setReasons((xs) => (xs ?? []).map((x) => (x.id === r.id ? { ...x, ...updated } : x)))
      setEditing(null)
      toast.success(t("rr.saved"), body.kind ? { description: t("rr.kindChanged") } : undefined)
    } catch (err) {
      toast.error(t("rr.saveFailed"), { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  if (reasons === null) return <LoadingBlock />

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("rr.intro")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {REJECTION_KINDS.map((k) => (
          <div key={k} className="rounded-lg border bg-card p-3">
            <RejectionKindBadge kind={k} />
            <p className="mt-1.5 text-sm font-medium">{t(`rej.kind.${k}`)}</p>
            <p className="text-xs text-muted-foreground">{t(`rej.kind.${k}.help`)}</p>
          </div>
        ))}
      </div>

      {!readOnly && <AddReasonCard onAdded={(r) => setReasons((xs) => [...(xs ?? []), r])} />}

      {byType.map(({ type, items }) => (
        <SectionCard key={type} id={`reasons-${type}`} icon={Ban} tone="slate" title={typeLabel(type)}
          badge={<Badge variant="secondary" className="text-[10px]">{items.length}</Badge>} contentClassName="p-0">
          {!items.length ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t("rr.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{t("rr.col.label")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("rr.col.description")}</TableHead>
                    <TableHead className="w-60">{t("rr.col.kind")}</TableHead>
                    <TableHead className="w-24">{t("rr.col.origin")}</TableHead>
                    <TableHead className="w-24 pr-5 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => {
                    const isEditing = editing === r.id
                    const kind = kindOf(r)
                    return (
                      <TableRow key={r.id} className="align-top">
                        <TableCell className="pl-5">
                          {isEditing ? (
                            <Input className="h-8 text-sm" value={draft.label} aria-label={t("rr.col.label")}
                              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                          ) : (
                            <span className="block text-sm font-medium">{tl(`rej.code.${r.code}`, r.label)}</span>
                          )}
                          <code className="text-[11px] text-muted-foreground">{r.code}</code>
                        </TableCell>
                        <TableCell className="hidden max-w-xs md:table-cell">
                          {isEditing ? (
                            <Input className="h-8 text-sm" value={draft.description} aria-label={t("rr.col.description")}
                              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                          ) : (
                            <span className="text-xs text-muted-foreground">{r.description && r.description !== r.label ? r.description : "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <KindSelect value={draft.kind} onChange={(k) => setDraft((d) => ({ ...d, kind: k }))} disabled={busy} />
                          ) : (
                            <span title={r.is_custom ? undefined : t("rr.systemFixed")}><RejectionKindBadge kind={kind} /></span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{r.is_custom ? t("rr.custom") : t("rr.system")}</span>
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          {r.is_custom && !readOnly && (isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" className="h-8" disabled={busy || !draft.label.trim()} onClick={() => void save(r)}>
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{t("rr.save")}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-8" title={t("rr.edit")} aria-label={t("rr.edit")} onClick={() => startEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  )
}

function AddReasonCard({ onAdded }: { onAdded: (r: RejectionReason) => void }) {
  const { t, typeLabel } = useM6Labels()
  const [type, setType] = useState<string>(DETECTION_TYPES[0])
  const [label, setLabel] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<RejectionKind>("false_positive")
  const [busy, setBusy] = useState(false)
  const code = toCode(label)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) return
    setBusy(true)
    try {
      const created = await createRejectionReason({
        detection_type: type, code, label: label.trim(), description: description.trim() || label.trim(), kind,
      })
      onAdded(created)
      setLabel("")
      setDescription("")
      setKind("false_positive")
      toast.success(t("rr.added"))
    } catch (err) {
      toast.error(t("rr.addFailed"), { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard id="add-reason" icon={Plus} tone="blue" title={t("rr.add.title")} description={t("rr.add.desc")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("rr.add.type")}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DETECTION_TYPES.map((ty) => <SelectItem key={ty} value={ty} className="text-xs">{typeLabel(ty)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rr-label" className="text-xs">{t("rr.add.label")}</Label>
          <Input id="rr-label" className="h-8 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          {code && <p className="text-[11px] text-muted-foreground">{t("rr.add.code", { code })}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rr-desc" className="text-xs">{t("rr.add.description")}</Label>
          <Input id="rr-desc" className="h-8 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("rej.kind.label")}</Label>
          <KindSelect value={kind} onChange={setKind} />
          <p className="text-[11px] text-muted-foreground">{t(`rej.kind.${kind}.help`)}</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="sm" disabled={busy || !code}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("rr.add.submit")}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
