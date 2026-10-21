"use client"

/** Settings → Module 7 · Jobs → Processing, the cloud OAuth client
 *  credentials and the dashcam overlay (OSD) layouts. Drive connections moved to /cloud-sources (old
 *  #cloud-connections links are redirected there). */
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SettingsShell } from "@/components/settings/settings-shell"
import { ProcessingSettingsSection } from "@/components/processing-settings"
import { OsdSettingsCard } from "@/components/osd-settings"
import { MOVED_ANCHORS } from "@/lib/settings-structure"

export default function Page() {
  const router = useRouter()
  useEffect(() => {
    const moved = MOVED_ANCHORS[window.location.hash.slice(1)]
    if (moved) router.replace(moved)
  }, [router])
  return (
    <SettingsShell readOnlyNotice={false}>
      <ProcessingSettingsSection heading={false} />
      <div className="mt-5"><OsdSettingsCard /></div>
    </SettingsShell>
  )
}
