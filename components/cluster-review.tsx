"use client"

/**
 * Cluster-first review building blocks shared by the Validations page and the
 * Hazard Track: the hazard status badge (candidate — Validations only — /
 * confirmed / resolved), the member counts line ("5 detections · 3 validated · 2
 * pending"), and the Accept cluster / Reject cluster dialogs
 * (POST /hazards/{id}/accept|reject) with a toast of the decision counts.
 */
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle, CheckCircle2, CircleDashed, Loader2, ShieldCheck, XCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useM6Labels } from "@/components/m6-shared"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { KIND_BADGE, kindOf } from "@/components/settings/hazards/rejection-reasons"
import { errorText } from "@/lib/auth-api"
import { fetchRejectionReasons, REJECTION_KINDS, type RejectionReason } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  acceptCluster, rejectCluster, type ClusterDecision, type Hazard, type MemberCounts,
} from "@/lib/module6-api"

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { tone: BadgeTone; Icon: LucideIcon }> = {
  candidate: { tone: "amber", Icon: CircleDashed },
  active: { tone: "red", Icon: ShieldCheck },
  resolved: { tone: "green", Icon: CheckCircle2 },
  dismissed: { tone: "slate", Icon: Ban },
}

/** "Candidate" / "Confirmed" / "Resolved" / "Dismissed" pill of a hazard. */
export function HazardStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const { t, tl } = useM6Labels()
  if (!status) return null
  const st = STATUS_STYLE[status] ?? { tone: "slate" as BadgeTone, Icon: CircleDashed }
  return (
    <Pill tone={st.tone} dot={false} className={cn("gap-1", className)}>
      <span className="inline-flex items-center gap-1" title={tl(`cr.hs.${status}.title`, "")}>
        <st.Icon className="h-3 w-3" />{tl(`cr.hs.${status}`, t(`m6.status.${status}`))}
      </span>
    </Pill>
  )
}

// ── Member counts ────────────────────────────────────────────────────────────

/** Members by review status, from `member_counts` (zeros when absent). */
export function memberCounts(h: Pick<Hazard, "member_counts">): MemberCounts {
  const m = h.member_counts ?? null
  return {
    pending: m?.pending ?? 0, location_pending: m?.location_pending ?? 0, validated: m?.validated ?? 0,
    corrected: m?.corrected ?? 0, resolved: m?.resolved ?? 0, rejected: m?.rejected ?? 0,
  }
}

/** Unreviewed members (pending + location_pending). */
export const pendingOf = (h: Pick<Hazard, "member_counts" | "pending_count">) => {
  if (typeof h.pending_count === "number") return h.pending_count
  const m = memberCounts(h)
  return m.pending + m.location_pending
}

/** "5 detections · 3 validated · 2 pending" (zero parts omitted). */
export function useMemberCountsText() {
  const { t } = useM6Labels()
  return (h: Pick<Hazard, "member_counts" | "detection_count">, opts: { withTotal?: boolean } = {}) => {
    const m = memberCounts(h)
    const parts: string[] = []
    if (opts.withTotal !== false) parts.push(t("cr.mc.detections", { n: h.detection_count }))
    if (!h.member_counts) return parts.join(" · ")
    const validated = m.validated + m.corrected
    if (validated) parts.push(t("cr.mc.validated", { n: validated }))
    if (m.pending) parts.push(t("cr.mc.pending", { n: m.pending }))
    if (m.location_pending) parts.push(t("cr.mc.location", { n: m.location_pending }))
    if (m.resolved) parts.push(t("cr.mc.resolved", { n: m.resolved }))
    if (m.rejected) parts.push(t("cr.mc.rejected", { n: m.rejected }))
    return parts.join(" · ")
  }
}

export function MemberCountsLine({ h, className }: { h: Pick<Hazard, "member_counts" | "detection_count">; className?: string }) {
  const text = useMemberCountsText()
  return <p className={cn("text-[11px] text-muted-foreground", className)}>{text(h)}</p>
}

// ── Decision toast ───────────────────────────────────────────────────────────

export function useDecisionToast() {
  const { t } = useM6Labels()
  /** `prevCode`: the cluster's code before the decision (a candidate's CL- code). */
  return (r: ClusterDecision, kind: "accept" | "reject", prevCode?: string) => {
    const parts: string[] = []
    if (r.accepted) parts.push(t("cr.toast.accepted", { n: r.accepted }))
    if (r.auto_validated) parts.push(t("cr.toast.autoValidated", { n: r.auto_validated }))
    if (r.rejected) parts.push(t("cr.toast.rejected", { n: r.rejected }))
    if (r.skipped) parts.push(t("cr.toast.skipped", { n: r.skipped }))
    const head = kind === "accept"
      ? prevCode && prevCode !== r.hazard_code
        ? t("cr.toast.confirmedAs", { prev: prevCode, code: r.hazard_code })
        : t("cr.toast.acceptTitle", { code: r.hazard_code })
      : r.hazard_status === "deleted" ? t("cr.toast.deletedTitle", { code: r.hazard_code }) : t("cr.toast.rejectTitle", { code: r.hazard_code })
    toast.success(head, { description: parts.join(" · ") || undefined })
  }
}

// ── Accept / Reject dialogs ──────────────────────────────────────────────────

type ClusterLike = Pick<Hazard, "id" | "code" | "type" | "status" | "detection_count" | "member_counts" | "pending_count">

