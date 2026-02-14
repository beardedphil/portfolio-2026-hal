# Database Migrations

## Agent Instructions Migration

### Step 1: Create the database tables

Run the SQL migration to create the `agent_instructions` and `agent_instruction_index` tables:

```sql
-- Run this in your Supabase SQL editor or via psql
-- File: scripts/migrations/create-agent-instructions-table.sql
```

Or use the Supabase dashboard:
1. Go to SQL Editor
2. Paste the contents of `create-agent-instructions-table.sql`
3. Run the query

### Step 2: Migrate existing instructions

Run the migration script to move existing `.mdc` files to Supabase:

```bash
# Make sure you have .env file with Supabase credentials
node scripts/migrate-instructions-to-supabase.js
```

The script will:
- Read all `.mdc` files from `.cursor/rules/`
- Parse frontmatter and content
- Determine basic vs situational categorization
- Upload to Supabase `agent_instructions` table
- Upload instruction index to `agent_instruction_index` table

### Step 3: Verify

Check in Supabase dashboard:
- `agent_instructions` table should have all instruction files
- `agent_instruction_index` table should have the index metadata

### Environment Variables

The migration script requires:
- `VITE_SUPABASE_URL` or `SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `REPO_FULL_NAME` (optional, defaults to `beardedphil/portfolio-2026-hal`)

### After Migration

- Instructions are now stored in Supabase
- Viewer will load from Supabase automatically
- Agents will load from Supabase (with filesystem fallback)
- Editing in the viewer writes directly to Supabase
- No File System Access API needed
