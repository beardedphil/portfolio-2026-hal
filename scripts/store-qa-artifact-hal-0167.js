#!/usr/bin/env node
/**
 * Store QA report as artifact in Supabase for ticket HAL-0167
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function storeQaArtifact() {
  const reportPath = path.join(__dirname, '..', 'QA_REPORT_HAL-0167.md')
  const report = fs.readFileSync(reportPath, 'utf8')
  
  const ticketId = '0167'
  const title = 'QA report for ticket 0167'
  
  const body = {
    ticketId,
    title,
    body_md: report,
  }
  
  // Try to get Supabase credentials from environment or .env file
  let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  
  // If not in env, try to read from .env file
  if (!supabaseUrl || !supabaseAnonKey) {
    try {
      const envPath = path.join(__dirname, '..', '.env')
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8')
        const lines = envContent.split('\n')
        for (const line of lines) {
          const match = line.match(/^([^#=]+)=(.*)$/)
          if (match) {
            const key = match[1].trim()
            const value = match[2].trim().replace(/^["']|["']$/g, '')
            if (key === 'SUPABASE_URL' || key === 'VITE_SUPABASE_URL') {
              supabaseUrl = supabaseUrl || value
            }
            if (key === 'SUPABASE_ANON_KEY' || key === 'VITE_SUPABASE_ANON_KEY') {
              supabaseAnonKey = supabaseAnonKey || value
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not read .env file:', err.message)
    }
  }
  
  if (supabaseUrl) body.supabaseUrl = supabaseUrl
  if (supabaseAnonKey) body.supabaseAnonKey = supabaseAnonKey
  
  // Determine API URL - try local dev server first, then production
  const apiUrl = process.env.HAL_API_URL || 'http://localhost:5173'
  const endpoint = `${apiUrl}/api/artifacts/insert-qa`
  
  console.log(`Storing QA artifact for ticket ${ticketId}...`)
  console.log(`API endpoint: ${endpoint}`)
  console.log(`Report length: ${report.length} characters`)
  console.log(`Has Supabase URL: ${!!supabaseUrl}`)
  console.log(`Has Supabase Key: ${!!supabaseAnonKey}`)
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    const result = await response.json()
    
    if (!result.success) {
      console.error('Failed to store QA artifact:', result.error)
      process.exit(1)
    }
    
    console.log('✅ QA artifact stored successfully!')
    console.log(`   Artifact ID: ${result.artifact_id}`)
    console.log(`   Action: ${result.action}`)
    if (result.cleaned_up_duplicates) {
      console.log(`   Cleaned up ${result.cleaned_up_duplicates} duplicate(s)`)
    }
  } catch (err) {
    console.error('Error storing QA artifact:', err.message)
    console.error('\nNote: Make sure HAL dev server is running (npm run dev) or set HAL_API_URL environment variable.')
    process.exit(1)
  }
}

storeQaArtifact().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