export function ClusterAcceptDialog({ hazard, open, onOpenChange, onDone }: {
  hazard: ClusterLike | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (r: ClusterDecision) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const toastDecision = useDecisionToast()
  const noteId = useId()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setNote("") }, [open])

  if (!hazard) return null
  const m = memberCounts(hazard)
  const submit = async () => {
    setBusy(true)
    try {
      const r = await acceptCluster(hazard.id, { note: note.trim() || undefined })
      toastDecision(r, "accept", hazard.code)
      onOpenChange(false)
      onDone(r)
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />{t("cr.accept.title", { code: hazard.code })}
          </DialogTitle>
          <DialogDescription>
            {hazard.status === "candidate"
              ? t("cr.accept.descCandidate", { n: m.pending || pendingOf(hazard), type: L.typeLabel(hazard.type) })
              : t("cr.accept.desc", { n: m.pending || pendingOf(hazard) })}
          </DialogDescription>
        </DialogHeader>
        {m.location_pending > 0 && <p className="text-xs text-muted-foreground">{t("cr.accept.locationHint", { n: m.location_pending })}</p>}
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>{t("m6.common.noteOptional")}</Label>
          <Textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button className="bg-success text-white hover:bg-success/90" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{t("cr.acceptCluster")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClusterRejectDialog({ hazard, open, onOpenChange, onDone }: {
  hazard: ClusterLike | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (r: ClusterDecision) => void
}) {
  const L = useM6Labels()
  const { t } = L
  const toastDecision = useDecisionToast()
  const noteId = useId()
  const [note, setNote] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [reasons, setReasons] = useState<RejectionReason[] | null>(null)
  const type = hazard?.type

  useEffect(() => {
    if (!open || !type) return
    setNote("")
    setCode("")
    setReasons(null)
    fetchRejectionReasons(type).then(setReasons).catch(() => setReasons([]))
  }, [open, type])

  if (!hazard) return null
  const n = pendingOf(hazard)
  const submit = async () => {
    setBusy(true)
    try {
      const r = await rejectCluster(hazard.id, { reason_code: code, note: note.trim() || undefined })
      toastDecision(r, "reject")
      onOpenChange(false)
      onDone(r)
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />{t("cr.reject.title", { code: hazard.code })}
          </DialogTitle>
          <DialogDescription>
            {hazard.status === "candidate" ? t("cr.reject.descCandidate", { n }) : t("cr.reject.desc", { n })}
          </DialogDescription>
        </DialogHeader>
        <Label>{t("pmap.val.rejectionReason")} <span className="text-destructive">*</span></Label>
        <div className="grid max-h-72 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label={t("pmap.val.rejectionReason")}>
          {reasons === null ? (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("pmap.val.loadingReasons")}</p>
          ) : !reasons.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("pmap.val.noReasons")}</p>
          ) : REJECTION_KINDS.map((k) => {
            const group = reasons.filter((r) => kindOf(r) === k)
            if (!group.length) return null
            return (
              <div key={k} className="space-y-1.5" role="group" aria-label={t(`rej.kind.${k}`)}>
                <p className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={t(`rej.kind.${k}.help`)}>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full border", KIND_BADGE[k])} />{t(`rej.kind.${k}`)}
                </p>
                {group.map((r) => (
                  <button key={r.id} type="button" role="radio" aria-checked={code === r.code} onClick={() => setCode(r.code)}
                    className={cn("flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      code === r.code ? "border-destructive bg-destructive/10" : "bg-muted/30 hover:border-destructive/50")}>
                    <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", code === r.code ? "border-destructive bg-destructive" : "border-muted-foreground")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{L.tl(`rej.code.${r.code}`, r.label)}</span>
                      {r.description && r.description !== r.label && t(`rej.code.${r.code}`) === `rej.code.${r.code}` && (
                        <span className="block text-xs text-muted-foreground">{r.description}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>{t("m6.common.noteOptional")}</Label>
          <Textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button variant="destructive" disabled={busy || !code} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}{t("cr.rejectCluster")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Accept cluster" + "Reject cluster" buttons with their dialogs. */
export function ClusterDecisionButtons({ hazard, onDone, size = "sm", className }: {
  hazard: ClusterLike
  onDone: (r: ClusterDecision) => void
  size?: "sm" | "default"
  className?: string
}) {
  const { t } = useM6Labels()
  const [dialog, setDialog] = useState<"accept" | "reject" | null>(null)
  const m = memberCounts(hazard)
  const canAccept = !hazard.member_counts || m.pending > 0
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button size={size} className="bg-success text-white hover:bg-success/90" disabled={!canAccept}
        title={canAccept ? undefined : t("cr.accept.onlyLocation")} onClick={() => setDialog("accept")}>
        <CheckCircle className="h-4 w-4" />{t("cr.acceptCluster")}
      </Button>
      <Button size={size} variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10"
        onClick={() => setDialog("reject")}>
        <XCircle className="h-4 w-4" />{t("cr.rejectCluster")}
      </Button>
      <ClusterAcceptDialog hazard={hazard} open={dialog === "accept"} onOpenChange={(o) => setDialog(o ? "accept" : null)} onDone={onDone} />
      <ClusterRejectDialog hazard={hazard} open={dialog === "reject"} onOpenChange={(o) => setDialog(o ? "reject" : null)} onDone={onDone} />
    </div>
  )
}
