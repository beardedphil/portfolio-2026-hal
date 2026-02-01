# Decisions (0052-pm-agent-repository-inspection)

## D1: Use File System Access API for client-side file operations

- **Decision**: Use browser's File System Access API (FileSystemDirectoryHandle) for reading/searching files in the connected project folder
- **Rationale**: The project folder is selected via `window.showDirectoryPicker()` which returns a FileSystemDirectoryHandle. This handle can only be used in the browser context, not on the server. We need client-side utilities to work with this handle.
- **Alternatives considered**: 
  - Server-side file access: Not possible since FileSystemDirectoryHandle is browser-only
  - Copy entire project to server: Not feasible for large projects and security concerns
- **Trade-offs**: Requires client-server communication via API, but enables read-only access to user's project files

## D2: Polling-based file access request/response mechanism

- **Decision**: Use polling-based mechanism where PM agent makes requests to `/api/pm/file-access`, client polls `/api/pm/file-access/pending`, handles requests, and posts results to `/api/pm/file-access/result`
- **Rationale**: Simple request/response pattern that works with the server-side PM agent and client-side file access. The PM agent can wait for results synchronously.
- **Alternatives considered**:
  - WebSockets: More complex, requires connection management
  - Server-Sent Events: One-way only, would need separate POST for results
- **Trade-offs**: Polling adds slight latency but is simpler to implement and maintain

## D3: Fallback to HAL repo when no project folder connected

- **Decision**: When no project folder is connected, file access tools fall back to direct file system access of the HAL repository itself
- **Rationale**: Maintains backward compatibility and allows PM agent to answer questions about HAL itself even without a connected project
- **Alternatives considered**:
  - Error when no project folder: Would break existing functionality
  - Always use file access API: Requires project folder even for HAL questions
- **Trade-offs**: Slightly more complex tool logic, but provides better UX

## D4: Read-only access constraint

- **Decision**: File access tools are read-only (no file modifications)
- **Rationale**: Ticket requirement states "read-only repository access"
- **Alternatives considered**: None - requirement is explicit
- **Trade-offs**: None - this is a constraint, not a trade-off
