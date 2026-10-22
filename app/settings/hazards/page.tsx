"use client"

/** Settings → Module 6 · Hazards → Validation rules (the clustering radius lives in /clustering). */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { ValidationRulesCard } from "@/components/validation-settings"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <ValidationRulesCard readOnly={readOnly} />
    </SettingsShell>
  )
}
