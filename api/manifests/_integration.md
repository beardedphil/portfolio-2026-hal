# Integration Manifest Integration Points

This document describes how the Integration Manifest v0 system integrates with Context Bundles and Receipts (as specified in HAL_Upgrade_Roadmap.md T7 and T10).

## Context Bundles (T7)

When `build_context_bundle(project_id, ticket_id, role)` is implemented, it should:

1. **Fetch the latest manifest** for the repository using:
   ```typescript
   POST /api/manifests/get
   {
     repoFullName: string,
     supabaseUrl: string,
     supabaseAnonKey: string
   }
   ```

2. **Include manifest in bundle**:
   ```json
   {
     "manifest": {
       "versionNumber": number,
       "contentHash": string,
       "goal": string,
       "stack": string[],
       "constraints": string[],
       "conventions": string[]
     },
     "ticket": {...},
     "stateSnapshot": {...},
     "deltas": {...},
     "repoPointers": {...},
     "artifacts": [...]
   }
   ```

3. **Use manifest fields**:
   - `goal`: Include in bundle context to help agents understand project purpose
   - `stack`: Include to help agents understand technology choices
   - `constraints`: Include to ensure agents respect project constraints
   - `conventions`: Include to ensure agents follow project conventions

## Context Receipts (T10)

When Context Receipt Storage is implemented, it should:

1. **Store manifest reference**:
   ```json
   {
     "checksum": string,
     "artifactVersions": {...},
     "snippetReferences": [...],
     "manifestVersion": {
       "manifestId": string,
       "versionNumber": number,
       "contentHash": string
     }
   }
   ```

2. **Enable reconstruction**: The receipt should include enough information to:
   - Re-fetch the exact manifest version used: `POST /api/manifests/get` with `versionNumber`
   - Verify manifest hasn't changed: compare `contentHash` in receipt with current manifest
   - Rebuild context bundle with the same manifest version

## API Endpoints

### POST /api/manifests/regenerate
Regenerates the manifest for a repository. Returns the manifest with version information.

### POST /api/manifests/get
Gets a manifest for a repository. Can fetch latest (default) or specific version.

## Database Schema

See `docs/supabase-migrations/0177-integration-manifests.sql` for the full schema.

Key fields:
- `manifest_id`: UUID primary key
- `repo_full_name`: Repository identifier
- `version_number`: Sequential version number
- `content_hash`: SHA-256 hash of manifest content (for versioning)
- `previous_version_id`: Link to previous version
- `manifest_content`: JSONB containing goal, stack, constraints, conventions

## Versioning Behavior

- **Deterministic generation**: Same inputs → same content hash → same version reused
- **Version linking**: New versions link to previous via `previous_version_id`
- **Content-based versioning**: Versions are identified by content hash, not timestamp
