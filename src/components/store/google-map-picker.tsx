'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MapPin,
  Navigation,
  Compass,
  Search,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react'
import {
  SHOP_LOCATION,
  calculateDistanceKm,
  calculateDeliveryFee,
  type Coordinates,
} from '@/lib/geo/haversine'

interface GoogleMapPickerProps {
  coords: Coordinates
  hasSelectedLocation?: boolean
  onChange: (coords: Coordinates, resolvedAddress?: string) => void
}

interface LocationSuggestion {
  id: string
  title: string
  subtitle: string
  lat: number
  lng: number
  source: 'preset' | 'geocoder'
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
  setZoom: (zoom: number) => void
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

export const KENYA_LOCATIONS_INDEX: LocationSuggestion[] = [
  { id: 'ngong', title: 'Ngong Town', subtitle: 'Ngong Road', lat: -1.3618, lng: 36.6566, source: 'preset' },
  { id: 'karen', title: 'Karen', subtitle: 'Karen Shopping Centre, Nairobi', lat: -1.3192, lng: 36.7065, source: 'preset' },
  { id: 'ongata-rongai', title: 'Ongata Rongai', subtitle: 'Magadi Road', lat: -1.3964, lng: 36.7578, source: 'preset' },
  { id: 'langata', title: 'Langata', subtitle: 'Langata Road, Nairobi', lat: -1.3435, lng: 36.7618, source: 'preset' },
  { id: 'kikuyu', title: 'Kikuyu', subtitle: 'Southern Bypass / Kikuyu', lat: -1.2464, lng: 36.6629, source: 'preset' },
  { id: 'lavington', title: 'Lavington', subtitle: 'James Gichuru Rd, Nairobi', lat: -1.2794, lng: 36.7706, source: 'preset' },
  { id: 'kilimani', title: 'Kilimani / Yaya', subtitle: 'Argwings Kodhek Rd, Nairobi', lat: -1.2921, lng: 36.7879, source: 'preset' },
  { id: 'westlands', title: 'Westlands', subtitle: 'Sarit / Waiyaki Way, Nairobi', lat: -1.2612, lng: 36.8041, source: 'preset' },
  { id: 'upperhill', title: 'Upper Hill', subtitle: 'Hospital Rd, Nairobi', lat: -1.2989, lng: 36.8128, source: 'preset' },
  { id: 'south-c', title: 'South C', subtitle: 'Mombasa Rd, Nairobi', lat: -1.3215, lng: 36.8351, source: 'preset' },
  { id: 'south-b', title: 'South B', subtitle: 'Mombasa Rd, Nairobi', lat: -1.3106, lng: 36.8365, source: 'preset' },
  { id: 'parklands', title: 'Parklands', subtitle: 'Limuru Rd, Nairobi', lat: -1.2603, lng: 36.8195, source: 'preset' },
  { id: 'ruaka', title: 'Ruaka', subtitle: 'Limuru Road', lat: -1.2056, lng: 36.7797, source: 'preset' },
  { id: 'gigiri', title: 'Gigiri / Two Rivers', subtitle: 'Limuru Rd, Nairobi', lat: -1.2116, lng: 36.7955, source: 'preset' },
  { id: 'roysambu', title: 'Roysambu / TRM', subtitle: 'Thika Superhighway, Nairobi', lat: -1.2195, lng: 36.8882, source: 'preset' },
  { id: 'kasarani', title: 'Kasarani', subtitle: 'Thika Road, Nairobi', lat: -1.2211, lng: 36.8973, source: 'preset' },
  { id: 'embakasi', title: 'Embakasi / Fedha', subtitle: 'Outering Rd, Nairobi', lat: -1.3089, lng: 36.8975, source: 'preset' },
  { id: 'syokimau', title: 'Syokimau / JKIA', subtitle: 'Mombasa Road', lat: -1.3326, lng: 36.9275, source: 'preset' },
  { id: 'kiambu', title: 'Kiambu Town', subtitle: 'Kiambu Road', lat: -1.1714, lng: 36.8356, source: 'preset' },
  { id: 'ruiru', title: 'Ruiru', subtitle: 'Thika Superhighway', lat: -1.1481, lng: 36.9609, source: 'preset' },
  { id: 'kitengela', title: 'Kitengela', subtitle: 'Namanga Road', lat: -1.4744, lng: 36.9585, source: 'preset' },
  { id: 'juja', title: 'Juja', subtitle: 'Thika Superhighway', lat: -1.1026, lng: 37.0132, source: 'preset' },
  { id: 'thika', title: 'Thika Town', subtitle: 'Thika Superhighway', lat: -1.0388, lng: 37.0834, source: 'preset' },
  { id: 'machakos', title: 'Machakos Town', subtitle: 'Machakos County', lat: -1.5177, lng: 37.2634, source: 'preset' },
  { id: 'nakuru', title: 'Nakuru City', subtitle: 'Nakuru County', lat: -0.2827, lng: 36.0664, source: 'preset' },
  { id: 'mombasa', title: 'Mombasa', subtitle: 'Mombasa County', lat: -4.0435, lng: 39.6682, source: 'preset' },
]

export function GoogleMapPicker({
  coords,
  hasSelectedLocation = false,
  onChange,
}: GoogleMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<GoogleMapsInstance | null>(null)
  const markerRef = useRef<GoogleMapsMarkerInstance | null>(null)
  const searchWrapperRef = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [searchQuery, setSearchQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<LocationSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const [mapsLoaded, setMapsLoaded] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean(window.google?.maps)
  })

