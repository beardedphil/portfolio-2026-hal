#!/usr/bin/env node

/**
 * Postinstall script to create symlinks from kanban project's node_modules
 * to root node_modules for React and React DOM.
 * 
 * This fixes the "Invalid hook call" error when running tests from root
 * by ensuring both React and React DOM resolve from the same location.
 */

import { existsSync, lstatSync, unlinkSync, symlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')
const kanbanNodeModules = resolve(rootDir, 'projects/kanban/node_modules')
const rootReact = resolve(rootDir, 'node_modules/react')
const rootReactDom = resolve(rootDir, 'node_modules/react-dom')
const kanbanReact = resolve(kanbanNodeModules, 'react')
const kanbanReactDom = resolve(kanbanNodeModules, 'react-dom')

function createSymlink(target, linkPath, name) {
  // Check if target exists
  if (!existsSync(target)) {
    console.warn(`Warning: ${name} target does not exist: ${target}`)
    return
  }

  // Check if symlink already exists and points to correct target
  if (existsSync(linkPath)) {
    const stats = lstatSync(linkPath)
    if (stats.isSymbolicLink()) {
      const { readlinkSync } = require('fs')
      try {
        const currentTarget = readlinkSync(linkPath)
        const resolvedTarget = resolve(linkPath, '..', currentTarget)
        const resolvedExpected = resolve(target)
        if (resolve(resolvedTarget) === resolve(resolvedExpected)) {
          // Symlink already points to correct target
          return
        }
        // Remove incorrect symlink
        unlinkSync(linkPath)
      } catch (error) {
        // If readlink fails, remove and recreate
        unlinkSync(linkPath)
      }
    } else if (stats.isDirectory()) {
      // Don't remove if it's a real directory (might have been installed)
      console.log(`Skipping ${name}: ${linkPath} is a directory, not a symlink`)
      return
    }
  }

  // Create symlink
  try {
    symlinkSync(target, linkPath, 'dir')
    console.log(`Created symlink: ${name} -> ${target}`)
  } catch (error) {
    if (error.code === 'EEXIST') {
      // Symlink already exists, which is fine
      return
    }
    console.error(`Error creating symlink for ${name}:`, error.message)
  }
}

// Create symlinks
if (existsSync(kanbanNodeModules)) {
  createSymlink(rootReact, kanbanReact, 'react')
  createSymlink(rootReactDom, kanbanReactDom, 'react-dom')
} else {
  console.log('Kanban node_modules does not exist, skipping symlink creation')
}
