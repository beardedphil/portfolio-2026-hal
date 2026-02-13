# Verification (0013-dnd-supabase-tickets-into-kanban)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. A Supabase project with the `tickets` table (e.g. from 0011/0012) and at least a few tickets (e.g. imported via 0012).

---

## Step 1: Supabase mode and draggable list
- **Action:** Open Ticket Store, click **Supabase**. Enter Project URL and Anon key, click **Connect**. Wait until status is **Connected**.
- **Check:** The Columns section shows **To-do**, **Doing**, **Done** (possibly empty). Below, the Supabase ticket list shows tickets; the text says "Found N tickets. Drag into a column to save." Each ticket in the list can be dragged (grab and move slightly to see drag feedback).
- **Pass:** Board shows three columns; list shows tickets and mentions dragging; list items are draggable.

---

## Step 2: Drag from list into To-do
- **Action:** Drag a ticket from the Supabase ticket list and drop it onto the **To-do** column (or into the empty area of the To-do column).
- **Check:** The ticket appears as a card in To-do immediately. Action log (if you have Debug open) shows something like "Supabase ticket XXXX dropped into To-do."
- **Pass:** Ticket appears in To-do after drop.

---

## Step 3: Move ticket To-do → Doing
- **Action:** Drag the same ticket (now a card in To-do) and drop it into the **Doing** column.
- **Check:** The card moves from To-do to Doing. It stays in Doing (no flicker back). Action log shows move to Doing.
- **Pass:** Ticket moves to Doing and stays there.

---

## Step 4: Reorder within column
- **Action:** Add at least one more ticket to the same column (e.g. Doing). Drag one card above or below the other within that column to reorder.
- **Check:** The order updates immediately. After drop, the new order persists (cards stay in the new order).
- **Pass:** Reorder within column works and persists.

---

## Step 5: Debug panel – polling and per-column IDs
- **Action:** Open **Debug** (click Debug toggle). Expand **Ticket Store (Supabase)**.
- **Check:** You see: **Polling: 10s** (when Supabase is connected and board active), **Last poll time:** (ISO timestamp or "never"), **Last poll error:** (value or "none"), **Per-column ticket IDs:** e.g. "To-do: (empty) | Doing: 0001,0002 | Done: (empty)" so you can verify column contents by ID without external tools.
- **Pass:** Polling line shows 10s (or off when not Supabase board); last poll time and error visible; per-column ticket IDs listed.

---

## Step 6: Persist after refresh
- **Action:** With one or more tickets in columns (e.g. Doing has 0001, 0002), refresh the page (F5 or reload). Re-open Ticket Store → Supabase if needed; ensure Connect is done so board is active again.
- **Check:** The Columns section shows the same tickets in the same columns and order as before refresh (e.g. Doing still shows 0001, 0002 in that order). Data comes from Supabase, not local docs.
- **Pass:** Placements and order load from Supabase after refresh.

---

## Summary
- If steps 1–6 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
