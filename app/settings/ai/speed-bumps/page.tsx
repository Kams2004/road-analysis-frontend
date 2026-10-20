"use client"

/** Settings → Module 5 · AI detection → Speed bumps. */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { CategorySettings } from "@/components/settings/ai/category-settings"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <CategorySettings type="speed_bump" hasSubtypes={false} readOnly={readOnly} />
    </SettingsShell>
  )
}
