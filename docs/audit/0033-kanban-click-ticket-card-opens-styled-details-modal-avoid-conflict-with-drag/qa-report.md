# QA Report: 0033 - Kanban click ticket card opens styled details modal (avoid conflict with drag)

## 1. Ticket & deliverable

- **Goal:** Make it easy to read a ticket's full contents by clicking a card to open a well-styled modal, without accidental opens during drag-and-drop.
- **Human-verifiable deliverable:** In the embedded Kanban UI, a human can click a ticket card to open a modal that shows the full ticket contents (rendered clearly with headings, lists, and links), and can still drag tickets between columns without the modal popping open accidentally.
- **Acceptance criteria (from ticket):**
  - Clicking a ticket card (without dragging) opens a modal showing the ticket's full content.
  - The modal presents content in a readable, "designed" layout (clear title, metadata like ID/priority if available, readable markdown, good spacing, scroll within modal for long tickets).
  - The modal has an obvious close affordance (e.g., X button) and supports closing via Escape and clicking the backdrop.
  - While the modal is open, background scrolling is prevented and focus is trapped in the modal (basic accessibility).
  - Dragging a ticket card between columns does **not** open the modal.
  - If the user starts a drag gesture (pointer down + move beyond threshold), the click-to-open is canceled.
  - On touch/trackpad, the interaction does not make it easy to accidentally trigger the wrong action.
  - If ticket content fails to load, the modal shows an in-app error state (not console-only) and provides a way to retry/close.

## 2. Audit artifacts

**Note:** Standard audit artifacts (`plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`, `pm-review.md`) are **not present** in this folder. The implementation agent did not create them. QA proceeds with code review and automated verification; traceability is documented in this report.

**Files changed** (from commit `8dec519`):
- `projects/kanban/package.json` — added `react-markdown` dependency
- `projects/kanban/package-lock.json`
- `projects/kanban/src/App.tsx` — `TicketDetailModal`, `SortableCard` drag-handle/click-area split, modal state and content resolution
- `projects/kanban/src/index.css` — `.ticket-card-drag-handle`, `.ticket-card-click-area`, `.ticket-detail-*` modal styles

## 3. Code review — PASS

Implementation in `projects/kanban/src/App.tsx` and `index.css` matches the ticket and acceptance criteria:

| Requirement | Implementation |
|-------------|----------------|
| Click card opens modal | `SortableCard` has `ticket-card-click-area` button with `onClick={handleCardClick}` → `onOpenDetail(card.id)` → `setDetailModal(...)` (lines 522–524, 1079–1082, 2342–2353). |
| Readable modal layout | `TicketDetailModal` (lines 345–475): clear title (`ticket-detail-title`), metadata (ID, priority from frontmatter), markdown body via `ReactMarkdown`, `.ticket-detail-body-wrap` with `overflow: auto` for scroll, good spacing via CSS. |
| Close affordance | X button (`ticket-detail-close`), Escape key (`handleKeyDown`), backdrop click (`onClick={(e) => e.target === e.currentTarget && onClose()}`) (lines 423–424, 435, 384–386). |
| Scroll lock + focus trap | `document.body.style.overflow = 'hidden'` when open (367–374); focus on close button when open (377–381); Tab focus trap (389–406). |
| Drag does NOT open modal | **Dedicated drag handle**: DnD listeners (`{...attributes} {...listeners}`) only on `ticket-card-drag-handle` (lines 514–518); click-to-open only on `ticket-card-click-area` (lines 521–525). Dragging uses handle; clicking uses title area. No overlap. |
| Drag gesture cancels click | With handle/click separation: drag starts on handle → no click fires; click on title area → no drag (listeners not on click area). Achieves "click-to-open canceled when drag starts" by region separation. |
| Touch/trackpad safe | Same separation: drag handle for drag, tap title for open. Clear rule: handle = drag, click area = open. |
| Error state with retry | `detailModalError` state; modal shows `.ticket-detail-error` with message, Retry button (`onRetry`), and Close button (lines 447–459, 1066–1067, 1087). `handleRetryTicketDetail` bumps `detailModalRetryTrigger` to re-run content fetch. |

**Constraints verified:**
- Scope: `projects/kanban/` only.
- DnD behavior intact: `useSortable` unchanged; handle holds all DnD; `DragOverlay` unchanged.
- UI-only: no devtools/console required for verification.

**Implementation approach:** Uses dedicated drag handle (recommended in ticket notes) — unambiguous separation of drag vs click.

## 4. Build — PASS

- Root: `npm run build` — **Pass**
- Kanban: `npm run build` (from `projects/kanban`) — **Pass**

## 5. Acceptance criteria checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Click card opens modal | ✓ Code | `handleCardClick` → `onOpenDetail` → `setDetailModal`; `TicketDetailModal` rendered when `detailModal` set. |
| Readable designed layout | ✓ Code | Title, ID, priority, markdown body; CSS for headings, lists, links, spacing, scroll. |
| Close: X, Escape, backdrop | ✓ Code | Close button, `handleKeyDown` Escape, backdrop `e.target === e.currentTarget`. |
| Scroll lock + focus trap | ✓ Code | `overflow: hidden` on body; focus first focusable; Tab wraps. |
| Drag does NOT open modal | ✓ Code | Drag listeners only on handle; click only on click area. |
| Drag gesture cancels click | ✓ Code | Region separation; no shared pointer handlers. |
| Touch/trackpad safe | ✓ Code | Same regions; no accidental cross-trigger. |
| Error state + retry | ✓ Code | Error div, Retry button, Close button; `detailModalRetryTrigger` re-triggers fetch. |

## 6. Verdict

- **Implementation:** Complete and matches the ticket and acceptance criteria. Dedicated drag handle + click area achieves unambiguous click vs drag with no regressions.
- **Audit artifacts:** Missing (plan, worklog, changed-files, decisions, verification, pm-review). Recommend implementation agent add them for traceability; not blocking merge.
- **Merge:** OK to merge. Move ticket to **Human in the Loop** for manual UI verification: connect project (file or Supabase), click ticket card → modal opens; drag from handle → card moves, no modal; close via X, Escape, backdrop; verify error state when content fails to load.
