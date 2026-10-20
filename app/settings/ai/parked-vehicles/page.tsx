"use client"

/**
 * Settings → Module 5 · AI detection → Parked vehicles: the detection rules
 * (section parked_vehicle) and the type-level thresholds / model / frame
 * sampling / lifecycle summary, in two tabs (each with its own save bar).
 */
import { useState } from "react"
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { ParkedVehicleSettingsForm } from "@/components/settings/ai/parked-vehicles"
import { CategorySettings } from "@/components/settings/ai/category-settings"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"

export default function Page() {
  const t = useT()
  const readOnly = useSettingsReadOnly()
  const [tab, setTab] = useState("rules")
  return (
    <SettingsShell>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rules" className="text-sm">{t("set.pv.tab.rules")}</TabsTrigger>
          <TabsTrigger value="type" className="text-sm">{t("set.pv.tab.type")}</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4"><ParkedVehicleSettingsForm readOnly={readOnly} /></TabsContent>
        <TabsContent value="type" className="mt-4"><CategorySettings type="parked_vehicle" readOnly={readOnly} /></TabsContent>
      </Tabs>
    </SettingsShell>
  )
}
