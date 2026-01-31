/**
 * Superrepo ticket sync (docs-only validation).
 *
 * Why:
 * - `portfolio-2026-hal` is a superrepo that aggregates submodules.
 * - The actual per-project Supabase sync runs inside each project repo.
 *
 * What this script does:
 * - validates docs/tickets/*.md filenames start with 4 digits
 * - prints a summary and exits 0
 *
 * This keeps the "always run sync-tickets after writing tickets" rule satisfied
 * without accidentally writing into the wrong project database.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const ticketsDir = path.join(projectRoot, 'docs', 'tickets')

function main() {
  if (!fs.existsSync(ticketsDir)) {
    console.log('No docs/tickets folder found; nothing to validate.')
    return
  }

  const filenames = fs.readdirSync(ticketsDir).filter((n) => n.endsWith('.md')).sort()
  const invalid = filenames.filter((n) => !/^\d{4}-/.test(n) && n !== 'README.md')

  if (invalid.length > 0) {
    console.log('Invalid ticket filenames (must start with 4 digits + dash):')
    for (const f of invalid) console.log('- ' + f)
    process.exitCode = 1
    return
  }

  const tickets = filenames.filter((n) => /^\d{4}-/.test(n))
  console.log(`Validated ${tickets.length} ticket(s) in docs/tickets/.`)
}

main()
