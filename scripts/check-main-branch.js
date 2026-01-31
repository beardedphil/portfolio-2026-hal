#!/usr/bin/env node
/**
 * Enforces that the dev server runs on main.
 * HAL serves on port 5173 from main; the user tests in "Human in the Loop" after QA merges.
 * Exits 1 if current branch is not main.
 */
import { execSync } from 'child_process'

const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
if (branch !== 'main') {
  console.error(
    `\nERROR: Dev server must run on main. Current branch: ${branch}\n` +
      `  The dev server (port 5173) serves main so you can test merged work in "Human in the Loop".\n` +
      `  Run: git checkout main\n\n`
  )
  process.exit(1)
}
