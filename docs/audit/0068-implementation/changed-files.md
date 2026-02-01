# Changed Files

## src/App.tsx
- Added `ImageAttachment` type and extended `Message` type with optional `imageAttachments`
- Added state: `imageAttachment`, `imageError`
- Added handlers: `handleImageSelect`, `handleRemoveImage`
- Updated `handleSend` to include image attachments
- Updated `addMessage` to accept image attachments parameter
- Updated `triggerAgentRun` to accept and pass image attachments
- Updated composer UI with attachment preview and attach button
- Updated message display to show image thumbnails
- Updated serialization to handle image attachments (File objects can't be serialized)

## src/index.css
- Added styles for image attachment UI components
- Updated composer layout styles

## vite.config.ts
- Updated PM agent endpoint to accept `images` array in request body
- Passes images to PM agent config

## projects/hal-agents/src/agents/projectManager.ts
- Added `images` to `PmAgentConfig` interface
- Updated `generateText` call to include images in prompt for vision models
