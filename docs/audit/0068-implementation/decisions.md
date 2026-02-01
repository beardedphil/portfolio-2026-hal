# Decisions

## Image format and validation
- **Supported types**: JPEG, PNG, GIF, WebP (common web image formats)
- **Max size**: 10MB (reasonable for most use cases, prevents excessive memory usage)
- **Validation**: Client-side validation with in-app error messages (not console-only)

## Image storage and serialization
- **In-memory**: Full `ImageAttachment` objects with File objects for sending
- **Serialization**: Only `dataUrl` and `filename` stored in localStorage (File objects can't be serialized)
- **After deserialization**: Dummy File objects created for type compatibility (won't be used for sending)

## UI/UX decisions
- **Preview location**: Above text input in composer (before sending)
- **Thumbnail size**: 48x48px in composer, max 200px in messages
- **Attachment indicator**: Shows count in message header (📎 N)
- **Remove button**: Simple "×" button in preview
- **Error display**: Red background, clear message, blocks sending

## Backend integration
- **PM agent**: Images included in prompt array format for vision models (OpenAI)
- **Implementation/QA agents**: Endpoints accept images but don't use them yet (Cursor API may support in future)
- **Request format**: Base64 data URLs with filename and MIME type

## Unrequested changes
None - all changes are required to satisfy acceptance criteria.
