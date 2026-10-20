"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** White card that wraps a toolbar + table + pagination footer. */
export function DataCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  )
}

/**
 * Compact toolbar: search input (h-9, max-w-xs), small filter controls
 * (pass <Select> etc. as children — use `TOOLBAR_SELECT` for triggers) and
 * actions on the right. Wraps on small screens.
 */
export function DataToolbar({
  search,
  onSearch,
  placeholder,
  children,
  actions,
  className,
}: {
  search?: string
  onSearch?: (v: string) => void
  placeholder?: string
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-border px-4 py-3", className)}>
      {onSearch && (
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="h-9 pl-8"
          />
        </div>
      )}
      {children}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Class for a compact filter <SelectTrigger> inside a DataToolbar. */
export const TOOLBAR_SELECT = "h-9 w-full sm:w-36"
