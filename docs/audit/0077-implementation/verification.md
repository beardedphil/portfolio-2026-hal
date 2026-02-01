# Verification: Image Attachment in HAL Chat (0077)

## Code review checklist

- [x] PM agent properly handles images in prompt building
- [x] Vision model detection works (gpt-4o, gpt-4-vision)
- [x] Non-vision models gracefully handle images (warning logged, text sent)
- [x] API endpoint allows empty message when images present
- [x] UI validation prevents sending empty payload
- [x] Validation errors displayed clearly in UI
- [x] Diagnostics show last send payload summary
- [x] TypeScript compilation succeeds

## Automated checks

1. **Build verification**
   - Run: `npm run build --prefix projects/hal-agents`
   - Expected: Build succeeds without TypeScript errors

2. **Lint check**
   - Run: `npm run lint` (if available)
   - Expected: No linting errors

## Manual UI verification steps

1. **Image attachment**
   - Attach an image in HAL chat
   - Verify image preview appears
   - Verify filename is shown
   - Verify remove button works

2. **Send with image**
   - Attach an image
   - Click Send (with or without text)
   - Verify no "Invalid prompt" error appears
   - Verify message sends successfully
   - Verify image indicator appears in sent message

3. **Send validation**
   - Try to send with empty message and no image
   - Verify validation error appears: "Please enter a message or attach an image before sending."
   - Add text or image, verify error clears

4. **Diagnostics**
   - Send a message with text only
   - Open Diagnostics panel
   - Verify "Last send payload summary" shows "Text only"
   - Send a message with image only
   - Verify payload summary shows "1 image only" (or "N images only" for multiple)
   - Send a message with text + image
   - Verify payload summary shows "Text + 1 image" (or "Text + N images")

5. **Vision model support**
   - If using gpt-4o or gpt-4-vision model:
     - Send message with image
     - Verify image is included in agent request
     - Verify agent processes image correctly
   - If using non-vision model:
     - Send message with image
     - Verify warning is logged (check console)
     - Verify text message is sent (image ignored)

## Edge cases

- [ ] Multiple images (if supported in future)
- [ ] Very large images (10MB limit enforced)
- [ ] Invalid image types (validation should block)
- [ ] Image attachment removed before send
- [ ] Send button disabled when image error present
