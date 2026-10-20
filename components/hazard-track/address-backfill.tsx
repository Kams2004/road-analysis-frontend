"use client"

/**
 * Banner shown when detections stored before readable addresses existed
 * still lack one: count + "Resolve addresses" (detections:edit), which
 * starts the throttled server-side back-fill (POST /hazards/geocode/backfill)
 * and follows its progress.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, MapPinned } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import { useT } from "@/lib/i18n"
import { errorText } from "@/lib/auth-api"
import { getGeocodeBackfill, startGeocodeBackfill, type GeocodeBackfillState } from "@/lib/module6-api"

export function AddressBackfillBanner({ onDone }: { onDone: () => void }) {
  const t = useT()
  const { can } = useAuth()
  const canEdit = can("detections", "edit")
  const [st, setSt] = useState<GeocodeBackfillState | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let alive = true
    getGeocodeBackfill().then((s) => alive && setSt(s)).catch(() => {})
    return () => { alive = false }
  }, [])

  // Follow a running back-fill.
  useEffect(() => {
    if (!st?.running) return
    const id = setInterval(() => {
      getGeocodeBackfill().then((s) => {
        setSt(s)
        if (!s.running) onDone()
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [st?.running, onDone])

  if (!st || hidden || (!st.running && st.pending === 0)) return null
  const start = async () => {
    try {
      const s = await startGeocodeBackfill(Math.min(1000, Math.max(50, st.pending)))
      setSt(s)
      toast.success(t("ht.geo.started"))
    } catch (err) {
      toast.error(errorText(t, err, "m6"))
    }
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-2.5 text-sm">
      <MapPinned className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <p className="min-w-0 flex-1">
        {st.running
          ? t("ht.geo.running", { n: st.processed, pending: st.pending })
          : t("ht.geo.pending", { n: st.pending })}
        {!st.running && st.stopped_reason === "failures" && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">{t("ht.geo.failures")}</span>}
      </p>
      {st.running ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <>
          {canEdit && <Button size="sm" variant="outline" className="h-8" onClick={start}>{t("ht.geo.run")}</Button>}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setHidden(true)}>{t("ht.geo.dismiss")}</Button>
        </>
      )}
    </div>
  )
}
