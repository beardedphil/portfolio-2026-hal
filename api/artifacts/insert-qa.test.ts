/**
 * Test suite for QA artifact insertion endpoint (0197).
 * Tests that artifacts with real content are accepted and stored reliably.
 * 
 * **Integration test** - requires Supabase credentials:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY in .env or environment variables
 * - Run standalone: npx tsx api/artifacts/insert-qa.test.ts
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

/**
 * Test case 1: Large QA report body
 */
const largeQaReport = `# QA Report for ticket ${TEST_TICKET_ID}

## Ticket & Deliverable
This is a test QA report with a large body to verify that large artifacts are accepted and stored correctly.

## Code Review

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Feature A | Implemented in \`src/feature-a.ts:42-61\` | ✅ PASS |
| Feature B | Implemented in \`src/feature-b.ts:123-145\` | ✅ PASS |
| Feature C | Implemented in \`src/feature-c.ts:89-102\` | ✅ PASS |

## Build Verification

**PASS** — Build completed successfully with zero TypeScript errors.

## UI Verification

**PASS** — All UI components render correctly and functionality works as expected.

## Verdict

**PASS** — Implementation complete and verified.

${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100)}
${'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(100)}
${'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. '.repeat(100)}
`

/**
 * Test case 2: Markdown containing code blocks
 */
const qaReportWithCodeBlocks = `# QA Report for ticket ${TEST_TICKET_ID}

## Ticket & Deliverable
This QA report contains code blocks to verify they are handled correctly.

## Code Review

The implementation includes the following key functions:

\`\`\`typescript
function validateArtifact(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty' }
  }
  if (body_md.trim().length < 50) {
    return { valid: false, reason: 'Artifact body is too short' }
  }
  return { valid: true }
}
\`\`\`

## Build Verification

**PASS** — Build completed successfully.

\`\`\`bash
npm run build:hal
# Output: Build completed with 0 errors
\`\`\`

## Verdict

**PASS** — Implementation complete.
`

/**
 * Test case 3: Multiline content
 */
const qaReportMultiline = `# QA Report for ticket ${TEST_TICKET_ID}

## Ticket & Deliverable
This QA report contains multiline content to verify it is handled correctly.

## Code Review

The following changes were made:

1. Updated artifact validation logic
   - Added length checks
   - Improved error messages
   - Enhanced logging

2. Fixed duplicate artifact prevention
   - Improved canonical title matching
   - Added cleanup of empty artifacts
   - Enhanced race condition handling

3. Improved error handling
   - Clear validation error messages
   - Better logging for debugging
   - User-friendly error display

## Build Verification

**PASS** — Build completed successfully.

## UI Verification

**PASS** — All UI components work correctly.

## Verdict

**PASS** — Implementation complete.
`

async function testArtifactInsertion(title: string, body_md: string): Promise<boolean> {
  console.log(`\n=== Testing: ${title} ===`)
  console.log(`Body length: ${body_md.length} characters`)
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/artifacts/insert-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: TEST_TICKET_ID,
        title: `QA report for ticket ${TEST_TICKET_ID} (test: ${title})`,
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
  
  console.log('Starting artifact insertion tests...')
  console.log(`API Base URL: ${API_BASE_URL}`)
  console.log(`Test Ticket ID: ${TEST_TICKET_ID}`)
  
  const results: Array<{ name: string; passed: boolean }> = []
  
  // Test 1: Large QA report
  results.push({
    name: 'Large QA report body',
    passed: await testArtifactInsertion('Large body', largeQaReport),
  })
  
  // Test 2: Code blocks
  results.push({
    name: 'Markdown with code blocks',
    passed: await testArtifactInsertion('Code blocks', qaReportWithCodeBlocks),
  })
  
  // Test 3: Multiline content
  results.push({
    name: 'Multiline content',
    passed: await testArtifactInsertion('Multiline', qaReportMultiline),
  })
  
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

export { testArtifactInsertion, largeQaReport, qaReportWithCodeBlocks, qaReportMultiline }
