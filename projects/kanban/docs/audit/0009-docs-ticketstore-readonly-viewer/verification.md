# Verification (0009-docs-ticketstore-readonly-viewer)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser that supports the File System Access API (e.g. Chrome, Edge).

---

## Step 1: Tickets panel and Disconnected state
- **Action:** Find the **Tickets (Docs)** section. Check the status and content.
- **Check:** Status shows **Disconnected**. There is a short explanation that it reads `docs/tickets/*.md` from a selected folder, and a **Connect project** button.
- **Pass:** Panel shows Disconnected and Connect project.

---

## Step 2: Connect project — pick current repo
- **Action:** Click **Connect project**. In the folder picker, select the project root folder (the folder that contains `docs/tickets/`). Confirm.
- **Check:** Status changes to **Connected**. You see "Found N tickets." (N > 0) and a scrollable list of ticket filenames (e.g. `0008-fix-...md`, `0009-docs-ticketstore-readonly-viewer.md`).
- **Pass:** Connected; ticket count and list visible.

---

## Step 3: Ticket Viewer — path and contents
- **Action:** Click one of the ticket filenames in the list.
- **Check:** The **Ticket Viewer** area shows the **relative path** (e.g. `docs/tickets/0008-fix-...md`) and the **full file contents** (plain text).
- **Pass:** Path and contents displayed correctly.

---

## Step 4: Cancel folder picker
- **Action:** If currently connected, refresh the page to get back to Disconnected. Click **Connect project**, then **cancel** the folder picker (e.g. press Escape or click Cancel).
- **Check:** UI remains **Disconnected**. An in-app message appears, e.g. **"Connect cancelled."**
- **Pass:** Cancel shows message; no console required.

---

## Step 5: Folder without docs/tickets
- **Action:** Click **Connect project** and select a folder that does **not** contain `docs/tickets/` (e.g. a random empty folder or one without that path).
- **Check:** Status is **Connected**. A clear in-app message like **"No `docs/tickets` folder found."** and **"Found 0 tickets."** are shown. Ticket list is empty.
- **Pass:** Connected-but-empty with clear message.

---

## Step 6: Debug — Ticket Store section
- **Action:** Click **Debug** to open the Debug panel. Find the **Ticket Store** section.
- **Check:** The section shows: **Store: Docs (read-only)**, **Connected: true** or **false**, **Last refresh:** a timestamp (ISO) or **never**, **Last error:** a message or **none**.
- **Pass:** All four lines present and accurate (e.g. after connecting and loading tickets, Connected is true, Last refresh has a value, Last error is "none" when successful).

---

## Step 7: Refresh button (optional)
- **Action:** While connected to the project folder, click **Refresh**.
- **Check:** Ticket list and count update if needed; Last refresh in Debug updates to a new timestamp.
- **Pass:** Refresh re-scans and updates state.

---

## Summary
- If steps 1–6 pass, the deliverable is verified. Step 7 confirms Refresh works.
- If any step fails, note which step and what you saw.
