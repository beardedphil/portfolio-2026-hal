import React from 'react'

export function HumanValidationSection({
  ticketId: _ticketId,
  ticketPk: _ticketPk,
  stepsToValidate,
  notes,
  onStepsChange,
  onNotesChange,
  onPass,
  onFail,
  isProcessing,
}: {
  ticketId: string
  ticketPk: string
  stepsToValidate: string
  notes: string
  onStepsChange: (value: string) => void
  onNotesChange: (value: string) => void
  onPass: () => void
  onFail: () => void
  isProcessing: boolean
}) {
  return (
    <div className="human-validation-section">
      <h3 className="human-validation-title">Human validation</h3>
      <div className="human-validation-fields">
        <label className="human-validation-field">
          <span className="human-validation-label">Steps to validate</span>
          <textarea
            className="human-validation-textarea"
            value={stepsToValidate}
            onChange={(e) => onStepsChange(e.target.value)}
            placeholder="Enter validation steps (one per line or freeform text)"
            rows={4}
            disabled={isProcessing}
          />
        </label>
        <label className="human-validation-field">
          <span className="human-validation-label">Notes</span>
          <textarea
            className="human-validation-textarea"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Enter any notes or feedback"
            rows={4}
            disabled={isProcessing}
          />
        </label>
      </div>
      <div className="human-validation-actions">
        <button
          type="button"
          className="human-validation-button human-validation-button-pass"
          onClick={onPass}
          disabled={isProcessing}
        >
          Pass
        </button>
        <button
          type="button"
          className="human-validation-button human-validation-button-fail"
          onClick={onFail}
          disabled={isProcessing}
        >
          Fail
        </button>
      </div>
    </div>
  )
}
