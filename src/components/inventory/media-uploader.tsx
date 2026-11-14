'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { ImagePlus, X, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface MediaUploaderProps {
  initialImages?: string[]
}

export function MediaUploader({ initialImages = [] }: MediaUploaderProps) {
  const [existingUrls, setExistingUrls] = useState<string[]>(initialImages)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const syncInputFiles = (files: File[]) => {
    if (!fileInputRef.current) return
    const dataTransfer = new DataTransfer()
    files.forEach((f) => dataTransfer.items.add(f))
    fileInputRef.current.files = dataTransfer.files
  }

  const handleFilesAdded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || [])
    if (incoming.length === 0) return

    const updatedFiles = [...selectedFiles, ...incoming]
    const newPreviewUrls = incoming.map((file) => URL.createObjectURL(file))

    setSelectedFiles(updatedFiles)
    setPreviews((prev) => [...prev, ...newPreviewUrls])
    syncInputFiles(updatedFiles)
  }

  const removeExistingImage = (index: number) => {
    setExistingUrls((prev) => prev.filter((_, idx) => idx !== index))
  }

  const removeNewFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== index)
    setSelectedFiles(updatedFiles)
    setPreviews((prev) => prev.filter((_, idx) => idx !== index))
    syncInputFiles(updatedFiles)
  }

  const promoteExistingToCover = (index: number) => {
    if (index === 0) return
    setExistingUrls((prev) => {
      const copy = [...prev]
      const [chosen] = copy.splice(index, 1)
      return [chosen, ...copy]
    })
  }

  const totalCount = existingUrls.length + previews.length

  return (
    <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl overflow-hidden">
      <CardHeader className="px-6 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Product Gallery</CardTitle>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <CardDescription className="text-xs">
          Upload multiple angles (front, back, detail, fit). First photo is the cover.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 pb-6 space-y-4">
        <input
          type="hidden"
          name="existing_images_json"
          value={JSON.stringify(existingUrls)}
        />

        {/* Hidden multi-file input synced via DataTransfer */}
        <input
          ref={fileInputRef}
          type="file"
          name="images"
          multiple
          accept="image/*"
          onChange={handleFilesAdded}
          className="hidden"
        />

        {/* Dropzone Trigger */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-7 px-4 rounded-2xl border-2 border-dashed border-border bg-secondary/40 hover:bg-secondary/80 hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer"
        >
          <div className="p-3 bg-card rounded-full shadow-xs">
            <ImagePlus size={22} className="text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Add Product Images</p>
          <p className="text-xs text-muted-foreground text-center">
            Select one or multiple photos (PNG, JPG, WEBP up to 5MB each)
          </p>
        </button>

        {/* Gallery Thumbnails Grid */}
        {totalCount > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            {existingUrls.map((url, idx) => (
              <div
                key={`existing-${idx}`}
                className="group relative aspect-square rounded-xl overflow-hidden bg-secondary"
              >
                <Image
                  src={url}
                  alt={`Product photo ${idx + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {idx === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold">
                    Cover
                  </span>
                )}
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => promoteExistingToCover(idx)}
                    title="Set as cover"
                    className="absolute bottom-1.5 left-1.5 p-1 rounded-md bg-card/90 text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Star size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeExistingImage(idx)}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-card/90 text-foreground hover:text-destructive shadow-xs"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {previews.map((url, idx) => (
              <div
                key={`new-${idx}`}
                className="relative aspect-square rounded-xl overflow-hidden bg-secondary ring-2 ring-primary/30"
              >
                <Image
                  src={url}
                  alt={`New upload ${idx + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {existingUrls.length === 0 && idx === 0 ? (
                  <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold">
                    Cover
                  </span>
                ) : (
                  <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-card/90 text-foreground text-[10px] font-semibold">
                    New
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeNewFile(idx)}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-card/90 text-foreground hover:text-destructive shadow-xs"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}