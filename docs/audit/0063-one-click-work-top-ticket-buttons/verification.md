# Verification (0063-one-click-work-top-ticket-buttons)

## UI-only verification steps

1. **Unassigned column button:**
   - Ensure there is at least one ticket in the Unassigned column
   - Look at the Unassigned column header - a purple "Prepare top ticket" button should be visible
   - Click the button
   - Verify the Project Manager chat opens (or switches to it if already open)
   - Verify a message appears in the chat: "Please prepare ticket {ID} and get it ready (Definition of Ready)." where {ID} is the top ticket's ID

2. **To Do column button:**
   - Ensure there is at least one ticket in the To Do column
   - Look at the To Do column header - a purple "Implement top ticket" button should be visible
   - Click the button
   - Verify the Implementation Agent chat opens (or switches to it if already open)
   - Verify a message appears in the chat: "Please implement ticket {ID}." where {ID} is the top ticket's ID

3. **QA column button:**
   - Ensure there is at least one ticket in the QA column
   - Look at the QA column header - a purple "QA top ticket" button should be visible
   - Click the button
   - Verify the QA Agent chat opens (or switches to it if already open)
   - Verify a message appears in the chat: "Please QA ticket {ID}." where {ID} is the top ticket's ID

4. **Empty column state:**
   - Find a column (Unassigned, To Do, or QA) that has no tickets
   - Verify the button shows "No tickets" and is disabled (grayed out, not clickable)
   - Verify clicking the disabled button does nothing

5. **Other columns:**
   - Verify that columns other than Unassigned, To Do, and QA do not show work buttons

## Expected behavior

- Buttons are visible and clickable when columns have tickets
- Buttons are disabled and show "No tickets" when columns are empty
- Clicking a button opens/switches to the correct chat and sends the appropriate message
- The message includes the correct ticket ID from the top of the column
