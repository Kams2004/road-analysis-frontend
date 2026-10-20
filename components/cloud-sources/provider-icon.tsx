"use client"

import { Cloud, Server } from "lucide-react"
import { cn } from "@/lib/utils"

/** Provider mark of a drive connection (simplified logos, no external assets). */
export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  if (provider === "sftp") {
    return <Server className={cn("h-5 w-5 text-teal-600 dark:text-teal-400", className)} strokeWidth={1.75} />
  }
  if (provider === "google_drive") {
    return (
      <svg viewBox="0 0 87.3 78" className={cn("h-5 w-5", className)} aria-hidden="true">
        <path d="M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
        <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    )
  }
  if (provider === "onedrive") {
    return (
      <svg viewBox="0 0 32 32" className={cn("h-5 w-5", className)} aria-hidden="true">
        <path d="M12.2 11.1a8.2 8.2 0 0 1 13.7 3.6A5.6 5.6 0 0 1 30 20.3c0 .2 0 .4-.1.6L18.6 15z" fill="#0364b8" />
        <path d="M12.2 11.1 18.6 15l11.3 5.9a5.6 5.6 0 0 1-5.6 5H9.6a7.6 7.6 0 0 1-2-14.9 8 8 0 0 1 4.6.1z" fill="#0078d4" />
        <path d="M7.6 11.1a7.6 7.6 0 0 0-6 12.2L18.6 15l-6.4-3.9a8 8 0 0 0-4.6 0z" fill="#1490df" />
        <path d="M1.6 23.3a7.6 7.6 0 0 0 8 2.6h14.7a5.6 5.6 0 0 0 5.6-5L18.6 15z" fill="#28a8ea" />
      </svg>
    )
  }
  return <Cloud className={cn("h-5 w-5 text-muted-foreground", className)} />
}
