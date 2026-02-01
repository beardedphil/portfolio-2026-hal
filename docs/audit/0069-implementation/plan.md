# Plan: Make "Work top ticket" buttons reliably start agent runs

## Approach

1. **Extract agent run logic** from `handleSend` into a reusable `triggerAgentRun` function that accepts message content and chat target
2. **Modify `HAL_OPEN_CHAT_AND_SEND` handler** to call `triggerAgentRun` instead of just adding the message
3. **Add status messages** that clearly show which ticket ID is being targeted when a run starts
4. **Ensure error handling** displays clear in-app messages when runs cannot be started (missing config, API errors, invalid ticket state)

## File touchpoints

- `src/App.tsx`: Extract `triggerAgentRun` function, update `HAL_OPEN_CHAT_AND_SEND` handler, update `handleSend` to use `triggerAgentRun`
