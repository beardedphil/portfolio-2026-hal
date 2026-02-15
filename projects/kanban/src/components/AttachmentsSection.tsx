import type { TicketAttachment } from './types'

export interface AttachmentsSectionProps {
  attachments: TicketAttachment[]
  loading: boolean
}

/** Attachments Section: displays file attachments for tickets (0092) */
export function AttachmentsSection({
  attachments,
  loading,
}: AttachmentsSectionProps) {
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
    // Open in new tab for viewing
    window.open(attachment.data_url, '_blank')
  }

  const isImage = (mimeType: string) => mimeType.startsWith('image/')

  return (
    <div className="attachments-section">
      <h3 className="attachments-section-title">Attachments</h3>
      <ul className="attachments-list">
        {attachments.map((attachment) => (
          <li key={attachment.pk} className="attachments-item">
            <div className="attachments-item-content">
              {isImage(attachment.mime_type) && (
                <img
                  src={attachment.data_url}
                  alt={attachment.filename}
                  className="attachments-thumbnail"
                />
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
  )
}
