import { useState } from 'react'
import type { TicketAttachment } from './types'
import { ImageViewerModal } from './ImageViewerModal'

/** Attachments Section: displays file attachments for tickets (0092) */
export function AttachmentsSection({
  attachments,
  loading,
}: {
  attachments: TicketAttachment[]
  loading: boolean
}) {
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null)
  const [imageViewerAlt, setImageViewerAlt] = useState('')

  if (loading) {
    return (
      <div className="attachments-section">
        <h3 className="attachments-section-title">Attachments</h3>
        <p className="attachments-loading">Loading attachments…</p>
      </div>
    )
  }

  if (attachments.length === 0) {
    return null // Don't show empty section
  }

  const handleDownload = (attachment: TicketAttachment) => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = attachment.data_url
    link.download = attachment.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleView = (attachment: TicketAttachment) => {
    // Reuse existing in-app image modal (0158) instead of navigating away.
    setImageViewerSrc(attachment.data_url)
    setImageViewerAlt(attachment.filename)
    setImageViewerOpen(true)
  }

  const isImage = (mimeType: string) => mimeType.startsWith('image/')

  return (
    <>
      <div className="attachments-section">
        <h3 className="attachments-section-title">Attachments</h3>
        <ul className="attachments-list">
          {attachments.map((attachment) => (
            <li key={attachment.pk} className="attachments-item">
              <div className="attachments-item-content">
                {isImage(attachment.mime_type) && (
                  <button
                    type="button"
                    onClick={() => handleView(attachment)}
                    className="attachments-thumbnail-button"
                    aria-label={`View ${attachment.filename}`}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <img
                      src={attachment.data_url}
                      alt={attachment.filename}
                      className="attachments-thumbnail"
                    />
                  </button>
                )}
                <div className="attachments-item-info">
                  <span className="attachments-item-filename">{attachment.filename}</span>
                  <span className="attachments-item-meta">
                    {attachment.mime_type}
                    {attachment.file_size && ` • ${Math.round(attachment.file_size / 1024)} KB`}
                  </span>
                </div>
              </div>
              <div className="attachments-item-actions">
                {isImage(attachment.mime_type) && (
                  <button
                    type="button"
                    className="attachments-action-button"
                    onClick={() => handleView(attachment)}
                    aria-label={`View ${attachment.filename}`}
                  >
                    View
                  </button>
                )}
                <button
                  type="button"
                  className="attachments-action-button"
                  onClick={() => handleDownload(attachment)}
                  aria-label={`Download ${attachment.filename}`}
                >
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ImageViewerModal
        open={imageViewerOpen}
        onClose={() => setImageViewerOpen(false)}
        imageSrc={imageViewerSrc}
        imageAlt={imageViewerAlt}
      />
    </>
  )
}
