import { Sidebar } from "@/components/sidebar"
import { DetectionTable } from "@/components/detection-table"

export default function DetectionsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">All Detections</h1>
            <p className="mt-1 text-muted-foreground">
              Browse all detected road hazards across all video sources
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <DetectionTable pageSize={15} />
          </div>
        </div>
      </main>
    </div>
  )
}
