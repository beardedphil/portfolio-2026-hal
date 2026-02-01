# Plan: QA agent status/progress persistence (0062)

## Goal
Make QA agent status/progress updates persist in the QA chat when the user navigates away and back.

## Approach

1. **Add QA Agent progress state and persistence**
   - Add `qaAgentProgress` state array (similar to `implAgentProgress`)
   - Add `qaAgentError` state (similar to `implAgentError`)
   - Add localStorage keys for QA agent status, progress, and error
   - Add useEffect hooks to load/save QA agent state from localStorage

2. **Update QA agent run handler**
   - Add `addProgress` helper function to add progress messages to both conversation and progress state
   - Update stage handlers to emit progress messages for each stage
   - Store error messages in `qaAgentError` state

3. **Add QA Agent status panel UI**
   - Add status panel similar to Implementation Agent status panel
   - Show status, error (if any), and progress feed
   - Display persisted status when navigating back to QA chat

4. **Reset status after completion**
   - Reset status to 'idle' after completion/failure with a delay (5 seconds)
   - Clear progress and error when resetting to avoid stale "running" indicators

## File touchpoints

- `src/App.tsx`: Add QA agent state, persistence logic, progress handlers, status panel UI
