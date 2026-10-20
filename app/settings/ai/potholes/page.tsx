"use client"

/** Settings → Module 5 · AI detection → Potholes. */
import { SettingsShell, useSettingsReadOnly } from "@/components/settings/settings-shell"
import { CategorySettings } from "@/components/settings/ai/category-settings"

export default function Page() {
  const readOnly = useSettingsReadOnly()
  return (
    <SettingsShell>
      <CategorySettings type="pothole" hasSubtypes={false} readOnly={readOnly} />
    </SettingsShell>
  )
}
