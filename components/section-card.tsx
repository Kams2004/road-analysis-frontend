import type { LucideIcon } from "lucide-react"
import { TONES, type Tone } from "@/components/stat-card"
import { cn } from "@/lib/utils"

/** Small solid coloured icon tile with a white glyph (same style as StatCard). */
export function IconTile({ icon: Icon, tone = "blue", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white", TONES[tone], className)}>
      <Icon className="h-4 w-4" />
    </div>
  )
}

/**
 * Compact settings/form card: icon tile + title (+ badge) + one-line
 * description in the header, optional actions on the right, tight body.
 */
export function SectionCard({
  id,
  icon,
  tone = "blue",
  title,
  badge,
  description,
  actions,
  className,
  contentClassName,
  children,
}: {
  /** Anchor for deep links (/settings#community) and the "On this page" index. */
  id?: string
  icon?: LucideIcon
  tone?: Tone
  title: React.ReactNode
  badge?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div id={id} className={cn("scroll-mt-32 rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-shadow target:ring-2 target:ring-primary/60", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <IconTile icon={icon} tone={tone} />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold leading-8 text-foreground">{title}</h3>
              {badge}
            </div>
            {description && <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("space-y-4 px-5 py-4", contentClassName)}>{children}</div>
    </div>
  )
}

/** Heading for a group of SectionCards (e.g. "Platform settings"). */
export function SectionHeading({ id, title, description }: { id?: string; title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-32">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
