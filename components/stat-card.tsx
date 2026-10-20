import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Coloured icon tiles used by KPI cards (solid tile, white glyph). */
export const TONES = {
  blue: "bg-blue-600",
  green: "bg-emerald-500",
  purple: "bg-violet-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  teal: "bg-teal-500",
  slate: "bg-slate-500",
} as const

export type Tone = keyof typeof TONES

/**
 * Compact KPI card: solid coloured icon tile, big value, label and an
 * optional trend ("+12%"). Same look on every page.
 */
export function StatCard({
  icon: Icon,
  tone = "blue",
  value,
  label,
  trend,
  onClick,
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  value: React.ReactNode
  label: React.ReactNode
  trend?: number | null
  onClick?: () => void
  className?: string
}) {
  const Wrapper = onClick ? "button" : "div"
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm",
        onClick && "transition-colors hover:border-primary/40 hover:bg-accent/30",
        className
      )}
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold leading-tight text-foreground">{value}</span>
          {trend != null && (
            <span className={cn("inline-flex items-center text-xs font-semibold", trend >= 0 ? "text-emerald-600" : "text-red-600")}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
