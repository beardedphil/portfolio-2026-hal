# Plan: Image Attachment in HAL Chat (0077)

## Approach

1. **Fix PM agent image handling**
   - Update `projects/hal-agents/src/agents/projectManager.ts` to properly handle images in the prompt
   - For vision models (gpt-4o, gpt-4-vision), use array format with text and image parts
   - For non-vision models, use string format and log warning if images are provided

2. **Update message validation**
   - Modify `vite.config.ts` to allow empty message when images are present
   - Add validation in `src/App.tsx` `handleSend` to show clear error messages

3. **Add diagnostics**
   - Add `lastSendPayloadSummary` state to track what was sent (text/image/both)
   - Display in Diagnostics panel under "Last send payload summary"

4. **Improve validation feedback**
   - Add `sendValidationError` state for clear UI feedback
   - Show validation errors in chat composer when send is blocked

## File touchpoints

- `projects/hal-agents/src/agents/projectManager.ts` - PM agent prompt building with images
- `vite.config.ts` - API endpoint validation for empty message + images
- `src/App.tsx` - UI validation, diagnostics, payload tracking
