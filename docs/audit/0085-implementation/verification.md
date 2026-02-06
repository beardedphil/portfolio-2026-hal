# Verification: Human-in-the-Loop Validation Section (0085)

## Automated checks

### Build
- [ ] `npm run build` completes without errors
- [ ] No TypeScript errors
- [ ] No lint errors

### Code review
- [ ] Validation section only renders when `columnId === 'col-human-in-the-loop'`
- [ ] Pass handler moves ticket to `col-done`
- [ ] Fail handler moves ticket to `col-todo` and updates `body_md`
- [ ] Human feedback is prepended to ticket body with clear labeling
- [ ] CSS styles are applied correctly

## Manual UI verification steps

### Test Case 1: Validation section appears for Human in the Loop tickets
1. **Prerequisites**: Supabase connected, at least one ticket in "Human in the Loop" column
2. **Action**: Click on a ticket card that is in the "Human in the Loop" column
3. **Expected**:
   - Ticket detail modal opens
   - At the bottom of the modal, a "Human validation" section appears
   - Section has distinct styling (blue border, light background)
   - Section includes "Steps to validate" textarea
   - Section includes "Notes" textarea
   - Section includes "Pass" button (green)
   - Section includes "Fail" button (red)

### Test Case 2: Validation section does not appear for other columns
1. **Prerequisites**: Supabase connected, tickets in other columns (e.g. To Do, QA, Done)
2. **Action**: Click on ticket cards in columns other than "Human in the Loop"
3. **Expected**:
   - Ticket detail modal opens
   - No "Human validation" section appears at the bottom

### Test Case 3: Pass validation moves ticket to Done
1. **Prerequisites**: Ticket in "Human in the Loop" column
2. **Action**: 
   - Open ticket detail modal
   - Optionally enter steps/notes in validation section
   - Click "Pass" button
3. **Expected**:
   - Button shows disabled state briefly
   - Ticket moves from "Human in the Loop" column to "Done" column on Kanban board
   - Modal closes (or can be closed manually)
   - Validation inputs are cleared

### Test Case 4: Fail validation moves ticket to To Do and stores feedback
1. **Prerequisites**: Ticket in "Human in the Loop" column
2. **Action**:
   - Open ticket detail modal
   - Enter "Steps to validate": "Test feature X, verify Y"
   - Enter "Notes": "Feature X works but Y is broken"
   - Click "Fail" button
3. **Expected**:
   - Button shows disabled state briefly
   - Ticket moves from "Human in the Loop" column to "To Do" column on Kanban board
   - Modal closes (or can be closed manually)
   - Validation inputs are cleared
   - Reopen the ticket detail modal (ticket is now in To Do)
   - Ticket body shows human feedback section at the top with:
     - Yellow/amber background
     - Clear "Human Feedback" heading with timestamp
     - "Validation failed" message
     - Steps to validate content
     - Notes content

### Test Case 5: Human feedback is visually emphasized
1. **Prerequisites**: Ticket that was failed in Test Case 4 (has human feedback in body)
2. **Action**: Open ticket detail modal for the ticket
3. **Expected**:
   - Human feedback section appears at the top of ticket body
   - Section has yellow/amber background (#fff3cd)
   - Section has orange border
   - Section is clearly distinguished from rest of ticket content
   - Rest of ticket content is still visible below feedback

### Test Case 6: Multiple validation attempts
1. **Prerequisites**: Ticket that was previously failed (has human feedback)
2. **Action**:
   - Move ticket back to "Human in the Loop" (manually or via agent)
   - Open ticket detail modal
   - Enter new validation steps/notes
   - Click "Fail" again
3. **Expected**:
   - New human feedback is prepended to body (appears above previous feedback)
   - Both feedback sections are visible and styled
   - Ticket moves to To Do
