#!/usr/bin/env node

/**
 * Run the database migration for agent instructions using Supabase CLI
 * This script uses the Supabase CLI to push migrations and then runs the data migration
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const execAsync = promisify(exec)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const REPO_FULL_NAME = process.env.REPO_FULL_NAME || 'beardedphil/portfolio-2026-hal'

async function runMigration() {
  try {
    console.log('Running database migration for agent instructions...\n')

    // Try to get project ref from config or environment
    let projectRef = null
    if (SUPABASE_URL) {
      const projectRefMatch = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)
      projectRef = projectRefMatch ? projectRefMatch[1] : null
    }

    // Check if already linked
    const configPath = path.join(__dirname, '..', 'supabase', 'config.toml')
    let isLinked = false
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      isLinked = configContent.includes('project_id') && !configContent.includes('project_id = ""')
    }

    if (!isLinked && !projectRef) {
      console.error('Error: Supabase project not linked and no URL found in .env')
      console.error('Please either:')
      console.error('1. Set VITE_SUPABASE_URL or SUPABASE_URL in .env')
      console.error('2. Or link the project: npx supabase link --project-ref <project-ref>')
      process.exit(1)
    }

    if (projectRef) {
      console.log(`Project ref: ${projectRef}`)
      console.log(`Supabase URL: ${SUPABASE_URL}\n`)
    } else if (isLinked) {
      console.log('Using linked Supabase project\n')
    }

    // Check if supabase directory exists, if not initialize it
    const supabaseDir = path.join(__dirname, '..', 'supabase')
    if (!fs.existsSync(supabaseDir)) {
      console.log('Initializing Supabase project...')
      await execAsync('npx supabase init', { cwd: path.join(__dirname, '..') })
    }

    // Link to the project if not already linked
    if (!isLinked && projectRef) {
      console.log('Linking to Supabase project...')
      try {
        await execAsync(`npx supabase link --project-ref ${projectRef}`, {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || '' }
        })
        console.log('✓ Linked to project\n')
      } catch (err) {
        console.log('⚠️  Could not auto-link (may need manual linking or access token)')
        console.log('   You can link manually with: npx supabase link --project-ref ' + projectRef)
        console.log('   Or run the SQL migration manually in Supabase dashboard\n')
      }
    } else if (isLinked) {
      console.log('✓ Project already linked\n')
    }

    // Push migrations
    console.log('Pushing migrations to Supabase...')
    try {
      // Try with linked project first
      let pushCommand = 'npx supabase db push --linked'
      let pushEnv = { ...process.env }
      
      // If we have a db-url, we can use that instead
      if (process.env.DATABASE_URL) {
        pushCommand = `npx supabase db push --db-url "${process.env.DATABASE_URL}"`
      } else if (SUPABASE_URL && process.env.SUPABASE_DB_PASSWORD) {
        // Try to construct connection string from URL and password
        const projectRefMatch = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)
        if (projectRefMatch) {
          const ref = projectRefMatch[1]
          const dbUrl = `postgresql://postgres.${ref}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`
          pushCommand = `npx supabase db push --db-url "${encodeURIComponent(dbUrl)}"`
        }
      }

      const { stdout, stderr } = await execAsync(pushCommand, {
        cwd: path.join(__dirname, '..'),
        env: pushEnv
      })
      if (stdout) console.log(stdout)
      if (stderr && !stderr.includes('Warning') && !stderr.includes('Cannot find project ref')) {
        console.error(stderr)
      }
      console.log('✓ Migrations pushed\n')
    } catch (err) {
      const errorMsg = err.message || String(err)
      if (errorMsg.includes('Cannot find project ref') || errorMsg.includes('not linked')) {
        console.error('❌ Project not linked. Please link first:')
        if (projectRef) {
          console.error(`   npx supabase link --project-ref ${projectRef}`)
        } else {
          console.error('   npx supabase link --project-ref <your-project-ref>')
        }
        console.error('\nOr run the SQL migration manually:')
        console.error('1. Go to Supabase Dashboard → SQL Editor')
        console.error('2. Paste contents of: scripts/migrations/create-agent-instructions-table.sql')
        console.error('3. Run the query')
        console.error('\nThen run the data migration: node scripts/migrate-instructions-to-supabase.js\n')
      } else {
        console.error('❌ Error pushing migrations:', errorMsg)
        console.error('\nAlternative: Run the SQL migration manually:')
        console.error('1. Go to Supabase Dashboard → SQL Editor')
        console.error('2. Paste contents of: scripts/migrations/create-agent-instructions-table.sql')
        console.error('3. Run the query')
        console.error('\nThen run the data migration: node scripts/migrate-instructions-to-supabase.js\n')
      }
      process.exit(1)
    }

    // Check if tables exist (if we have Supabase credentials)
    if (SUPABASE_URL && (SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      console.log('Verifying tables were created...')
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
      const supabase = createClient(SUPABASE_URL, supabaseKey)
      const { error: checkError } = await supabase
        .from('agent_instructions')
        .select('instruction_id')
        .limit(1)

      if (checkError && checkError.code === '42P01') {
        console.error('❌ Tables do not exist. Migration may have failed.')
        console.error('   Please check the migration output above or run SQL manually.')
        process.exit(1)
      }

      console.log('✓ Tables verified\n')
    } else {
      console.log('⚠️  Skipping table verification (no Supabase credentials)\n')
    }

    // Run data migration (if we have Supabase credentials)
    if (SUPABASE_URL && (SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      console.log('Running data migration...')
      const migrationScript = path.join(__dirname, 'migrate-instructions-to-supabase.js')
      const { stdout, stderr } = await execAsync(`node ${migrationScript}`, {
        cwd: path.join(__dirname, '..')
      })
      
      if (stdout) console.log(stdout)
      if (stderr && !stderr.includes('Warning')) console.error(stderr)

      console.log('\n✓ Migration complete!')
      console.log(`\nInstructions are now stored in Supabase for repo: ${REPO_FULL_NAME}`)
    } else {
      console.log('⚠️  Skipping data migration (no Supabase credentials)')
      console.log('   After setting up .env, run: node scripts/migrate-instructions-to-supabase.js')
    }
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

runMigration()
