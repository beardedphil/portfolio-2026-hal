import React from 'react'
import { formatTime, getMessageAuthorLabel } from '../lib/conversation-helpers'
import type { Message, ImageAttachment } from '../lib/conversationStorage'
import type { ChatTarget } from '../types/app'

interface PmChatWidgetProps {
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onClose: () => void
  displayMessages: Message[]
  displayTarget: ChatTarget
  agentTypingTarget: ChatTarget | null
  imageAttachment: ImageAttachment | null
  imageError: string | null
  sendValidationError: string | null
  inputValue: string
  implAgentRunStatus: string
  implAgentError: string | null
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onSend: () => void
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: () => void
  onContinueBatch?: () => void
  showContinueButton?: boolean
  onMessageClick?: (msg: Message) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
  transcriptRef: React.RefObject<HTMLDivElement>
  composerRef: React.RefObject<HTMLTextAreaElement>
}

export function PmChatWidget({
  isFullscreen,
  onToggleFullscreen,
  onClose,
  displayMessages,
  displayTarget,
  agentTypingTarget,
  imageAttachment,
  imageError,
  sendValidationError,
  inputValue,
  implAgentRunStatus,
  implAgentError,
  onInputChange,
  onKeyDown,
  onSend,
  onImageSelect,
  onRemoveImage,
  onContinueBatch,
  showContinueButton,
  onMessageClick,
  messagesEndRef,
  transcriptRef,
  composerRef,
}: PmChatWidgetProps) {
  // Component only renders when parent determines it should be visible (button is handled by parent)

  return (
    <div className={`pm-chat-widget ${isFullscreen ? 'pm-chat-widget-fullscreen' : 'pm-chat-widget-small'}`}>
      <div className="pm-chat-widget-header">
        <div className="pm-chat-widget-title">Project Manager</div>
        <div className="pm-chat-widget-actions">
          <button
            type="button"
            className="pm-chat-widget-fullscreen-btn btn-standard"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
            )}
          </button>
          <button
            type="button"
            className="pm-chat-widget-close-btn btn-destructive"
            onClick={onClose}
            aria-label="Close chat"
            title="Close chat"
          >
            ×
          </button>
        </div>
      </div>
      <div className="pm-chat-widget-content">
        <div className="hal-chat-panel-inner" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Agent stub banners and status panels */}
          {displayTarget === 'implementation-agent' && (
            <>
              <div className="agent-stub-banner" role="status">
                <p className="agent-stub-title">Implementation Agent — Cursor Cloud Agents</p>
                <p className="agent-stub-hint">
                  {import.meta.env.VITE_CURSOR_API_KEY
                    ? 'Say "Implement ticket XXXX" (e.g. Implement ticket 0046) to fetch the ticket, launch a Cursor cloud agent, and move the ticket to QA when done.'
                    : 'Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable.'}
                </p>
              </div>
              {(implAgentRunStatus !== 'idle' || implAgentError) && (
                <div className="impl-agent-status-panel" role="status" aria-live="polite">
                  <div className="impl-agent-status-header">
                    <span className="impl-agent-status-label">Status:</span>
                    <span className={`impl-agent-status-value impl-status-${implAgentRunStatus}`}>
                      {implAgentRunStatus === 'preparing' ? 'Preparing' :
                       implAgentRunStatus === 'fetching_ticket' ? 'Fetching ticket' :
                       implAgentRunStatus === 'resolving_repo' ? 'Resolving repository' :
                       implAgentRunStatus === 'launching' ? 'Launching agent' :
                       implAgentRunStatus === 'running' ? 'Running' :
                       implAgentRunStatus === 'polling' ? 'Running' :
                       implAgentRunStatus === 'completed' ? 'Completed' :
                       implAgentRunStatus === 'failed' ? 'Failed' : implAgentRunStatus}
                    </span>
                  </div>
                  {implAgentError && <div className="impl-agent-error">{implAgentError}</div>}
                </div>
              )}
            </>
          )}
          {/* Messages list — use chat-transcript so sidebar gets same styles as right panel */}
          <div 
            className="chat-transcript" 
            ref={(el) => {
              // Attach both refs to the same element (HAL-0701)
              // Use type assertion since we know these are mutable refs
              ;(messagesEndRef as React.MutableRefObject<HTMLDivElement | null>).current = el
              ;(transcriptRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            }}
          >
            {displayMessages.length === 0 && agentTypingTarget !== displayTarget ? (
              <p className="transcript-empty">
                {displayTarget === 'project-manager'
                  ? 'Send a message to the Project Manager to get started.'
                  : displayTarget === 'implementation-agent'
                  ? 'Ask to implement a ticket (e.g. "Implement ticket 0046").'
                  : displayTarget === 'qa-agent'
                  ? 'Ask to run QA on a ticket (e.g. "QA ticket 0046").'
                  : 'Send a message to start the conversation.'}
              </p>
            ) : (
              <>
                {displayMessages.map((msg) => (
                  <div key={msg.id} className={`message-row message-row-${msg.agent}`} data-agent={msg.agent}>
                    <div
                      className={`message message-${msg.agent} ${displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? 'message-clickable' : ''}`}
                      onClick={onMessageClick && displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? () => onMessageClick(msg) : undefined}
                      style={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? { cursor: 'pointer' } : undefined}
                      title={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? 'Click to view sent prompt' : undefined}
                    >
                      <div className="message-header">
                        <span className="message-author">{getMessageAuthorLabel(msg.agent)}</span>
                        <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                        {displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText && (
                          <span className="message-prompt-indicator" title="Click to view sent prompt">📋</span>
                        )}
                        {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                          <div className="message-images">
                            {msg.imageAttachments.map((img, idx) => (
                              <div key={idx} className="message-image-container">
                                <img src={img.dataUrl} alt={img.filename} className="message-image-thumbnail" />
                                <span className="message-image-filename">{img.filename}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.content.trimStart().startsWith('{') ? (
                          <pre className="message-content message-json">{msg.content}</pre>
                        ) : (
                          <span className="message-content">{msg.content}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {agentTypingTarget === displayTarget && (
                  <div className="message-row message-row-typing" data-agent="typing" aria-live="polite">
                    <div className="message message-typing">
                      <div className="message-header">
                        <span className="message-author">HAL</span>
                      </div>
                      <span className="typing-bubble">
                        <span className="typing-label">Thinking</span>
                        <span className="typing-dots">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Composer — use chat-composer and composer-input-row so sidebar matches right panel */}
          <div className="chat-composer">
            {imageAttachment && (
              <div className="image-attachment-preview">
                <img src={imageAttachment.dataUrl} alt={imageAttachment.filename} className="attachment-thumbnail" />
                <span className="attachment-filename">{imageAttachment.filename}</span>
                <button type="button" className="remove-attachment-btn btn-destructive" onClick={onRemoveImage} aria-label="Remove attachment">×</button>
              </div>
            )}
            {(imageError || sendValidationError) && (
              <div className="image-error-message" role="alert">{imageError || sendValidationError}</div>
            )}
            <div className="composer-input-row">
              <textarea
                ref={composerRef}
                className="message-input"
                value={inputValue}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder="Type a message... (Enter to send)"
                rows={2}
                aria-label="Message input"
              />
              <label className="attach-image-btn btn-standard" title="Attach image">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={onImageSelect}
                  style={{ display: 'none' }}
                  aria-label="Attach image"
                />
                📎
              </label>
              {showContinueButton && onContinueBatch && (
                <button type="button" className="continue-batch-btn send-btn btn-standard" onClick={onContinueBatch} title="Continue moving the next batch of tickets">
                  Continue
                </button>
              )}
              <button type="button" className="send-btn btn-standard" onClick={onSend} disabled={!!imageError}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
