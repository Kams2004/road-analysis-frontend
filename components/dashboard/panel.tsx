import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Compact dashboard card: small header, optional "View all" link, p-4 body. */
export function Panel({
  title,
  href,
  linkLabel,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode
  href?: string
  linkLabel?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm", className)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {href && linkLabel && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            {linkLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className={cn("flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
