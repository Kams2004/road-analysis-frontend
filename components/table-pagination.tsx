"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Page list with ellipses: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | "…")[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pages - 1, page + 1)
  if (start > 2) out.push("…")
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pages - 1) out.push("…")
  out.push(pages)
  return out
}

/**
 * Table footer: "Showing 1–50 of N results", numbered pages and an optional
 * page-size select. `page` is 1-based.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [20, 50, 100],
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizes?: number[]
  className?: string
}) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm", className)}>
      <span className="text-muted-foreground">{t("ui.showing", { from, to, total })}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1}
            aria-label={t("common.previous")} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageList(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
            ) : (
              <Button key={p} variant={p === page ? "default" : "ghost"} size="sm"
                className="h-8 min-w-8 px-2" onClick={() => onPageChange(p)}>
                {p}
              </Button>
            )
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages}
            aria-label={t("common.next")} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger size="sm" className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)}>{t("ui.perPage", { n: s })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
