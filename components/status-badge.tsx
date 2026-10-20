import { cn } from "@/lib/utils"

/** Pill colours shared by every table/status display. */
export const BADGE_TONES = {
  green: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400",
  blue: "bg-blue-500/10 text-blue-700 ring-blue-500/25 dark:text-blue-400",
  purple: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-400",
  orange: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-400",
  slate: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
} as const

export type BadgeTone = keyof typeof BADGE_TONES

const STATUS_TONE: Record<string, BadgeTone> = {
  // green
  validated: "green", validee: "green", completed: "green", done: "green", active: "green",
  actif: "green", success: "green", ok: "green", enabled: "green", approved: "green", online: "green",
  running: "green", connected: "green", live: "green",
  // amber
  pending: "amber", under_review: "amber", review: "amber", queued: "amber", waiting: "amber",
  en_attente: "amber", needs_review: "amber", warning: "amber",
  // blue
  processing: "blue", in_progress: "blue", starting: "blue", uploading: "blue",
  // red
  rejected: "red", rejete: "red", failed: "red", error: "red", disabled: "red", locked: "red",
  blocked: "red", revoked: "red", offline: "red", denied: "red",
  // slate
  cancelled: "slate", canceled: "slate", annule: "slate", inactive: "slate", stopped: "slate",
  expired: "slate", archived: "slate", unknown: "slate", paused: "slate",
}

/** Best-effort status → tone mapping (case and separator insensitive). */
export function toneForStatus(status: string | null | undefined): BadgeTone {
  if (!status) return "slate"
  const k = status.toLowerCase().replace(/[\s-]+/g, "_")
  return STATUS_TONE[k] ?? "slate"
}

/**
 * Coloured status pill. Pass `tone` explicitly, or `status` to have it
 * derived (green Validated/Completed/Active, amber Pending, red Rejected/
 * Failed, slate Cancelled, blue Processing).
 */
export function StatusBadge({
  status,
  tone,
  dot = true,
  className,
  children,
}: {
  status?: string | null
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const t = tone ?? toneForStatus(status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[t],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children ?? status}
    </span>
  )
}
