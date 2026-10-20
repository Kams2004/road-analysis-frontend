"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Car, Radio, Siren } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SettingsLinkButton } from "@/components/settings-index"
import { StatCard } from "@/components/stat-card"
import { PageShell } from "@/components/dashboard/page-shell"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { parseUtc } from "@/components/dashboard/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// GET /alerts/active → ConflictAlert[] (app/services/alerts/models.py)
interface ConflictAlert {
  conflict_id: string
  vehicle_a_id: string
  vehicle_b_id: string
  status: "DETECTED" | "ACTIVE" | "RESOLVED"
  level: "SAFE" | "MONITOR" | "WARNING" | "HIGH_WARNING" | "CRITICAL"
  time_to_conflict_s: number | null
  minimum_predicted_distance_m: number | null
  closing_speed_mps: number | null
  reason: string
  recommended_action: string
  last_updated_at: string
}

// GET /vehicles/live → VehicleNearbyOut (app/schemas/schemas.py)
interface LiveVehicle {
  vehicle_id: string
  vehicle_type: string
  latitude: number
  longitude: number
  speed_mps: number | null
  heading: number | null
  ts: string
}

const LEVEL_STYLE: Record<ConflictAlert["level"], string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH_WARNING: "bg-orange-500 text-white",
  WARNING: "bg-amber-400 text-amber-950",
  MONITOR: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  SAFE: "bg-muted text-muted-foreground",
}
const LEVEL_ORDER = ["CRITICAL", "HIGH_WARNING", "WARNING", "MONITOR", "SAFE"]

export default function CollisionsPage() {
  return (
    <PageShell module="collisions">
      <Collisions />
    </PageShell>
  )
}

function Collisions() {
  const { t, locale } = useI18n()
  const [alerts, setAlerts] = useState<ConflictAlert[]>([])
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const [a, v] = await Promise.all([
        fetch("/api/proxy/alerts/active", { cache: "no-store" }),
        fetch("/api/proxy/vehicles/live", { cache: "no-store" }),
      ])
      if (!a.ok || !v.ok) throw new Error()
      const alertList: ConflictAlert[] = await a.json()
      const vehicleList: { items: LiveVehicle[] } = await v.json()
      setAlerts(
        alertList
          .filter((x) => x.status !== "RESOLVED")
          .sort((x, y) => LEVEL_ORDER.indexOf(x.level) - LEVEL_ORDER.indexOf(y.level)),
      )
      setVehicles(vehicleList.items ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 5_000)
    return () => clearInterval(iv)
  }, [load])

  const severe = alerts.filter((a) => a.level === "CRITICAL" || a.level === "HIGH_WARNING").length
  const time = (iso: string) => parseUtc(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  return (
    <>
      <PageHeader title={t("dash.nav.collisions")} description={t("dash.col.subtitle")} actions={<SettingsLinkButton anchor="collision" />} />
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {t("dash.col.loadFailed")}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Car} tone="purple" value={loaded ? vehicles.length : "—"} label={t("dash.col.vehicles")} />
        <StatCard icon={Siren} tone="orange" value={loaded ? alerts.length : "—"} label={t("dash.col.alerts")} />
        <StatCard icon={AlertTriangle} tone="red" value={loaded ? severe : "—"} label={t("dash.col.severe")} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t("dash.col.alertsTitle")} className="xl:col-span-3" bodyClassName="pb-1">
          {alerts.length === 0 ? (
            <EmptyState>{t("dash.col.noAlerts")}</EmptyState>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("dash.col.level")}</th>
                    <th className="px-2 py-2 font-medium">{t("dash.col.pair")}</th>
                    <th className="px-2 py-2 font-medium">{t("dash.col.ttc")}</th>
                    <th className="px-2 py-2 font-medium">{t("dash.col.distance")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("dash.col.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.conflict_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", LEVEL_STYLE[a.level])}>
                          {t(`dash.col.lvl.${a.level}`)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-mono text-xs text-foreground">{short(a.vehicle_a_id)} ↔ {short(a.vehicle_b_id)}</p>
                        <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground" title={a.reason}>{a.reason}</p>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{a.time_to_conflict_s != null ? `${a.time_to_conflict_s.toFixed(1)} s` : "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{a.minimum_predicted_distance_m != null ? `${Math.round(a.minimum_predicted_distance_m)} m` : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{time(a.last_updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t("dash.col.vehiclesTitle")} className="xl:col-span-2">
          {vehicles.length === 0 ? (
            <EmptyState>{t("dash.col.noVehicles")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {vehicles.map((v) => (
                <li key={v.vehicle_id} className="flex items-center gap-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                    <Radio className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-foreground">{v.vehicle_id}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.vehicle_type} · {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {v.speed_mps != null ? `${Math.round(v.speed_mps * 3.6)} km/h` : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{time(v.ts)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t("dash.col.refresh")}</p>
    </>
  )
}

function short(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}
