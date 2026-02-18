interface PmChatWidgetButtonProps {
  onClick: () => void
}

export function PmChatWidgetButton({ onClick }: PmChatWidgetButtonProps) {
  return (
    <button
      type="button"
      className="pm-chat-widget-button btn-standard"
      onClick={onClick}
      aria-label="Open PM chat"
      title="Open PM chat"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>
  )
}
