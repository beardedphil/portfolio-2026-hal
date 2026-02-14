# Decisions for ticket 0179

## Design decisions

### 1. Template structure

**Decision**: Keep the template in `docs/templates/ticket.template.md` and enhance it with a clear "Ticket template (copy/paste)" section at the top, rather than creating a separate file.

**Rationale**: 
- The template is already referenced in `docs/process/ready-to-start-checklist.md` and used by the PM agent
- Keeping it in one place maintains a single source of truth
- Adding a clear copy/paste section at the top makes it immediately obvious to agents

### 2. Example format

**Decision**: Include both a clean template (with placeholder brackets) and a fully filled-in example showing proper format.

**Rationale**:
- The clean template shows the structure clearly
- The filled-in example demonstrates proper formatting and content quality
- Having both helps agents understand both structure and quality expectations

### 3. Critical requirements section

**Decision**: Add a "Critical requirements" section that explicitly calls out:
- Checkbox format requirement
- UI-verifiability requirement with examples of what NOT to include
- No placeholders warning

**Rationale**:
- These are the most common mistakes that cause tickets to fail Definition of Ready
- Explicit warnings help prevent these issues
- Examples of what NOT to include (like "code compiles", "check logs") make the requirement concrete

### 4. Number of example AC items

**Decision**: Include 4 Acceptance criteria items in the example (exceeding the minimum requirement of 3).

**Rationale**:
- Provides a more complete example
- Shows that multiple items are expected
- All 4 items are UI-verifiable and use proper checkbox format

### 5. Preserving optional sections

**Decision**: Keep existing optional sections (metadata, Human in the Loop, Implementation notes, Audit artifacts) at the bottom of the template.

**Rationale**:
- These sections provide useful context for agents
- They don't interfere with the core copy/paste template
- Maintaining backward compatibility with existing ticket structure
