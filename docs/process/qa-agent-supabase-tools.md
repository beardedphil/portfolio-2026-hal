# QA/Implementation Agent Supabase Tools

## Overview

QA and Implementation agents interact with Supabase through HAL's API endpoints, not directly. This allows agents to work without needing Supabase credentials in their environment.

## How It Works

1. **Agents invoke HAL API endpoints** - Agents make HTTP requests to HAL's API (e.g. `/api/tickets/move`, `/api/artifacts/insert-qa`)
2. **HAL uses server-side credentials** - HAL's API endpoints read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from server environment variables
3. **No credentials needed in agent environment** - Agents don't need `.env` files or credentials passed to them

## Available API Endpoints

### Ticket Operations

- **`POST /api/tickets/get`** - Fetch ticket content
  - Body: `{ ticketId: string, supabaseUrl?: string, supabaseAnonKey?: string }`
  - Returns: `{ success: boolean, body_md?: string, error?: string }`

- **`POST /api/tickets/update`** - Update ticket body
  - Body: `{ ticketId: string, body_md: string, supabaseUrl?: string, supabaseAnonKey?: string }`
  - Returns: `{ success: boolean, error?: string }`

- **`POST /api/tickets/move`** - Move ticket to different column
  - Body: `{ ticketId: string, columnId: string, supabaseUrl?: string, supabaseAnonKey?: string }`
  - Returns: `{ success: boolean, position?: number, movedAt?: string, error?: string }`

### Artifact Operations

- **`POST /api/artifacts/insert-qa`** - Insert/update QA artifact
  - Body: `{ ticketId: string, title: string, body_md: string, supabaseUrl?: string, supabaseAnonKey?: string }`
  - Returns: `{ success: boolean, artifact_id?: string, action?: 'inserted' | 'updated', error?: string }`

- **`POST /api/artifacts/insert-implementation`** - Insert/update implementation artifact
  - Body: `{ ticketId: string, artifactType: string, title: string, body_md: string, supabaseUrl?: string, supabaseAnonKey?: string }`
  - Returns: `{ success: boolean, artifact_id?: string, action?: 'inserted' | 'updated', error?: string }`

## Usage in Cloud Agents

When running as a cloud agent (e.g. in Cursor Cloud Agents), you can:

1. **Make direct HTTP requests** to HAL's API endpoints
2. **Use the HAL API URL** - Typically `http://localhost:5173` for local dev, or your deployment URL
3. **Credentials are optional** - If HAL's server has env vars set, you don't need to pass credentials in the request body

### Example: Insert QA Artifact

```typescript
const response = await fetch('http://localhost:5173/api/artifacts/insert-qa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ticketId: '0076',
    title: 'QA report for ticket 0076',
    body_md: '# QA Report\n\n...',
  }),
})

const result = await response.json()
if (result.success) {
  console.log('QA artifact inserted:', result.artifact_id)
}
```

## Tools for HAL Agent System

For agents running through HAL's agent system (like PM agent), tools are available in `projects/hal-agents/src/agents/qaTools.ts`:

- `insert_qa_artifact` - Insert/update QA artifact
- `insert_implementation_artifact` - Insert/update implementation artifact
- `move_ticket_column` - Move ticket to any column
- `update_ticket_body` - Update ticket body
- `fetch_ticket_content` - Fetch ticket content

These tools call HAL's API endpoints internally, so they also benefit from server-side credentials.

## Benefits

1. **No credential management** - Agents don't need Supabase credentials
2. **Centralized access** - All Supabase access goes through HAL's API
3. **Security** - Credentials stay on the server, never exposed to agents
4. **Consistency** - Same API endpoints used by HAL UI and agents
