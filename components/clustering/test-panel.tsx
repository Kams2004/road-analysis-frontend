"use client"

/** "Test a point": the radius resolved at a clicked position, per type, and where it comes from. */
import { ChevronRight, Loader2, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n"
import type { PointResolution, Resolution } from "@/lib/clustering-api"
import { useTypeLabels } from "./radius-table"

function Row({ label, r }: { label: string; r: Resolution }) {
  const t = useT()
  const zone = r.source.startsWith("zone")
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1">
      <span className="min-w-0 truncate text-xs">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className={`h-4 px-1 text-[10px] ${zone ? "border-violet-500/40 text-violet-600" : ""}`}>
          {t(`cl.test.source.${r.source}`)}
        </Badge>
        <span className="w-14 text-right text-xs font-semibold tabular-nums">{r.radius_m} m</span>
      </div>
    </div>
  )
}

export function TestPanel({ point, result, busy }: {
  point: { lat: number; lon: number } | null
  result: PointResolution | null
  busy: boolean
}) {
  const t = useT()
  const labels = useTypeLabels()
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("cl.test.hint")}</p>
      {!point ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{t("cl.test.none")}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
            <MapPin className="h-4 w-4 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tabular-nums text-muted-foreground">{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</p>
              {result && (
                <p className="truncate text-sm font-medium">
                  {result.zone
                    ? `${result.zone.name} · ${t(`cl.env.${result.zone.environment}`)} · ${t(`cl.kind.${result.zone.kind}`)}`
                    : t("cl.test.noZone", { env: t(`cl.env.${result.environment}`) })}
                </p>
              )}
            </div>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {result && (
            <>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold">{t("cl.detections")}</h4>
                <div className="divide-y rounded-md border">
                  {Object.entries(result.detections).map(([ty, r]) => <Row key={ty} label={labels.detection(ty)} r={r} />)}
                </div>
              </div>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />{t("cl.signalements")}
                </summary>
                <div className="mt-1.5 divide-y rounded-md border">
                  {Object.entries(result.signalements).map(([ty, r]) => <Row key={ty} label={labels.signalement(ty)} r={r} />)}
                </div>
              </details>
            </>
          )}
        </>
      )}
    </div>
  )
}
