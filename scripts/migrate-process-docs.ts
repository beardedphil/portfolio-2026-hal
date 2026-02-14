/**
 * Script to migrate process docs from docs/process/** to Supabase
 * and generate a migration mapping document
 * 
 * Usage: npx tsx scripts/migrate-process-docs.ts
 */

import fs from 'fs'
import path from 'path'

const API_BASE_URL = process.env.HAL_API_BASE_URL || 'http://localhost:5173'
const REPO_FULL_NAME = 'beardedphil/portfolio-2026-hal'

async function migrateProcessDocs() {
  console.log('Migrating process docs to Supabase...')
  console.log(`API Base URL: ${API_BASE_URL}`)
  console.log(`Repo: ${REPO_FULL_NAME}`)

  try {
    const response = await fetch(`${API_BASE_URL}/api/instructions/migrate-process-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoFullName: REPO_FULL_NAME,
      }),
    })

    const result = await response.json()

    if (!result.success) {
      console.error('Migration failed:', result.error || result.errors)
      process.exit(1)
    }

    console.log(`\n✅ Migration complete!`)
    console.log(`   Migrated: ${result.migrated}/${result.total}`)
    if (result.failed > 0) {
      console.log(`   Failed: ${result.failed}`)
    }
    if (result.errors && result.errors.length > 0) {
      console.log(`\nErrors:`)
      result.errors.forEach((err: string) => console.log(`   - ${err}`))
    }

    // Generate migration mapping document
    if (result.migrationMapping && result.migrationMapping.length > 0) {
      const mappingDoc = generateMigrationMappingDoc(result.migrationMapping)
      const mappingPath = path.join(process.cwd(), 'docs', 'process-migration-mapping.md')
      fs.writeFileSync(mappingPath, mappingDoc, 'utf-8')
      console.log(`\n📄 Migration mapping document created: ${mappingPath}`)
    }

    return result
  } catch (err) {
    console.error('Error during migration:', err)
    process.exit(1)
  }
}

function generateMigrationMappingDoc(mapping: Array<{ sourceFile: string; topicId: string; title: string; agentTypes: string[] }>): string {
  const lines = [
    '# Process Docs Migration Mapping',
    '',
    'This document maps each process documentation file from `docs/process/**` to its corresponding instruction topic in Supabase.',
    '',
    '**Migration Date:** ' + new Date().toISOString(),
    '**Total Files Migrated:** ' + mapping.length,
    '',
    '## Migration Mapping',
    '',
    '| Source File | Topic ID | Title | Agent Types |',
    '|------------|----------|-------|-------------|',
  ]

  for (const item of mapping.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile))) {
    const agentTypesStr = item.agentTypes.length > 0 
      ? item.agentTypes.join(', ')
      : 'all (shared/global)'
    lines.push(`| \`${item.sourceFile}\` | \`${item.topicId}\` | ${item.title} | ${agentTypesStr} |`)
  }

  lines.push('')
  lines.push('## Agent Type Scoping')
  lines.push('')
  lines.push('- **Shared/Global** (`all`): Instructions that apply to all agent types')
  lines.push('- **PM** (`project-manager`): Instructions specific to Project Manager agents')
  lines.push('- **Implementation** (`implementation-agent`): Instructions specific to Implementation agents')
  lines.push('- **QA** (`qa-agent`): Instructions specific to QA agents')
  lines.push('- **Process Review** (`process-review-agent`): Instructions specific to Process Review agents')
  lines.push('')
  lines.push('## Usage')
  lines.push('')
  lines.push('Agents can retrieve instructions via HAL API endpoints:')
  lines.push('')
  lines.push('- `POST /api/instructions/get` - Get all instructions for an agent type (scoped)')
  lines.push('- `POST /api/instructions/get-topic` - Get a specific topic by ID (can access out-of-scope topics)')
  lines.push('- `POST /api/instructions/get-index` - Get instruction index metadata')
  lines.push('')
  lines.push('## Verification')
  lines.push('')
  lines.push('To verify the migration:')
  lines.push('')
  lines.push('1. Open the HAL app and click "Agent Instructions"')
  lines.push('2. Select different agent types (PM, Implementation, QA, Process Review)')
  lines.push('3. Verify that each agent type shows different instruction topics')
  lines.push('4. Verify that shared/global instructions (marked with `all`) appear for all agent types')

  return lines.join('\n')
}

if (require.main === module) {
  migrateProcessDocs()
    .then(() => {
      console.log('\n✅ Script completed successfully')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Script failed:', err)
      process.exit(1)
    })
}

export { migrateProcessDocs, generateMigrationMappingDoc }
