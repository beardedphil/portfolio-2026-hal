# Decision Log Template - Supabase Instructions Update Required

**Status**: ⚠️ Manual update required in Supabase

## What Needs to Be Updated

The implementation agent instructions in Supabase must be updated to explicitly require producing a "Decisions" artifact that follows the [Decision Log template](../templates/decision-log.template.md).

## Required Update

In the Supabase `agent_instructions` table, for the implementation agent's artifact requirements section, add or update the following:

### Content to Add

The instructions should explicitly state:

1. **Decisions artifact is required** - Implementation agents must create a `decisions.md` artifact for every ticket.

2. **Template must be followed** - The decisions artifact must follow the [Decision Log template](../templates/decision-log.template.md) located at `docs/templates/decision-log.template.md`.

3. **Minimum requirement** - At least one decision entry must be included per ticket, using the template format with all sections:
   - Context
   - Decision
   - Alternatives Considered
   - Trade-offs
   - Consequences / Follow-ups
   - Links

4. **Example provided** - The template includes a complete example decision entry that demonstrates the expected format and level of detail.

## How to Update

1. Open the HAL app UI
2. Click "Agent Instructions" button in the header
3. Navigate to: **All Agents → Implementation Agent → Artifact Requirements** (or similar)
4. Add or update the Decisions artifact section with the requirements above
5. Reference the template path: `docs/templates/decision-log.template.md`

## Template Location

The Decision Log template is located at:
- **File**: `docs/templates/decision-log.template.md`
- **Also referenced from**: 
  - `docs/audit/README.md` (artifacts index)
  - `docs/templates/ticket.template.md` (ticket template)

## Verification

After updating Supabase instructions, verify that:
- [ ] Implementation agent instructions explicitly mention the Decisions artifact requirement
- [ ] Instructions reference the Decision Log template location
- [ ] Instructions specify that at least one decision entry is required
- [ ] Instructions mention the template includes an example
