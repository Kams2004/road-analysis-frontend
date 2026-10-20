"use client"

import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"

/** Standard console shell: sidebar + top bar + permission gate. */
export function PageShell({ module, children }: { module: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module={module}>
          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </RequirePermission>
      </main>
    </div>
  )
}
