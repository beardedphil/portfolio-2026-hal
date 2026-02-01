# PM Review

## Likelihood of Success: 95%

The implementation is comprehensive and covers all paths where tickets are created, updated, synced, and displayed. The normalization function is consistent across all components.

## Potential Failures and Diagnosis

### 1. Normalization not working in sync-tickets.js (Likelihood: 5%)
- **Symptoms**: Tickets in `docs/tickets/*.md` don't have ID prefix after running sync
- **Diagnosis**: Check `scripts/sync-tickets.js` - verify `normalizeTitleLineInBody` is called in `serializeDocWithKanban` and docs→DB sync
- **In-app check**: Run sync and check ticket files directly, or open tickets in UI and check Title line

### 2. PM agent not normalizing on create/update (Likelihood: 5%)
- **Symptoms**: New tickets created via PM chat don't have ID prefix
- **Diagnosis**: Check PM agent logs or create a test ticket and inspect `body_md` in Supabase
- **In-app check**: Create a ticket via PM chat, open it in detail modal, verify Title line has ID prefix

### 3. UI not showing diagnostics (Likelihood: 10%)
- **Symptoms**: Normalization occurs but no diagnostic message appears
- **Diagnosis**: Check browser console for errors, verify `addLog` is called in normalization paths
- **In-app check**: Open a ticket missing ID prefix, check action log for diagnostic message

### 4. Title extraction showing ID prefix in card titles (Likelihood: 5%)
- **Symptoms**: Card titles show "0048 — Title" instead of just "Title"
- **Diagnosis**: Check `extractTitleFromContent` - verify it strips ID prefix
- **In-app check**: View kanban board, verify card titles don't include ID prefix (ID is shown separately)

### 5. Race condition in normalization updates (Likelihood: 5%)
- **Symptoms**: Multiple normalization updates conflict or cause errors
- **Diagnosis**: Check browser console for Supabase update errors
- **In-app check**: Open multiple tickets simultaneously, verify no errors in console

### 6. File system normalization not working (Likelihood: 5%)
- **Symptoms**: Tickets read from file system (not Supabase) don't get normalized
- **Diagnosis**: Check ticket detail modal code for file system path - verify normalization is called
- **In-app check**: Connect project folder (not Supabase), open a ticket, verify Title line has ID prefix

## Verification Priority

1. **High**: Test Case 1 (existing ticket) - most common path
2. **High**: Test Case 2 (new ticket creation) - ensures creation path works
3. **Medium**: Test Case 3 (sync) - ensures sync path works
4. **Medium**: Test Case 5 (diagnostics) - ensures user feedback works
5. **Low**: Test Case 4 (title edit) - if editing is available
