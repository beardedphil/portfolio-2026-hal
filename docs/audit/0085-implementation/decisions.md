# Decisions: Human-in-the-Loop Validation Section (0085)

## Design decisions

### 1. Validation section visibility
- **Decision**: Show validation section only when ticket is in `col-human-in-the-loop` column
- **Rationale**: Matches acceptance criteria - section should only appear for tickets in Human in the Loop column
- **Implementation**: Conditional rendering based on `columnId` prop

### 2. Human feedback storage
- **Decision**: Store human feedback by prepending it to ticket `body_md` in Supabase
- **Rationale**: 
  - Ensures feedback is visible when Implementation agent opens ticket
  - No additional database schema changes needed
  - Feedback persists with ticket history
- **Format**: Markdown section with timestamp, clear labeling, and structured content

### 3. Visual emphasis of human feedback
- **Decision**: Use yellow/amber background with border for human feedback section
- **Rationale**: Makes feedback immediately visible and clearly distinguished from other content
- **Implementation**: CSS styling with data attribute detection

### 4. Pass/Fail button placement
- **Decision**: Place buttons side-by-side at bottom of validation section
- **Rationale**: Clear action hierarchy, easy to access, follows common UI patterns

### 5. Input fields
- **Decision**: Use multiline textarea inputs for both Steps to validate and Notes
- **Rationale**: Allows freeform text (checklist-style or narrative), flexible for different validation approaches

### 6. Ticket movement on Pass
- **Decision**: Move to `col-done` column at end position
- **Rationale**: Standard workflow - validated tickets go to Done

### 7. Ticket movement on Fail
- **Decision**: Move to `col-todo` column at end position
- **Rationale**: Failed validation means ticket needs rework, goes back to To Do

### 8. Processing state
- **Decision**: Disable inputs and buttons during Pass/Fail processing
- **Rationale**: Prevents duplicate submissions, provides visual feedback
