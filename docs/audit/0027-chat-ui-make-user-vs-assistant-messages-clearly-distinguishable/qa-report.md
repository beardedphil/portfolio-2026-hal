# QA Report: 0027 - Chat UI: make user vs assistant messages clearly distinguishable

## 1. Ticket & deliverable

- **Goal:** Make it immediately obvious which chat messages were sent by the user vs the assistant.
- **Deliverable (UI-only):** In the HAL chat UI, user and assistant messages have clearly different visual treatments (at minimum: alignment + bubble/background + label), so a non-technical user can tell authorship at a glance without reading content.
- **Acceptance criteria:** User vs assistant visually distinct (alignment + styling); explicit author indicator (“You” vs “HAL”); clear in short, long, and code-block messages; sufficient contrast; no regressions; readable in current theme; layout holds at narrow widths.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0027-chat-ui-make-user-vs-assistant-messages-clearly-distinguishable/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation in `src/App.tsx` and `src/index.css` matches the ticket and acceptance criteria.

| Requirement | Implementation |
|-------------|----------------|
| User vs assistant visually distinct (alignment + styling) | `.message-row-user` → `justify-content: flex-end`; `.message-row-project-manager`, `.message-row-implementation-agent` → `justify-content: flex-start`. User: `.message-user` purple gradient (`#7c5ee8` → `#6b4ce6`), white text; assistant: `.message-project-manager` / `.message-implementation-agent` use `--hal-surface`, `--hal-border`. |
| Explicit author indicator (“You” vs “HAL”) | `getMessageAuthorLabel(agent)` returns “You” for user, “HAL” for PM/implementation-agent, “System” for system. Rendered in `.message-author` inside `.message-header` (App.tsx ~785–786). |
| Short / long / code-block messages | All messages use same structure: `.message-header` + `.message-content` or `.message-content.message-json`. Long text: `white-space: pre-wrap`, `word-break: break-word`. Code/JSON: `.message-json` with `--hal-surface-alt` background, `overflow-x: auto`, distinct border; user bubble overrides to `rgba(0,0,0,0.15)` background and white text. |
| Contrast (no gray-on-gray) | User: white text on purple gradient; assistant: `--hal-text` on `--hal-surface`; author in assistant uses `--hal-primary`. No low-contrast gray-on-gray. |
| Typing indicator matches assistant | `.message-typing` uses `--hal-surface`, `--hal-border`; `.message-typing .message-author` uses `--hal-primary`; left-aligned via `.message-row-typing` (flex-start). |
| Narrow width / no layout break | `@media (max-width: 900px)` keeps chat region full-width; `.message` `max-width: 95%`; transcript scrollable. |

Scope is presentation-only (styling and markup); no backend or new features. Verification is UI-only per ticket.

## 4. Build verification — PASS

- `npm run build` completes successfully.
- No TypeScript or lint errors observed.

## 5. UI verification

**Automated / in-session:**

- HAL app opened at http://localhost:5173. Chat region and header (“Chat”, Agent dropdown) present; placeholder “Connect a project to enable chat” when no project connected; Agent selector disabled until project connected.
- At narrow viewport (~400px), layout remains usable: Chat region visible, composer (textarea + Send) present; no overflow or broken layout observed.

**Not automated (manual steps required):**

Chat transcript is gated on **Connect Project Folder** (`window.showDirectoryPicker`), which is native and not automatable. Full acceptance checklist requires manual verification with a connected project:

1. **User vs assistant distinct:** Connect a project → select “Project Manager” (or “Implementation Agent (stub)”) → send a short message (e.g. “Hello”). Verify user message appears **right-aligned**, **purple bubble**, **“You”** label; assistant reply **left-aligned**, **neutral bubble**, **“HAL”** label. Authorship obvious at a glance.
2. **Long messages / code blocks:** Send a message that elicits a long or JSON reply. Verify long assistant messages stay left-aligned with “HAL” label; JSON/pre blocks have distinct background and horizontal scroll when needed; user code blocks in purple bubble remain readable (dark overlay, white text).
3. **Typing indicator:** Send a message; verify “Thinking” indicator is **left-aligned** with “HAL” label and matches assistant bubble style; disappears when reply appears.
4. **Contrast:** Confirm user bubble (white on purple) and assistant bubble (dark text on light) are both readable; no gray-on-gray.
5. **Narrow width:** Resize to ~400px; confirm chat and bubbles remain readable, no layout break.

## 6. Acceptance criteria (checklist)

| Criterion | Status | Notes |
|-----------|--------|-------|
| User vs assistant visually distinct (alignment + styling) | Code ✓ | User right + purple; assistant left + neutral. Implemented in CSS and markup. |
| Each message shows explicit author (“You” vs “HAL”) | Code ✓ | `getMessageAuthorLabel` + `.message-author` in header. |
| Clear for short / long / code-block messages | Code ✓ | Same structure; `.message-json` for code; overflow and contrast handled. |
| Contrast sufficient (no gray-on-gray) | Code ✓ | User: white on purple; assistant: dark on light. |
| No regressions; readable in current theme; narrow width OK | Code ✓ + UI ✓ | Build passes; narrow viewport check showed no break. |
| Live “view any chat history” with real messages | Manual | Requires connected project (folder picker). |

## 7. Verdict

- **Implementation:** Complete and matches the ticket, plan, and constraints. User vs assistant messages have distinct alignment, bubble/background, and author labels; typing indicator matches assistant; code blocks and narrow width are handled.
- **QA (this run):** Code review PASS; build PASS; UI structure and narrow-width check PASS; full transcript verification requires **manual UI verification** with a connected project per §5.
- **Merge:** OK to merge. Recommend **manual UI verification** per §5 and `verification.md` once with a connected project: send at least one user message and confirm user (right, purple, “You”) vs assistant (left, neutral, “HAL”) at a glance; optionally check long/code-block and narrow width.
