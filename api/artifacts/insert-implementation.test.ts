/**
 * Test suite for implementation artifact insertion endpoint (0197).
 * Tests that all required implementation artifact types are accepted with non-empty body_md.
 * 
 * **Integration test** - requires Supabase credentials:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY in .env or environment variables
 * - Run standalone: npx tsx api/artifacts/insert-implementation.test.ts
 * 
 * **Note:** This test is excluded from Vitest runs (see vitest.config.ts) because it requires
 * Supabase credentials. It's designed to be run manually when testing the artifact insertion API.
 */

import { createClient } from '@supabase/supabase-js'

// Test configuration - set these environment variables or update here
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const TEST_TICKET_ID = process.env.TEST_TICKET_ID || '197' // Use a test ticket ID

// Skip tests if env vars are not available (for CI/QA environments without Supabase access)
const hasEnvVars = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

// Check if running under Vitest (Vitest sets VITEST environment variable)
const isVitest = typeof process !== 'undefined' && (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test')
const isStandalone = typeof require !== 'undefined' && require.main === module

if (!hasEnvVars && !isVitest && isStandalone) {
  // Only exit if running standalone (not via Vitest)
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  console.error('These tests require Supabase credentials to run.')
  console.error('Set them in .env or as environment variables.')
  process.exit(1)
}

// Only create Supabase client if env vars are available
const supabase = hasEnvVars ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173'

const requiredArtifactTypes = [
  { key: 'plan', title: 'Plan' },
  { key: 'worklog', title: 'Worklog' },
  { key: 'changed-files', title: 'Changed Files' },
  { key: 'decisions', title: 'Decisions' },
  { key: 'verification', title: 'Verification' },
  { key: 'pm-review', title: 'PM Review' },
  { key: 'git-diff', title: 'Git diff' },
  { key: 'instructions-used', title: 'Instructions Used' },
]

/**
 * Generate test content for each artifact type
 */
function generateTestContent(artifactType: string): string {
  const baseContent = `# ${requiredArtifactTypes.find(a => a.key === artifactType)?.title || artifactType} for ticket ${TEST_TICKET_ID}

This is test content for the ${artifactType} artifact type.

## Content

This artifact contains substantive content to verify it is accepted and stored correctly.

## Details

- Item 1: Test content
- Item 2: More test content
- Item 3: Additional test content

## Summary

This artifact has been created to test the artifact insertion endpoint and ensure that all required artifact types can be stored with non-empty body_md.

${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}
`

  // Specialized content for specific artifact types
  if (artifactType === 'changed-files') {
    return `# Changed Files for ticket ${TEST_TICKET_ID}

## Modified Files

- \`api/artifacts/insert-qa.ts\` — Updated error handling and validation
- \`api/artifacts/insert-implementation.ts\` — Improved body_md extraction
- \`api/artifacts/_validation.ts\` — Enhanced validation logic

## Added Files

- \`api/artifacts/insert-qa.test.ts\` — Test suite for QA artifacts
- \`api/artifacts/insert-implementation.test.ts\` — Test suite for implementation artifacts

## Deleted Files

None
`
  }

  if (artifactType === 'git-diff') {
    return `# Git diff for ticket ${TEST_TICKET_ID}

\`\`\`diff
diff --git a/api/artifacts/insert-qa.ts b/api/artifacts/insert-qa.ts
index 1234567..abcdefg 100644
--- a/api/artifacts/insert-qa.ts
+++ b/api/artifacts/insert-qa.ts
@@ -10,6 +10,15 @@ async function readJsonBody(req: IncomingMessage): Promise<unknown> {
   const raw = Buffer.concat(chunks).toString('utf8').trim()
   if (!raw) return {}
-  return JSON.parse(raw) as unknown
+  try {
+    return JSON.parse(raw) as unknown
+  } catch (parseError) {
+    console.error(\`[insert-qa] JSON parse error: \${parseError.message}\`)
+    throw new Error(\`Failed to parse request body: \${parseError.message}\`)
+  }
 }
\`\`\`
`
  }

  if (artifactType === 'verification') {
    return `# Verification for ticket ${TEST_TICKET_ID}

## Verification Steps

- [x] All artifact types can be inserted with non-empty body_md
- [x] Large content is handled correctly
- [x] Code blocks are preserved
- [x] Multiline content is stored correctly
- [x] Error messages are clear and actionable

## Test Results

All verification steps passed successfully.
`
  }

  return baseContent
}

async function testArtifactInsertion(artifactType: string, body_md: string): Promise<boolean> {
  const title = `${requiredArtifactTypes.find(a => a.key === artifactType)?.title || artifactType} for ticket ${TEST_TICKET_ID}`
  
  console.log(`\n=== Testing: ${title} ===`)
  console.log(`Artifact type: ${artifactType}`)
  console.log(`Body length: ${body_md.length} characters`)
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/artifacts/insert-implementation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: TEST_TICKET_ID,
        artifactType,
        title,
        body_md,
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
      }),
    })
    
    const result = await response.json()
    
    if (!result.success) {
      console.error(`❌ FAILED: ${result.error}`)
      if (result.validation_reason) {
        console.error(`   Validation reason: ${result.validation_reason}`)
      }
      return false
    }
    
    console.log(`✅ PASSED: Artifact inserted successfully`)
    console.log(`   Artifact ID: ${result.artifact_id}`)
    console.log(`   Action: ${result.action}`)
    
    // Verify the artifact was actually stored
    if (result.artifact_id && supabase) {
      const { data: artifact, error: readError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, title, body_md')
        .eq('artifact_id', result.artifact_id)
        .single()
      
      if (readError) {
        console.error(`❌ FAILED: Could not read back artifact: ${readError.message}`)
        return false
      }
      
      if (!artifact?.body_md || artifact.body_md.length === 0) {
        console.error(`❌ FAILED: Artifact body_md is empty after insertion`)
        return false
      }
      
      if (artifact.body_md.length !== body_md.length) {
        console.warn(`⚠️  WARNING: Body length mismatch. Expected: ${body_md.length}, Got: ${artifact.body_md.length}`)
      } else {
        console.log(`✅ Verified: Artifact body_md length matches (${artifact.body_md.length} chars)`)
      }
    }
    
    return true
  } catch (error) {
    console.error(`❌ FAILED: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function runTests() {
  if (!hasEnvVars) {
    console.log('⚠️  Skipping tests: SUPABASE_URL and SUPABASE_ANON_KEY not set')
    console.log('   These are integration tests that require Supabase credentials.')
    return
  }
  
  console.log('Starting implementation artifact insertion tests...')
  console.log(`API Base URL: ${API_BASE_URL}`)
  console.log(`Test Ticket ID: ${TEST_TICKET_ID}`)
  
  const results: Array<{ name: string; passed: boolean }> = []
  
  // Test all required artifact types
  for (const { key, title } of requiredArtifactTypes) {
    const body_md = generateTestContent(key)
    results.push({
      name: title,
      passed: await testArtifactInsertion(key, body_md),
    })
  }
  
  // Summary
  console.log('\n=== Test Summary ===')
  const passed = results.filter(r => r.passed).length
  const total = results.length
  
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`)
  })
  
  console.log(`\n${passed}/${total} tests passed`)
  
  if (passed === total) {
    console.log('✅ All tests passed!')
    if (require.main === module) {
      process.exit(0)
    }
  } else {
    console.log('❌ Some tests failed')
    if (require.main === module) {
      process.exit(1)
    }
  }
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(error => {
    console.error('Test execution failed:', error)
    process.exit(1)
  })
}

export { testArtifactInsertion, generateTestContent, requiredArtifactTypes }
