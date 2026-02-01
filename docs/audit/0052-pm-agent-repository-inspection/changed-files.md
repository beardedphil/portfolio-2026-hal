# Changed Files (0052-pm-agent-repository-inspection)

## Created

- `src/fileAccess.ts` - Client-side file access utilities for FileSystemDirectoryHandle
  - `readFileFromHandle` - Read files with line limit support
  - `searchFilesFromHandle` - Search files using regex with glob filtering
  - `listDirectoryFromHandle` - List directory entries

## Modified

- `src/App.tsx` - Store FileSystemDirectoryHandle and poll for file access requests
  - Added `projectFolderHandle` state
  - Store handle on project folder connect
  - Clear handle on disconnect
  - Poll `/api/pm/file-access/pending` and handle requests

- `vite.config.ts` - Add file access API endpoints
  - `/api/pm/file-access` - PM agent requests file operations
  - `/api/pm/file-access/pending` - Client polls for pending requests
  - `/api/pm/file-access/result` - Client submits results
  - In-memory storage with cleanup

- `projects/hal-agents/src/agents/projectManager.ts` - Update tools to use file access API
  - Added `projectId` and `fileAccessApiUrl` to PmAgentConfig
  - Updated `read_file` tool to use file access API when project folder connected
  - Updated `search_files` tool to use file access API when project folder connected
  - Updated system instructions for repo tools availability
