"use client"

/** Settings → Module 5 · AI detection → AI validation mode (section ai_validation). */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { AiValidationCard } from "@/components/ai-validation-settings"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <AiValidationCard readOnly={readOnly} />
    </SettingsShell>
  )
}
