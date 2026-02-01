# Plan: 0052 - Enable PM agent to inspect connected repository

## Objective

Enable the Project Manager agent to directly inspect the connected repository (search + read files) so it can answer codebase questions accurately and cite file paths.

## Approach

1. **Client-side file access utilities (`src/fileAccess.ts`)**:
   - Implement `readFileFromHandle` to read files from FileSystemDirectoryHandle
   - Implement `searchFilesFromHandle` to search files using regex pattern
   - Implement `listDirectoryFromHandle` to list directory entries
   - Support glob patterns for file filtering

2. **File access API endpoint (`vite.config.ts`)**:
   - Create `/api/pm/file-access` endpoint for PM agent to request file operations
   - Create `/api/pm/file-access/pending` endpoint for client to poll pending requests
   - Create `/api/pm/file-access/result` endpoint for client to submit results
   - Store pending requests and results in memory (with cleanup for old entries)
   - Support read_file and search_files operations

3. **Client-side polling (`src/App.tsx`)**:
   - Store FileSystemDirectoryHandle in state when project folder is connected
   - Poll `/api/pm/file-access/pending` every 500ms when project folder is connected
   - Handle pending requests using file access utilities
   - Submit results to `/api/pm/file-access/result`

4. **PM agent tools (`projects/hal-agents/src/agents/projectManager.ts`)**:
   - Update `read_file` tool to use file access API when projectId is set
   - Update `search_files` tool to use file access API when projectId is set
   - Fall back to direct file system access (HAL repo) when no project folder is connected
   - Add `projectId` and `fileAccessApiUrl` to PmAgentConfig

5. **System instructions**:
   - Update PM agent system instructions to explain when repo tools are available
   - Provide clear error message when project folder is not connected

## Scope

- **In scope**: File read/search from connected project folder, client-side file access, API endpoint, PM agent tool integration
- **Out of scope**: File write operations (read-only), list_directory via file access API (uses HAL repo for now)

## Files to Change

1. `src/fileAccess.ts` - New file with client-side file access utilities
2. `src/App.tsx` - Store FileSystemDirectoryHandle, poll for file access requests
3. `vite.config.ts` - Add file access API endpoints
4. `projects/hal-agents/src/agents/projectManager.ts` - Update tools to use file access API, add projectId to config
5. `docs/audit/0052-pm-agent-repository-inspection/*` - Audit artifacts
