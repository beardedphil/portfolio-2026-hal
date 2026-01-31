# PM Review: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## Summary (1–3 bullets)

- User messages right-aligned with purple accent bubble and "You" label; assistant messages left-aligned with neutral bubble and "HAL" label.
- Explicit author indicator ("You" vs "HAL" vs "System") on every message.
- Typing indicator visually matches assistant side (left-aligned, "HAL" label).

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**
- Classic chat layout (right user, left assistant) is well-understood; implementation matches ticket spec.
- Contrast and structure meet accessibility requirements (white on purple, dark on light).
- Changes are presentation-only; no backend or data model changes.

## What to verify (UI-only)

- Connect project, send PM message: user bubble right/purple with "You"; PM reply left/neutral with "HAL".
- Long messages and code blocks: layout and readability preserved.
- Typing indicator: left-aligned, "HAL" label, disappears when reply appears.
- Narrow width: layout does not break.

## Potential failures (ranked)

1. **Purple gradient contrast** — User bubble text hard to read in some lighting; gradient might render differently across browsers. Check contrast ratio (4.5:1 minimum). Confirm visually.
2. **Narrow width overflow** — Bubbles at 95% max-width might still cause horizontal scroll in very narrow viewports. Test at 320px.
3. **Standup layout** — Multiple "HAL" and "System" messages in sequence; ensure spacing and visual hierarchy remain clear.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None.

## Follow-ups (optional)

- Consider markdown rendering for PM replies (bold, code) if content uses it; currently plain text.
