import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { insertAgentArtifact } from '../artifact-helpers'
import { moveTicketToColumn } from './ticket-movement'

/** Determine QA verdict from qa-report.md content */
export function determineVerdict(qaReportPath: string): 'PASS' | 'FAIL' | 'UNKNOWN' {
  try {
    if (fs.existsSync(qaReportPath)) {
      const qaReportContent = fs.readFileSync(qaReportPath, 'utf8')
      if (/verdict.*pass/i.test(qaReportContent) || /ok\s+to\s+merge/i.test(qaReportContent)) {
        return 'PASS'
      } else if (/verdict.*fail/i.test(qaReportContent)) {
        return 'FAIL'
      }
    }
  } catch {
    // Report may not exist yet or be unreadable
  }
  return 'UNKNOWN'
}

/** Handle QA agent completion - move ticket and insert artifact */
export async function handleQACompletion(
  supabase: any,
  ticketId: string,
  bodyMd: string,
  summary: string,
  verdict: 'PASS' | 'FAIL' | 'UNKNOWN',
  ticketFilename: string,
  repoRoot: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<void> {
  // Insert QA artifact (0082)
  try {
    const { data: ticketData } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, display_id')
      .eq('id', ticketId)
      .single()
    
    if (ticketData?.pk && ticketData?.repo_full_name) {
      const displayId = ticketData.display_id || ticketId
      let artifactBody = summary
      
      if (verdict === 'PASS') {
        artifactBody += `\n\n**Verdict: PASS**\n\nTicket ${displayId} has been merged to main and moved to Human in the Loop.`
      } else if (verdict === 'FAIL') {
        artifactBody += `\n\n**Verdict: FAIL**\n\nThe ticket was not merged. Review the implementation and create a bugfix ticket if needed.`
      } else {
        artifactBody += `\n\n**Verdict: UNKNOWN**\n\nQA completed for ticket ${displayId}. Verdict could not be determined.`
      }
      
      await insertAgentArtifact(
        supabaseUrl,
        supabaseAnonKey,
        ticketData.pk,
        ticketData.repo_full_name,
        'qa',
        `QA report for ticket ${displayId}`,
        artifactBody
      )
    }
  } catch (artifactErr) {
    console.error('[QA Agent] Failed to insert artifact:', artifactErr)
  }

  // Move ticket based on verdict
  if (verdict === 'PASS' || verdict === 'UNKNOWN') {
    const targetColumn = 'col-human-in-the-loop'
    await moveTicketToColumn(supabase, ticketId, bodyMd, targetColumn, repoRoot, supabaseUrl, supabaseAnonKey)
  } else if (verdict === 'FAIL') {
    const targetColumn = 'col-todo'
    await moveTicketToColumn(supabase, ticketId, bodyMd, targetColumn, repoRoot, supabaseUrl, supabaseAnonKey)
  }
}
