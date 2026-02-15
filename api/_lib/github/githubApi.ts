/**
 * @deprecated This file is maintained for backward compatibility.
 * New code should import from './index.js' or specific modules (auth.js, client.js, etc.)
 * 
 * This file re-exports all functions from the modular structure.
 * The implementation has been split into smaller modules (<=250 lines each):
 * - auth.ts: Token exchange
 * - client.ts: Core GitHub API client
 * - repos.ts: Repository operations
 * - files.ts: File and directory operations
 * - pullRequests.ts: Pull request operations
 * - artifacts.ts: Artifact generation
 * - search.ts: Code search
 */

export * from './index.js'
