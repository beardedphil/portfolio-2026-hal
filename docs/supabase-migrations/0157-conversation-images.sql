-- Migration: Add images column to hal_conversation_messages (0157)
-- Allows persisting image attachments so they can be referenced in follow-up messages

alter table if exists public.hal_conversation_messages
  add column if not exists images jsonb;

comment on column public.hal_conversation_messages.images is 'Array of image attachments for this message. Format: [{"dataUrl": "data:image/...", "filename": "image.png", "mimeType": "image/png"}, ...]';
