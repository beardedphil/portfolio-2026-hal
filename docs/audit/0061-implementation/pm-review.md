# PM Review: Auto-move tickets on agent completion (0061)

## Likelihood of success: 85%

The implementation follows established patterns (Supabase ticket moves, diagnostics UI) and handles edge cases (ticket ID extraction, error diagnostics). The main risk is timing - Kanban board polling may cause a delay before moves are visible.

## Potential failures (ranked by likelihood)

### 1. **Ticket ID extraction fails** (Medium)
- **Symptoms**: Auto-move diagnostics show "Could not determine ticket ID from message"
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics section. Look for error entries mentioning ticket ID extraction.
- **Mitigation**: Implementation extracts ticket ID from multiple sources (initial message, completion message, regex patterns). If all fail, diagnostic explains why.

### 2. **Supabase update fails** (Low)
- **Symptoms**: Auto-move diagnostics show Supabase error (network/auth/row not found)
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics section. Error message explains the failure reason.
- **Mitigation**: Error is logged to in-app diagnostics; user can manually move ticket if needed.

### 3. **Kanban board doesn't reflect move** (Low)
- **Symptoms**: Ticket moves in Supabase but doesn't appear in new column on Kanban board
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics shows success, but Kanban board doesn't update. Wait ~10 seconds (polling interval) or refresh page.
- **Mitigation**: Kanban board polls Supabase every ~10 seconds. If move succeeded (diagnostics confirm), board will update on next poll or after refresh.

### 4. **QA verdict detection fails** (Low)
- **Symptoms**: QA Agent completes with PASS but ticket doesn't move to Human in the Loop
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics. If no entry, verdict detection may have failed. Check QA Agent completion message for PASS indicators.
- **Mitigation**: Implementation checks multiple signals (verdict field, success flag, text patterns). If all fail, diagnostic explains why auto-move was skipped.

### 5. **Race condition with backend move** (Very Low)
- **Symptoms**: Ticket moves twice or to wrong column
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics. Check Kanban board column. Backend also moves tickets, so there may be a race.
- **Mitigation**: Frontend auto-move is a fallback; backend moves are authoritative. If both succeed, ticket ends up in correct column (last write wins in Supabase).

## In-app diagnostics

All failures are visible in **Diagnostics panel** → **Auto-move diagnostics** section (only visible when viewing Implementation Agent or QA Agent chat). Each entry includes:
- Timestamp
- Message explaining what happened (error or info)
- Color coding (red for errors, green for info)

## Verification checklist

- [ ] Implementation Agent completion moves ticket to QA (visible in Kanban board)
- [ ] QA Agent completion (PASS) moves ticket to Human in the Loop (visible in Kanban board)
- [ ] Auto-move diagnostics show success entries for successful moves
- [ ] Auto-move diagnostics show error entries when ticket ID cannot be determined
- [ ] Auto-move diagnostics show error entries when Supabase update fails
- [ ] QA Agent completion (FAIL) does not trigger auto-move
- [ ] Moves persist after page refresh
