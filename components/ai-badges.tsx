"use client"

/**
 * AI validation markers of a detection (two-stage pipeline / AI validation
 * mode): "AI decision: accepted / rejected", "Audit sample" and the crop
 * classifier score shown next to the detector confidence.
 */
import { BrainCircuit, ClipboardCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n"
import type { M6Detection } from "@/lib/module6-api"
import { cn } from "@/lib/utils"

type AiFields = Pick<M6Detection, "ai_decision" | "ai_decision_reason" | "audit_sample">

export function AiBadges({ d, className }: { d: AiFields; className?: string }) {
  const t = useT()
  const decided = d.ai_decision === "auto_accept" || d.ai_decision === "auto_reject"
  if (!decided && !d.audit_sample) return null
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {decided && (
        <Badge variant="outline" title={d.ai_decision_reason ?? undefined}
          className={cn("gap-1 text-[10px]", d.ai_decision === "auto_accept"
            ? "border-success/40 text-success" : "border-destructive/40 text-destructive")}>
          <BrainCircuit className="h-3 w-3" />
          {t(d.ai_decision === "auto_accept" ? "ai.badge.accepted" : "ai.badge.rejected")}
        </Badge>
      )}
      <AiReasonBadge reason={d.ai_decision_reason} />
      {d.audit_sample && (
        <Badge variant="outline" className="gap-1 border-violet-500/40 text-[10px] text-violet-600 dark:text-violet-400"
          title={t("ai.badge.auditHint")}>
          <ClipboardCheck className="h-3 w-3" />{t("ai.badge.audit")}
        </Badge>
      )}
    </span>
  )
}

const REASON_PREFIXES = ["not_static", "off_road_area", "ai_off_road", "ai_box_too_large"] as const

/** Friendly badge for the AI reasons "not_static:…" (moving / seen once), "off_road_area:…" (above the road area)
 *  and the pothole rule rejects "ai_off_road:…" / "ai_box_too_large:…" (also inside a manual-mode suggestion). */
export function AiReasonBadge({ reason, className }: { reason: string | null | undefined; className?: string }) {
  const t = useT()
  const prefix = REASON_PREFIXES.find((p) => reason?.startsWith(`${p}:`) || reason === p || reason?.includes(`(${p}:`))
  if (!prefix) return null
  return (
    <Badge variant="outline" title={reason ?? undefined}
      className={cn("border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400", className)}>
      {t(`ai.reason.${prefix}`)}
    </Badge>
  )
}

/** "cls 93%" — the crop classifier's P(class), when the two-stage pipeline ran. */
export function VerifierScore({ value, className }: { value: number | null | undefined; className?: string }) {
  const t = useT()
  if (value == null) return null
  return (
    <span className={cn("text-xs tabular-nums text-muted-foreground", className)} title={t("ai.verifierHint")}>
      {t("ai.verifierShort")} {Math.round(value * 100)}%
    </span>
  )
}
