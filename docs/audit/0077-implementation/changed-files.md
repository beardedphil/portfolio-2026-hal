# Changed Files: Image Attachment in HAL Chat (0077)

## Modified files

1. **projects/hal-agents/src/agents/projectManager.ts**
   - Updated prompt building to handle images for vision models
   - Added detection for vision models (gpt-4o, gpt-4-vision)
   - Build prompt as array of content parts when images are present and model supports vision
   - Added type assertion for AI SDK compatibility

2. **vite.config.ts**
   - Updated `/api/pm/respond` endpoint validation
   - Allow empty message when images are present
   - Improved error message clarity

3. **src/App.tsx**
   - Added `sendValidationError` state for UI validation feedback
   - Added `lastSendPayloadSummary` state for diagnostics
   - Updated `handleSend` to track payload summary and validate before sending
   - Added validation error display in both chat composers
   - Updated `DiagnosticsInfo` type to include `lastSendPayloadSummary`
   - Added diagnostics display for last send payload summary
