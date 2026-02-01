# PM Review (0052-pm-agent-repository-inspection)

## Likelihood of Success: 85%

The implementation follows a clear architecture with client-side file access utilities, API endpoints for communication, and PM agent tool integration. The polling mechanism is straightforward and should work reliably.

## Potential Failures and Diagnosis

### 1. File access API timeout (504 errors)
- **Likelihood**: Medium (15%)
- **Symptoms**: PM agent reports "File access request timed out" when asking about project files
- **Diagnosis**: Check Diagnostics panel for file access API errors. Verify that:
  - Project folder is connected (Diagnostics shows "Connected project: <name>")
  - Client is polling `/api/pm/file-access/pending` (check browser Network tab)
  - FileSystemDirectoryHandle is stored in state (check React DevTools)
- **In-app verification**: PM agent should report timeout error clearly; Diagnostics should show API status

### 2. File not found errors
- **Likelihood**: Low (5%)
- **Symptoms**: PM agent reports "File not found" for valid file paths
- **Diagnosis**: Check that file path is relative to project root (not absolute). Verify file exists in connected project folder.
- **In-app verification**: PM agent should cite the exact path it tried to read; user can verify file exists at that path

### 3. Search results empty when files should match
- **Likelihood**: Low (5%)
- **Symptoms**: PM agent reports no matches for search pattern that should match files
- **Diagnosis**: Check regex pattern validity. Verify glob pattern is correct. Check that files are not in ignored directories (node_modules, .git).
- **In-app verification**: PM agent should show the pattern it searched for; user can verify pattern manually

### 4. Client polling not working
- **Likelihood**: Low (5%)
- **Symptoms**: PM agent requests timeout even when project folder is connected
- **Diagnosis**: Check browser console for errors. Verify useEffect is running (check React DevTools). Verify polling interval is set (500ms).
- **In-app verification**: Check Diagnostics for file access status; browser DevTools Network tab should show polling requests

### 5. PM agent uses HAL repo instead of connected project
- **Likelihood**: Very Low (2%)
- **Symptoms**: PM agent answers questions about HAL repo instead of connected project
- **Diagnosis**: Verify `projectId` is passed to PM agent config in vite.config.ts. Check that `hasProjectFolder` is true in PM agent tools.
- **In-app verification**: PM agent should clearly indicate which repository it's accessing; responses should match connected project, not HAL

## Success Indicators

- PM agent can search for code patterns in connected project and cite file paths
- PM agent can read specific files and quote excerpts with line numbers
- PM agent provides clear error message when project folder is not connected
- File access operations complete within 1-2 seconds (including polling latency)
