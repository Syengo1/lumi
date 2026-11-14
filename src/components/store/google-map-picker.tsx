'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MapPin, Navigation, Compass } from 'lucide-react'
import type { Coordinates } from '@/lib/geo/haversine'

interface GoogleMapPickerProps {
  coords: Coordinates
  originCoords: Coordinates
  onChange: (coords: Coordinates, resolvedAddress?: string) => void
}

interface GoogleMapsLatLng {
  lat: () => number
  lng: () => number
}

interface GoogleMapsMouseEvent {
  latLng?: GoogleMapsLatLng
}

interface GoogleMapsInstance {
  panTo: (position: Coordinates) => void
  addListener: (event: string, handler: (e: GoogleMapsMouseEvent) => void) => void
}

interface GoogleMapsMarkerInstance {
  setPosition: (position: Coordinates) => void
  getPosition: () => GoogleMapsLatLng | null
  addListener: (event: string, handler: () => void) => void
}

interface GoogleMapsNamespace {
  maps?: {
    Map: new (
      el: HTMLElement,
      opts: {
        center: Coordinates
        zoom: number
        disableDefaultUI: boolean
        mapTypeControl: boolean
        streetViewControl: boolean
      }
    ) => GoogleMapsInstance
    Marker: new (opts: {
      position: Coordinates
      map: GoogleMapsInstance
      draggable?: boolean
      title?: string
    }) => GoogleMapsMarkerInstance
  }
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace
  }
}

const KENYA_PRESET_LOCATIONS = [
  { name: 'Nairobi CBD', lat: -1.286389, lng: 36.817223 },
  { name: 'Westlands, Nairobi', lat: -1.2683, lng: 36.8111 },
  { name: 'Kilimani / Yaya', lat: -1.2921, lng: 36.7879 },
  { name: 'Karen, Nairobi', lat: -1.3192, lng: 36.7065 },
  { name: 'Kasarani / Thika Rd', lat: -1.2211, lng: 36.8973 },
  { name: 'JKIA / Syokimau', lat: -1.3326, lng: 36.9275 },
  { name: 'Kiambu Town', lat: -1.1714, lng: 36.8356 },
]

export function GoogleMapPicker({ coords, originCoords, onChange }: GoogleMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<GoogleMapsInstance | null>(null)
  const markerRef = useRef<GoogleMapsMarkerInstance | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [locating, setLocating] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  const [mapsLoaded, setMapsLoaded] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean(window.google?.maps)
  })

  useEffect(() => {
    if (!apiKey || mapsLoaded) return

    const handleLoad = () => setMapsLoaded(true)
    const existingScript = document.getElementById('google-maps-sdk')

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad)
      return () => existingScript.removeEventListener('load', handleLoad)
    }

    const script = document.createElement('script')
    script.id = 'google-maps-sdk'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.addEventListener('load', handleLoad)
    document.head.appendChild(script)

    return () => {
      script.removeEventListener('load', handleLoad)
    }
  }, [apiKey, mapsLoaded])

  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current || !window.google?.maps) return

    if (!mapInstanceRef.current) {
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: coords,
        zoom: 13,
        disableDefaultUI: false,
        mapTypeControl: false,
        streetViewControl: false,
      })

      // Store Dispatch Hub Marker
      new window.google.maps.Marker({
        position: originCoords,
        map,
        title: 'Store Dispatch Hub',
      })

      // Draggable Customer Delivery Marker
      const marker = new window.google.maps.Marker({
        position: coords,
        map,
        draggable: true,
        title: 'Your Delivery Drop-off Pin',
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (pos) {
          onChangeRef.current({ lat: pos.lat(), lng: pos.lng() })
        }
      })

      map.addListener('click', (e: GoogleMapsMouseEvent) => {
        if (e.latLng) {
          const next = { lat: e.latLng.lat(), lng: e.latLng.lng() }
          marker.setPosition(next)
          onChangeRef.current(next)
        }
      })

      mapInstanceRef.current = map
      markerRef.current = marker
    } else {
      markerRef.current?.setPosition(coords)
      mapInstanceRef.current.panTo(coords)
    }
  }, [mapsLoaded, coords, originCoords])

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        }
        onChangeRef.current(next, 'Current GPS Location')
        if (markerRef.current && mapInstanceRef.current) {
          markerRef.current.setPosition(next)
          mapInstanceRef.current.panTo(next)
        }
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin size={14} className="text-primary" /> Pin Delivery Location on Map
        </span>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleUseCurrentGps}
          disabled={locating}
          className="rounded-xl text-xs font-bold gap-1.5 h-8"
        >
          <Navigation size={13} className="text-primary" />
          {locating ? 'Locating...' : 'Use My Current GPS'}
        </Button>
      </div>

      {/* Quick Landmark Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0 flex items-center gap-1">
          <Compass size={12} /> Quick Zones:
        </span>
        {KENYA_PRESET_LOCATIONS.map((zone) => (
          <button
            key={zone.name}
            type="button"
            onClick={() => {
              const next = { lat: zone.lat, lng: zone.lng }
              onChangeRef.current(next, zone.name)
              if (markerRef.current && mapInstanceRef.current) {
                markerRef.current.setPosition(next)
                mapInstanceRef.current.panTo(next)
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary hover:text-primary-foreground text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
          >
            {zone.name}
          </button>
        ))}
      </div>

      {/* Map Canvas (Interactive SDK or Live Google Maps Embed Fallback) */}
      <div className="relative w-full h-64 rounded-2xl overflow-hidden bg-secondary border border-border/60">
        {apiKey ? (
          <div ref={mapContainerRef} className="w-full h-full" />
        ) : (
          <iframe
            title="Delivery Location Map"
            width="100%"
            height="100%"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=14&output=embed`}
            className="border-0 w-full h-full"
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>
          Pinned GPS: <code className="font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</code>
        </span>
        <span>Validated on server via Haversine formula</span>
      </div>
    </div>
  )
}