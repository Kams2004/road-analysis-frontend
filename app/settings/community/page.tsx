"use client"

/** Settings → Community & mobile → Community reports (section community). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { CommunitySettingsSection } from "@/components/community-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <CommunitySettingsSection heading={false} only={["community"]} />
    </SettingsShell>
  )
}
