"use client"

import { cn } from "@/lib/utils"

export type BarTone = "primary" | "blue" | "green" | "amber" | "red" | "slate"

const TONE: Record<BarTone, string> = {
  primary: "bg-primary",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
}

/**
 * Import progress bar. Determinate when `value` (0–100) is known — the width
 * eases between polls so it moves continuously; indeterminate (sliding
 * stripe) otherwise. `striped` adds a moving sheen to an active determinate bar.
 */
export function ProgressBar({ value, tone = "primary", striped = false, className, label }: {
  value: number | null | undefined
  tone?: BarTone
  striped?: boolean
  className?: string
  label?: string
}) {
  const determinate = value != null && Number.isFinite(value)
  const pct = determinate ? Math.max(0, Math.min(100, value as number)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(pct) : undefined}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <style>{`
        @keyframes cs-indeterminate { 0% { left: -40%; } 100% { left: 100%; } }
        @keyframes cs-sheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @media (prefers-reduced-motion: reduce) { .cs-anim { animation: none !important; } }
      `}</style>
      {determinate ? (
        <div
          className={cn("relative h-full overflow-hidden rounded-full transition-[width] duration-[1400ms] ease-out", TONE[tone])}
          style={{ width: `${pct}%` }}
        >
          {striped && pct > 0 && pct < 100 && (
            <div className="cs-anim absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              style={{ animation: "cs-sheen 1.6s linear infinite" }} />
          )}
        </div>
      ) : (
        <div className={cn("cs-anim absolute inset-y-0 w-2/5 rounded-full", TONE[tone])}
          style={{ animation: "cs-indeterminate 1.3s ease-in-out infinite" }} />
      )}
    </div>
  )
}
