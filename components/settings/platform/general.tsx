"use client"

/**
 * Settings → Platform → Integrations & data: API endpoint, notification and
 * data-retention preferences. The API does not persist these yet, so the page
 * shows an "in development" state instead of controls that would not save.
 */
import { Bell, Clock, Database, Globe } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n"

export function PlatformGeneralCards() {
  const t = useT()
  const badge = (
    <Badge variant="outline" className="gap-1 text-[10px]">
      <Clock className="h-3 w-3" />
      {t("set.inDev")}
    </Badge>
  )
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <SectionCard badge={badge} id="api" icon={Globe} tone="teal" title={t("pmap.set.api")} description={t("pmap.set.apiDesc")} />
      <SectionCard badge={badge} id="notifications" icon={Bell} tone="orange" title={t("pmap.set.notifications")} description={t("pmap.set.notificationsDesc")} />
      <SectionCard badge={badge} id="data" icon={Database} tone="purple" title={t("pmap.set.data")} description={t("pmap.set.dataDesc")} />
      <p className="text-sm text-muted-foreground xl:col-span-3">{t("set.general.inDev")}</p>
    </div>
  )
}