  const reverseGeocodeAndApply = useCallback(
    async (targetCoords: Coordinates, fallbackLabel?: string) => {
      let resolvedLabel = fallbackLabel
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetCoords.lat}&lon=${targetCoords.lng}&zoom=18&addressdetails=1`,
          { headers: { Accept: 'application/json' } }
        )
        if (res.ok) {
          const data = (await res.json()) as {
            display_name?: string
            address?: {
              road?: string
              neighbourhood?: string
              suburb?: string
              city_district?: string
              city?: string
              town?: string
              county?: string
            }
          }
          const addr = data.address
          if (addr) {
            const parts = [
              addr.road,
              addr.neighbourhood || addr.suburb || addr.city_district,
              addr.city || addr.town || addr.county,
            ].filter(Boolean)
            if (parts.length > 0) {
              resolvedLabel = parts.join(', ')
            }
          } else if (data.display_name) {
            resolvedLabel = data.display_name
              .split(',')
              .slice(0, 3)
              .join(', ')
              .trim()
          }
        }
      } catch {
        // Fallback to provided label or coordinates
      }

      onChangeRef.current(targetCoords, resolvedLabel)
      if (resolvedLabel) {
        setSearchQuery(resolvedLabel)
      }
    },
    []
  )

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced OpenStreetMap Nominatim Geocoding Search (Kenya)
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ke&addressdetails=1&limit=6&q=${encodeURIComponent(
          q
        )}`
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as Array<{
          place_id: number
          display_name: string
          lat: string
          lon: string
          name?: string
        }>

        const mapped: LocationSuggestion[] = data
          .map((item) => {
            const parts = item.display_name.split(',').map((s) => s.trim())
            const title = item.name || parts[0] || 'Selected Location'
            const subtitle = parts.slice(1, 4).join(', ') || 'Kenya'
            return {
              id: `nom-${item.place_id}`,
              title,
              subtitle,
              lat: Number(parseFloat(item.lat).toFixed(6)),
              lng: Number(parseFloat(item.lon).toFixed(6)),
              source: 'geocoder' as const,
            }
          })
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))

        setRemoteResults(mapped)
      } catch {
        // Ignore aborted requests or offline errors; local index still works
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery])

  // Combine instant local Kenya presets with live geocoder results
  const combinedSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matchedPresets =
      q.length === 0
        ? KENYA_LOCATIONS_INDEX.slice(0, 8)
        : KENYA_LOCATIONS_INDEX.filter(
            (loc) =>
              loc.title.toLowerCase().includes(q) ||
              loc.subtitle.toLowerCase().includes(q)
          )

    if (q.length < 2) return matchedPresets

    const seenCoords = new Set(
      matchedPresets.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`)
    )
    const dedupedRemote = remoteResults.filter((r) => {
      const key = `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`
      if (seenCoords.has(key)) return false
      seenCoords.add(key)
      return true
    })

    return [...matchedPresets, ...dedupedRemote].slice(0, 8)
  }, [searchQuery, remoteResults])

  // Load Google Maps SDK if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured
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

  // Initialize or update Google Map canvas when SDK is active
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

      // Shop Marker (-1.3554, 36.6562)
      new window.google.maps.Marker({
        position: { lat: SHOP_LOCATION.lat, lng: SHOP_LOCATION.lng },
        map,
        title: SHOP_LOCATION.name,
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
          const next = {
            lat: Number(pos.lat().toFixed(6)),
            lng: Number(pos.lng().toFixed(6)),
          }
          void reverseGeocodeAndApply(next)
        }
      })

      map.addListener('click', (e: GoogleMapsMouseEvent) => {
        if (e.latLng) {
          const next = {
            lat: Number(e.latLng.lat().toFixed(6)),
            lng: Number(e.latLng.lng().toFixed(6)),
          }
          marker.setPosition(next)
          void reverseGeocodeAndApply(next)
        }
      })

      mapInstanceRef.current = map
      markerRef.current = marker
    } else {
      markerRef.current?.setPosition(coords)
      mapInstanceRef.current.panTo(coords)
    }
  }, [mapsLoaded, coords, reverseGeocodeAndApply])

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    const next = { lat: suggestion.lat, lng: suggestion.lng }
    const fullLabel = `${suggestion.title}, ${suggestion.subtitle}`
    setSearchQuery(fullLabel)
    setIsDropdownOpen(false)
    setGpsStatus({
      type: 'success',
      text: `Delivery location set: ${fullLabel}`,
    })
    onChangeRef.current(next, fullLabel)
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setPosition(next)
      mapInstanceRef.current.panTo(next)
      mapInstanceRef.current.setZoom(15)
    }
  }

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus({
        type: 'error',
        text: 'Geolocation is not supported by your browser. Search your location above instead.',
      })
      return
    }

    setLocating(true)
    setGpsStatus(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        }
        if (markerRef.current && mapInstanceRef.current) {
          markerRef.current.setPosition(next)
          mapInstanceRef.current.panTo(next)
          mapInstanceRef.current.setZoom(16)
        }
        await reverseGeocodeAndApply(next, 'Current GPS Location')
        setGpsStatus({
          type: 'success',
          text: `Live GPS location locked (±${Math.round(position.coords.accuracy || 15)}m accuracy)`,
        })
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setGpsStatus({
          type: 'error',
          text:
            err.code === 1
              ? 'Location permission denied. Please allow location access or search your address above.'
              : 'Could not lock onto GPS signal. Please search and select your location above.',
        })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  return (
    <div className="space-y-3.5">
      {/* Top Row: Label & Live GPS Button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin size={14} className="text-primary" /> Search or Pin Your Delivery Location
        </span>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleUseCurrentGps}
          disabled={locating}
          className="rounded-xl text-xs font-bold gap-1.5 h-8 shadow-xs"
        >
          {locating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Navigation size={13} />
          )}
          {locating ? 'Locating...' : 'Use My Live Location'}
        </Button>
      </div>

      {/* Location Search & Autocomplete Box */}
      <div ref={searchWrapperRef} className="relative">
        <div className="relative flex items-center">
          <Search
            size={16}
            className="absolute left-3.5 text-muted-foreground pointer-events-none"
          />
          <Input
            type="text"
            value={searchQuery}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsDropdownOpen(true)
            }}
            placeholder="Search your street, estate, mall, apartment, or town..."
            className="h-11 pl-10 pr-20 border-none bg-secondary/80 hover:bg-secondary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/25 rounded-xl text-sm"
          />
          {isSearching && (
            <Loader2
              size={15}
              className="absolute right-10 text-primary animate-spin"
            />
          )}
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setRemoteResults([])
                setIsDropdownOpen(true)
              }}
              className="absolute right-3 p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear location search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {isDropdownOpen && combinedSuggestions.length > 0 && (
          <div className="absolute z-30 mt-1.5 w-full rounded-2xl bg-card border border-border/70 shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-border/40">
            <div className="px-3.5 py-2 bg-secondary/50 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
              <span>
                {searchQuery.trim().length === 0
                  ? 'Select a Delivery Area'
                  : 'Matching Locations'}
              </span>
              <span>Delivery Rate</span>
            </div>
            {combinedSuggestions.map((item) => {
              const distKm = calculateDistanceKm(
                SHOP_LOCATION.lat,
                SHOP_LOCATION.lng,
                item.lat,
                item.lng
              )
              const feeKes = calculateDeliveryFee(distKm)

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-secondary/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MapPin size={15} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-foreground truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        feeKes === 0
                          ? 'bg-primary/15 text-primary'
                          : 'bg-secondary text-foreground'
                      }`}
                    >
                      {feeKes === 0 ? 'FREE' : `KES ${feeKes.toLocaleString()}`}
                    </span>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {distKm} km
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* GPS Status Feedback */}
      {gpsStatus && (
        <div
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            gpsStatus.type === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{gpsStatus.text}</span>
        </div>
      )}

      {/* Quick Zone Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0 flex items-center gap-1">
          <Compass size={12} /> Quick Areas:
        </span>
        {KENYA_LOCATIONS_INDEX.slice(0, 9).map((zone) => {
          const isSelected =
            hasSelectedLocation &&
            Math.abs(coords.lat - zone.lat) < 0.002 &&
            Math.abs(coords.lng - zone.lng) < 0.002
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => handleSelectSuggestion(zone)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-secondary hover:bg-primary/15 hover:text-primary text-foreground'
              }`}
            >
              {zone.title}
            </button>
          )
        })}
      </div>

      {/* Map Canvas (Interactive Google Maps SDK or Live Pin Embed) */}
      <div className="relative w-full h-64 rounded-2xl overflow-hidden bg-secondary border border-border/60">
        {apiKey ? (
          <div ref={mapContainerRef} className="w-full h-full" />
        ) : (
          <iframe
            title="Delivery Location Map"
            width="100%"
            height="100%"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`}
            className="border-0 w-full h-full"
          />
        )}
      </div>
    </div>
  )
}