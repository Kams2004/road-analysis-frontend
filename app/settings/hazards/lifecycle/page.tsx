"use client"

/** Settings → Module 6 · Hazards → Hazard lifecycle (section hazard_lifecycle). */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { HazardLifecycleSettingsForm } from "@/components/settings/hazards/lifecycle"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <HazardLifecycleSettingsForm readOnly={readOnly} />
    </SettingsShell>
  )
}
