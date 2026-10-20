"use client"

/** Settings → Community & mobile → Collision prevention (section collision). */
import { SettingsShell } from "@/components/settings/settings-shell"
import { CommunitySettingsSection } from "@/components/community-settings"

export default function Page() {
  return (
    <SettingsShell readOnlyNotice={false}>
      <CommunitySettingsSection heading={false} only={["collision"]} />
    </SettingsShell>
  )
}
