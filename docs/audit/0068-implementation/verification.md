# Verification Steps

## Code review
- [x] Message type includes optional `imageAttachments`
- [x] Image attachment UI components present in composer
- [x] Image validation (type and size) with in-app error messages
- [x] Images included in request payload to external LLMs
- [x] Image thumbnails displayed in sent messages
- [x] Remove attachment functionality works
- [x] PM agent endpoint accepts and passes images
- [x] PM agent includes images in prompt for vision models

## UI verification (manual steps for user)

1. **Attach image button**
   - Open HAL app and navigate to any agent chat (PM, Implementation, QA)
   - Verify "Attach image" button (📎) appears next to Send button in composer
   - Click the button and verify file picker opens

2. **Image selection and preview**
   - Select a valid image file (JPEG, PNG, GIF, or WebP)
   - Verify thumbnail preview appears above text input
   - Verify filename is displayed
   - Verify remove button (×) appears

3. **Image validation**
   - Try selecting a non-image file (e.g., .txt, .pdf)
   - Verify error message appears: "Unsupported file type..."
   - Try selecting an image larger than 10MB
   - Verify error message appears: "File is too large..."
   - Verify Send button is disabled when error is present

4. **Sending message with image**
   - Select a valid image
   - Type a message (optional)
   - Click Send
   - Verify message appears in transcript with:
     - Image attachment indicator (📎 1) in message header
     - Image thumbnail(s) displayed
     - Filename(s) shown below thumbnails

5. **Remove attachment**
   - Select an image
   - Click the remove button (×)
   - Verify preview disappears
   - Verify message can be sent without image

6. **Multiple images** (if supported in future)
   - Currently supports single image; UI is ready for multiple if needed

7. **PM agent with images**
   - Send a message with an image to PM agent
   - Verify image is included in request payload
   - Verify PM agent receives and can process the image (if using vision model)
