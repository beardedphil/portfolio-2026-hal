import { useCallback } from 'react'
import type { ImageAttachment } from '../lib/conversationStorage'

interface UseImageHandlingParams {
  setImageAttachment: (attachment: ImageAttachment | null) => void
  setImageError: (error: string | null) => void
}

export function useImageHandling({ setImageAttachment, setImageError }: UseImageHandlingParams) {
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setImageError(null)

      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!validTypes.includes(file.type)) {
        setImageError(`Unsupported file type: ${file.type}. Please select a JPEG, PNG, GIF, or WebP image.`)
        e.target.value = '' // Reset input
        return
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        setImageError(`File is too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 10MB.`)
        e.target.value = '' // Reset input
        return
      }

      // Create preview
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        setImageAttachment({
          file,
          dataUrl,
          filename: file.name,
        })
      }
      reader.onerror = () => {
        setImageError('Failed to read image file.')
        e.target.value = '' // Reset input
      }
      reader.readAsDataURL(file)
    },
    [setImageAttachment, setImageError]
  )

  const handleRemoveImage = useCallback(() => {
    setImageAttachment(null)
    setImageError(null)
  }, [setImageAttachment, setImageError])

  return {
    handleImageSelect,
    handleRemoveImage,
  }
}
