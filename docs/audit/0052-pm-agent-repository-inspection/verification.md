# Verification (0052-pm-agent-repository-inspection)

## Acceptance Criteria

- [ ] In HAL, the Project Manager agent can answer a question that requires searching the codebase (e.g., "Where is `sync-tickets` invoked?") and returns results citing real file paths from the connected repo.
- [ ] In HAL, the Project Manager agent can answer a question that requires reading a specific file and can quote a short relevant excerpt, again citing the file path.
- [ ] If no project folder is connected, the PM agent clearly reports that repo tools are unavailable and explains how to connect a project folder (no console required).
- [ ] The PM agent is constrained to **read-only** repository access (no file modifications) via these tools.

## Prerequisites

- HAL dev server running (`npm run dev`)
- Project folder with codebase (for testing with connected folder)
- OpenAI API key configured in `.env`

## Manual Verification Steps

1. **Test with project folder connected**:
   - Open HAL at http://localhost:5173
   - Click "Connect Project Folder" and select a project folder
   - In the Project Manager chat, ask: "Where is sync-tickets invoked?"
   - **Verify**: PM agent responds with file paths and line numbers where `sync-tickets` is invoked
   - Ask: "Read the file src/App.tsx and tell me what the main component does"
   - **Verify**: PM agent reads the file and quotes relevant excerpts with file path

2. **Test without project folder connected**:
   - Disconnect project folder (if connected)
   - In the Project Manager chat, ask: "Where is sync-tickets implemented in my project?"
   - **Verify**: PM agent responds with clear message explaining that project folder is not connected and how to connect it (no console required)

3. **Test read-only constraint**:
   - With project folder connected, ask PM agent to modify a file
   - **Verify**: PM agent explains that it only has read-only access and cannot modify files

## Automated Checks

- [ ] Build succeeds: `npm run build --prefix projects/hal-agents`
- [ ] No TypeScript errors in modified files
- [ ] File access API endpoints respond correctly (can be tested via curl/Postman)

## Notes

- Full verification requires manual testing with a connected project folder (File System Access API requires user interaction)
- The file access mechanism uses polling, so there may be slight latency (up to 500ms) for file operations
