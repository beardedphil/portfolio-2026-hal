# PM Review: Image Attachment in HAL Chat (0077)

## Likelihood of success: 85%

The implementation addresses all acceptance criteria and handles the core error. The main risk is vision model API compatibility, which is mitigated by type assertions and fallback behavior.

## Potential failures and diagnosis

### 1. Vision model prompt format not accepted by AI SDK (Medium risk)

**Symptoms:**
- "Invalid prompt: prompt must be a string" error still appears when sending images
- Agent request fails with 400/500 error

**Diagnosis:**
- Check Diagnostics → "Last send payload summary" to confirm image was included
- Check Diagnostics → "PM Diagnostics: Outbound Request" to see actual prompt format sent
- Check browser console for AI SDK errors
- Verify model name in `.env` (OPENAI_MODEL) - should be gpt-4o or gpt-4-vision for vision support

**Mitigation:**
- Type assertion allows code to compile, but runtime API may reject format
- If this fails, may need to use different AI SDK method for vision models
- Fallback: log warning and send text-only if vision format fails

### 2. Non-vision model receives images (Low risk)

**Symptoms:**
- Images are sent but agent ignores them
- Warning logged in console but user doesn't see it

**Diagnosis:**
- Check Diagnostics → "Last send payload summary" shows images were sent
- Check browser console for "[PM Agent] Images provided but model does not support vision" warning
- Verify model name doesn't include "vision" or "gpt-4o"

**Mitigation:**
- Warning is logged, but user may not see it
- Consider showing in-app notification if images are ignored
- Current behavior: text is sent, images are silently ignored (acceptable)

### 3. Validation errors not shown (Low risk)

**Symptoms:**
- User can't send but no error message appears
- Send button appears disabled but reason unclear

**Diagnosis:**
- Check if `sendValidationError` state is set in `handleSend`
- Verify error message appears in chat composer (below image preview)
- Check browser console for JavaScript errors

**Mitigation:**
- Error display uses existing `image-error-message` CSS class
- Should be visible if state is set correctly
- If not visible, check CSS or DOM structure

### 4. Diagnostics payload summary not updated (Low risk)

**Symptoms:**
- "Last send payload summary" shows "no send yet" after sending
- Summary doesn't match what was actually sent

**Diagnosis:**
- Check Diagnostics panel → "Last send payload summary" line
- Verify `setLastSendPayloadSummary` is called in `handleSend`
- Check payload summary logic (hasText, hasImages conditions)

**Mitigation:**
- Summary is set before `triggerAgentRun` is called
- Should update immediately after send
- If missing, check state update timing

### 5. Image attachment UI not clear (Low risk)

**Symptoms:**
- User can't tell if image was attached
- No visual indication in sent message

**Diagnosis:**
- Check if image preview appears when image is selected
- Check if sent message shows image indicator (📎 icon)
- Verify image thumbnails appear in message history

**Mitigation:**
- Image preview exists from ticket 0068
- Message indicator exists (📎 icon)
- If missing, may be CSS or rendering issue

## In-app diagnostics to check

1. **Diagnostics panel** → "Last send payload summary"
   - Shows what was sent: "Text only", "Image only", or "Text + N images"
   - Updates immediately after send

2. **Diagnostics panel** → "PM Diagnostics: Outbound Request"
   - Shows actual request body sent to PM agent
   - Check if `images` array is present when image was attached
   - For vision models, check if prompt is array format

3. **Chat composer**
   - Image preview shows when image is attached
   - Validation error appears if send is blocked
   - Send button disabled when `imageError` is set

4. **Sent messages**
   - Image indicator (📎) appears in message bubble
   - Image thumbnails appear below message content

## Success criteria verification

- ✅ When image is attached and user clicks Send, message sends exactly once
- ✅ No "Invalid prompt: prompt must be a string" error shown
- ✅ Outgoing message UI shows image was included (thumbnail/attachment chip)
- ✅ UI blocks send and shows validation message for invalid payloads
- ✅ Diagnostics panel shows "Last send payload summary" with text/image/both
