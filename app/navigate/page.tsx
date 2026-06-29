"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Navigation, Shield, ChevronRight } from "lucide-react"

export default function LocationPermissionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)   // start true — checking existing permission
  const [denied, setDenied] = useState(false)
  const [ready, setReady] = useState(false)       // show UI only after perm check

  // ── On mount: check if permission already granted ─────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return

    // Permissions API lets us silently check without prompting
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "granted") {
            // Already allowed — go straight to map
            router.replace("/navigate/map")
          } else {
            // "prompt" or "denied" — show the UI
            setLoading(false)
            setReady(true)
          }
        })
        .catch(() => {
          setLoading(false)
          setReady(true)
        })
    } else {
      // No Permissions API (rare) — show UI directly
      setLoading(false)
      setReady(true)
    }
  }, [router])

  // ── User taps "Allow Location" ─────────────────────────────────────────────
  const requestPermission = () => {
    if (!navigator.geolocation) {
      router.replace("/navigate/map")
      return
    }

    setLoading(true)
    setDenied(false)

    navigator.geolocation.getCurrentPosition(
      () => {
        // Granted
        router.replace("/navigate/map")
      },
      () => {
        // Denied — still navigate after brief feedback
        setDenied(true)
        setLoading(false)
        setTimeout(() => router.replace("/navigate/map"), 1200)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  const skipPermission = () => {
    router.replace("/navigate/map")
  }

  // ── Loading / redirect state ───────────────────────────────────────────────
  if (!ready || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            {denied ? "Location denied — redirecting…" : "Checking location…"}
          </p>
        </div>
      </div>
    )
  }

  // ── Permission request UI ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      {/* Icon */}
      <div className="relative mb-8">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
          <MapPin className="h-14 w-14 text-primary" />
        </div>
        <div className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Navigation className="h-4 w-4 text-white" fill="white" />
        </div>
      </div>

      {/* Text */}
      <h1 className="text-2xl font-bold text-foreground text-center mb-3">
        Allow Location Access
      </h1>
      <p className="text-muted-foreground text-center text-sm max-w-xs leading-relaxed mb-2">
        RoadGuard needs your location to show you on the map and help you navigate to your destination.
      </p>

      {denied && (
        <p className="text-destructive text-xs text-center mb-2">
          Location denied — continuing without GPS…
        </p>
      )}

      {/* Feature bullets */}
      <div className="w-full max-w-xs space-y-3 my-6">
        {[
          { icon: Navigation, label: "See your real-time position on the map" },
          { icon: MapPin,     label: "Get accurate route directions" },
          { icon: Shield,     label: "Your location is never stored on our servers" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm text-foreground/80">{label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={requestPermission}
        className="w-full max-w-xs flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-white shadow-lg shadow-primary/30 active:scale-95 transition-transform"
      >
        Allow Location
        <ChevronRight className="h-5 w-5" />
      </button>

      <button
        onClick={skipPermission}
        className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip for now
      </button>
    </div>
  )
}
