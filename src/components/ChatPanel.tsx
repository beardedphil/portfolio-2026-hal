import React, { useRef } from 'react'
import type { Agent, Message, ImageAttachment } from '../lib/conversationStorage'
import { formatTime, getMessageAuthorLabel } from '../lib/conversation-helpers'

interface ChatPanelProps {
  displayTarget: Agent
  displayMessages: Message[]
  agentTypingTarget: Agent | null
  implAgentRunStatus: 'idle' | 'preparing' | 'fetching_ticket' | 'resolving_repo' | 'launching' | 'polling' | 'running' | 'completed' | 'failed'
  implAgentError: string | null
  qaAgentRunStatus: 'idle' | 'preparing' | 'fetching_ticket' | 'fetching_branch' | 'launching' | 'polling' | 'reviewing' | 'generating_report' | 'merging' | 'moving_ticket' | 'completed' | 'failed'
  qaAgentError: string | null
  inputValue: string
  imageAttachment: ImageAttachment | null
  imageError: string | null
  sendValidationError: string | null
  composerRef: React.RefObject<HTMLTextAreaElement>
  messagesEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: () => void
  onSend: () => void
  onContinueBatch: () => void
  onPromptClick: (message: Message) => void
  showContinueButton: boolean
}

export function ChatPanel({
  displayTarget,
  displayMessages,
  agentTypingTarget,
  implAgentRunStatus,
  implAgentError,
  qaAgentRunStatus,
  qaAgentError,
  inputValue,
  imageAttachment,
  imageError,
  sendValidationError,
  composerRef,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onImageSelect,
  onRemoveImage,
  onSend,
  onContinueBatch,
  onPromptClick,
  showContinueButton,
}: ChatPanelProps) {
  return (
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
      {displayTarget === 'qa-agent' && (
        <>
          <div className="agent-stub-banner" role="status">
            <p className="agent-stub-title">QA Agent — Cursor Cloud Agents</p>
            <p className="agent-stub-hint">
              {import.meta.env.VITE_CURSOR_API_KEY
                ? 'Say "QA ticket XXXX" to run QA for a ticket. The agent will run in the cloud and report results here.'
                : 'Cursor API is not configured.'}
            </p>
          </div>
          {(qaAgentRunStatus !== 'idle' || qaAgentError) && (
            <div className="impl-agent-status-panel" role="status" aria-live="polite">
              <div className="impl-agent-status-header">
                <span className="impl-agent-status-label">Status:</span>
                <span className={`impl-agent-status-value impl-status-${qaAgentRunStatus}`}>
                  {qaAgentRunStatus === 'preparing' ? 'Preparing' :
                   qaAgentRunStatus === 'fetching_ticket' ? 'Fetching ticket' :
                   qaAgentRunStatus === 'fetching_branch' ? 'Finding branch' :
                   qaAgentRunStatus === 'launching' ? 'Launching QA' :
                   qaAgentRunStatus === 'reviewing' ? 'Reviewing' :
                   qaAgentRunStatus === 'polling' ? 'Reviewing' :
                   qaAgentRunStatus === 'generating_report' ? 'Generating report' :
                   qaAgentRunStatus === 'merging' ? 'Merging' :
                   qaAgentRunStatus === 'moving_ticket' ? 'Moving ticket' :
                   qaAgentRunStatus === 'completed' ? 'Completed' :
                   qaAgentRunStatus === 'failed' ? 'Failed' : qaAgentRunStatus}
                </span>
              </div>
              {qaAgentError && <div className="impl-agent-error">{qaAgentError}</div>}
            </div>
          )}
        </>
      )}
      {/* Messages list — use chat-transcript so sidebar gets same styles as right panel */}
      <div className="chat-transcript" ref={messagesEndRef}>
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
                  onClick={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? () => onPromptClick(msg) : undefined}
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
            <button type="button" className="remove-attachment-btn" onClick={onRemoveImage} aria-label="Remove attachment">×</button>
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
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message... (Enter to send)"
            rows={2}
            aria-label="Message input"
          />
          <label className="attach-image-btn" title="Attach image">
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              onChange={onImageSelect}
              style={{ display: 'none' }}
              aria-label="Attach image"
            />
            📎
          </label>
          {showContinueButton && (
            <button type="button" className="continue-batch-btn send-btn" onClick={onContinueBatch} title="Continue moving the next batch of tickets">
              Continue
            </button>
          )}
          <button type="button" className="send-btn" onClick={onSend} disabled={!!imageError}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
