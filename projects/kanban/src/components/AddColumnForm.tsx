interface AddColumnFormProps {
  newColumnTitle: string
  addColumnError: string | null
  onTitleChange: (title: string) => void
  onCreate: () => void
  onCancel: () => void
}

export function AddColumnForm({
  newColumnTitle,
  addColumnError,
  onTitleChange,
  onCreate,
  onCancel,
}: AddColumnFormProps) {
  return (
    <div className="add-column-form" role="form" aria-label="Add column form">
      <input
        type="text"
        value={newColumnTitle}
        onChange={(e) => {
          onTitleChange(e.target.value)
        }}
        placeholder="Column name"
        autoFocus
        aria-label="Column name"
        aria-invalid={!!addColumnError}
        aria-describedby={addColumnError ? 'add-column-error' : undefined}
      />
      {addColumnError && (
        <p id="add-column-error" className="add-column-error" role="alert">
          {addColumnError}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onCreate}>
          Create
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
