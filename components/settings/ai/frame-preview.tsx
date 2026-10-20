"use client"

/**
 * Schematic dashcam frame (16:9): masked rectangles (OSD overlay), the
 * bonnet band, the horizon line and "our lane" corridor of a camera
 * calibration. Purely illustrative — helps checking the normalised values.
 */
import type { CameraCalibration } from "@/lib/settings-api"

const W = 160
const H = 90

export function FramePreview({ masks = [], hood, camera, className, labels }: {
  masks?: number[][]
  hood?: number | null
  camera?: Partial<CameraCalibration> | null
  className?: string
  labels?: { mask?: string; hood?: string; horizon?: string; corridor?: string }
}) {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
  const c = camera
  const hasCam = !!c && ok(c.horizon_y) && ok(c.center_offset) && ok(c.corridor_halfwidth_at_horizon) && ok(c.corridor_halfwidth_at_bottom)
  const corridor = hasCam
    ? (() => {
        const cx = (0.5 + c!.center_offset!) * W
        const hy = c!.horizon_y! * H
        const ht = c!.corridor_halfwidth_at_horizon! * W
        const hb = c!.corridor_halfwidth_at_bottom! * W
        return `${cx - ht},${hy} ${cx + ht},${hy} ${cx + hb},${H} ${cx - hb},${H}`
      })()
    : null
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded border bg-gradient-to-b from-sky-100 to-stone-200 dark:from-slate-700 dark:to-stone-800" role="img"
        aria-label={[labels?.mask, labels?.hood, labels?.horizon, labels?.corridor].filter(Boolean).join(", ")}>
        {corridor && <polygon points={corridor} className="fill-emerald-500/25 stroke-emerald-600" strokeWidth={0.8} />}
        {hasCam && (
          <line x1={0} x2={W} y1={c!.horizon_y! * H} y2={c!.horizon_y! * H} className="stroke-amber-500" strokeWidth={0.8} strokeDasharray="3 2" />
        )}
        {masks.filter((r) => r.length === 4 && r.every(ok)).map((r, i) => (
          <rect key={i} x={r[0] * W} y={r[1] * H} width={Math.max(0, (r[2] - r[0]) * W)} height={Math.max(0, (r[3] - r[1]) * H)}
            className="fill-red-500/30 stroke-red-500" strokeWidth={0.6} />
        ))}
        {ok(hood) && hood > 0 && (
          <rect x={0} y={H - hood * H} width={W} height={hood * H} className="fill-slate-900/40 stroke-slate-600" strokeWidth={0.6} />
        )}
      </svg>
      {labels && (
        <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {labels.mask && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500/60" />{labels.mask}</span>}
          {labels.hood && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-700/70" />{labels.hood}</span>}
          {labels.horizon && <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-500" />{labels.horizon}</span>}
          {labels.corridor && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/50" />{labels.corridor}</span>}
        </figcaption>
      )}
    </figure>
  )
}
