# Decisions: Image Attachment in HAL Chat (0077)

## Vision model detection

**Decision:** Detect vision models by checking if model name includes "vision" or "gpt-4o"

**Why:** GPT-4o and GPT-4 Vision models support image inputs, but other models (like gpt-3.5-turbo) do not. We need to format the prompt differently for vision models.

**Trade-off:** Simple string matching may not catch all vision models, but it covers the common cases. If new vision models are added, the check can be updated.

## Type assertion for AI SDK

**Decision:** Use `as any` type assertion when passing array prompt to `generateText`

**Why:** The Vercel AI SDK supports array format for vision models, but TypeScript types may not fully reflect this. The type assertion allows the code to compile while maintaining runtime compatibility.

**Trade-off:** Type safety is reduced, but this is necessary for vision model support until AI SDK types are updated.

## Validation error display

**Decision:** Reuse `image-error-message` CSS class for send validation errors

**Why:** Consistent styling and user experience. Both are validation errors shown in the same location.

**Trade-off:** CSS class name is slightly misleading for non-image errors, but the visual consistency is more important.

## Payload summary format

**Decision:** Display payload summary as "Text only", "Image only", or "Text + N images"

**Why:** Clear, concise, human-readable format that immediately shows what was sent without requiring console inspection.

**Trade-off:** Could be more detailed (e.g., character count, image dimensions), but simplicity is preferred for diagnostics.
