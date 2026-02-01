# Plan: Image Attachment Support for HAL Agent Chat

## Approach
1. **Update data types**: Add `ImageAttachment` type and extend `Message` type to include optional image attachments
2. **Add UI components**: 
   - "Attach image" button in composer
   - File input (hidden, triggered by button)
   - Thumbnail preview with filename and remove button
   - Error message display for validation failures
3. **Image validation**: 
   - File type check (JPEG, PNG, GIF, WebP)
   - File size check (max 10MB)
   - In-app error messages (not console-only)
4. **Update message handling**:
   - `handleSend` to include image attachments
   - `addMessage` to accept and store image attachments
   - `triggerAgentRun` to pass images to agent endpoints
5. **Update message display**: Show image thumbnails and attachment indicators in sent messages
6. **Backend integration**:
   - Update PM agent endpoint to accept images
   - Update PM agent config and implementation to use images in prompts
   - Update Implementation/QA endpoints to accept images (for future use)
7. **Serialization**: Handle image attachments in localStorage persistence (File objects can't be serialized)

## File touchpoints
- `src/App.tsx`: Message types, state, UI, handlers, display
- `src/index.css`: Styles for attachment UI
- `vite.config.ts`: PM agent endpoint to accept images
- `projects/hal-agents/src/agents/projectManager.ts`: Config and prompt to include images
