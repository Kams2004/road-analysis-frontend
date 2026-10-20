"use client"

/** Settings → Community & mobile → Predefined road sections (section routes). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { RouteSectionsSettingsSection } from "@/components/route-sections-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <RouteSectionsSettingsSection />
    </SettingsShell>
  )
}
