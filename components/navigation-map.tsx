"use client"

import { useEffect, useRef } from "react"

export interface LatLng {
  lat: number
  lng: number
}

interface NavigationMapProps {
  userLocation: LatLng | null
  destination: LatLng | null
  routePoints?: LatLng[]
  onMapReady?: () => void
}

export default function NavigationMap({
  userLocation,
  destination,
  routePoints,
  onMapReady,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const startMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const destMarkerRef = useRef<import("leaflet").Marker | null>(null)
  const routeLayerRef = useRef<import("leaflet").Polyline | null>(null)
  const userCircleRef = useRef<import("leaflet").CircleMarker | null>(null)

  // ---------- Init map once ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    import("leaflet").then((L) => {
      // Suppress default icon URL resolution by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl

      const center: [number, number] = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [4.0511, 9.7679] // Douala default

      const map = L.map(containerRef.current!, {
        center,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      })
      mapRef.current = map

      // Light tile layer — matches the image's clean white map style
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map)

      L.control.attribution({ position: "bottomright", prefix: "" }).addTo(map)
      L.control.zoom({ position: "topright" }).addTo(map)

      onMapReady?.()
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      startMarkerRef.current = null
      destMarkerRef.current = null
      routeLayerRef.current = null
      userCircleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Update user location dot ----------
  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    import("leaflet").then((L) => {
      const map = mapRef.current!

      if (userCircleRef.current) {
        userCircleRef.current.setLatLng([userLocation.lat, userLocation.lng])
      } else {
        // Blue pulsing dot (like the image)
        const pulse = L.divIcon({
          className: "",
          html: `
            <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
              <div style="
                position:absolute;
                width:28px;height:28px;
                border-radius:50%;
                background:rgba(59,130,246,0.2);
                animation:pulse-ring 1.8s ease-out infinite;
              "></div>
              <div style="
                width:12px;height:12px;
                border-radius:50%;
                background:#3b82f6;
                border:2.5px solid white;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
                position:relative;z-index:1;
              "></div>
            </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        L.marker([userLocation.lat, userLocation.lng], { icon: pulse, zIndexOffset: 1000 })
          .addTo(map)
      }

      if (!destination) {
        map.setView([userLocation.lat, userLocation.lng], map.getZoom())
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation])

  // ---------- Update destination marker + route ----------
  useEffect(() => {
    if (!mapRef.current) return
    import("leaflet").then((L) => {
      const map = mapRef.current!

      // Remove old destination marker
      if (destMarkerRef.current) {
        map.removeLayer(destMarkerRef.current)
        destMarkerRef.current = null
      }
      // Remove old route
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current)
        routeLayerRef.current = null
      }

      if (!destination) return

      // Destination pin — red teardrop
      const destIcon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:32px;height:42px;">
            <svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg"
                 style="width:32px;height:42px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
              <path d="M16 0C7.163 0 0 7.163 0 16c0 10.627 14.072 24.627 15.29 25.805a1 1 0 001.42 0C17.928 40.627 32 26.627 32 16 32 7.163 24.837 0 16 0z"
                    fill="#ef4444"/>
              <circle cx="16" cy="16" r="7" fill="white"/>
            </svg>
          </div>`,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -44],
      })

      const destMarker = L.marker([destination.lat, destination.lng], { icon: destIcon }).addTo(map)
      destMarkerRef.current = destMarker

      // Draw route polyline if we have points, else straight line
      const points: [number, number][] = routePoints && routePoints.length > 0
        ? routePoints.map((p) => [p.lat, p.lng])
        : userLocation
          ? [[userLocation.lat, userLocation.lng], [destination.lat, destination.lng]]
          : [[destination.lat, destination.lng]]

      if (points.length >= 2) {
        const polyline = L.polyline(points, {
          color: "#3b82f6",
          weight: 5,
          opacity: 0.85,
          lineJoin: "round",
          lineCap: "round",
          dashArray: undefined,
        }).addTo(map)
        routeLayerRef.current = polyline
      }

      // Fit bounds to show both points
      const bounds: [number, number][] = userLocation
        ? [[userLocation.lat, userLocation.lng], [destination.lat, destination.lng]]
        : [[destination.lat, destination.lng]]

      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60] })
      } else {
        map.setView([destination.lat, destination.lng], 14)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, routePoints])

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.5); opacity: 0.8; }
          80%  { transform: scale(2);   opacity: 0; }
          100% { transform: scale(2);   opacity: 0; }
        }
      `}</style>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={containerRef} className="w-full h-full" />
    </>
  )
}
