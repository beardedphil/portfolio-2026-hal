/** Insert agent artifact into Supabase (0082) - with duplicate/empty cleanup (0121) */
export async function insertAgentArtifact(
  supabaseUrl: string,
  supabaseAnonKey: string,
  ticketPk: string,
  repoFullName: string,
  agentType: 'implementation' | 'qa' | 'human-in-the-loop' | 'other',
  title: string,
  bodyMd: string
): Promise<void> {
  try {
    // Validate content before attempting to insert (0121)
    const { hasSubstantiveContent } = await import('../api/artifacts/_validation')
    const validation = hasSubstantiveContent(bodyMd, title)
    if (!validation.valid) {
      console.warn(`[Agent Artifact] Skipping ${agentType} artifact "${title}" for ticket ${ticketPk}: ${validation.reason || 'Invalid content'}`)
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Find ALL existing artifacts with the same title (to handle duplicates)
    const { data: existingArtifacts, error: findError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, body_md, created_at')
      .eq('ticket_pk', ticketPk)
      .eq('agent_type', agentType)
      .eq('title', title)
      .order('created_at', { ascending: false })

    if (findError) {
      console.error(`[Agent Artifact] Failed to query existing artifacts:`, findError)
      return
    }

    const artifacts = (existingArtifacts || []) as Array<{
      artifact_id: string
      body_md?: string
      created_at: string
    }>

    // Identify empty/placeholder artifacts using shared validation
    const { isEmptyOrPlaceholder } = await import('../api/artifacts/_validation')
    const emptyArtifactIds: string[] = []
    for (const artifact of artifacts) {
      if (isEmptyOrPlaceholder(artifact.body_md, title)) {
        emptyArtifactIds.push(artifact.artifact_id)
      }
    }

    // Delete all empty/placeholder artifacts to clean up duplicates
    if (emptyArtifactIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('agent_artifacts')
        .delete()
        .in('artifact_id', emptyArtifactIds)

      if (deleteError) {
        console.warn(`[Agent Artifact] Failed to delete empty artifacts:`, deleteError)
      }
    }

    // Determine which artifact to update (prefer the most recent one)
    const artifactsWithContent = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    let targetArtifactId: string | null = null
    if (artifactsWithContent.length > 0) {
      targetArtifactId = artifactsWithContent[0].artifact_id
    } else if (artifacts.length > 0) {
      // If all were empty and we deleted them, check if any remain (race condition)
      const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
      if (remaining.length > 0) {
        targetArtifactId = remaining[0].artifact_id
      }
    }

    if (targetArtifactId) {
      // Update the target artifact
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title,
          body_md: bodyMd,
        })
        .eq('artifact_id', targetArtifactId)

      if (updateError) {
        console.error(`[Agent Artifact] Failed to update ${agentType} artifact "${title}" for ticket ${ticketPk}:`, updateError)
        // Don't return - try to insert as fallback if update failed
      } else {
        return // Successfully updated
      }
    }

    // No existing artifact found (or all were deleted), insert new one
    const { error: insertError } = await supabase.from('agent_artifacts').insert({
      ticket_pk: ticketPk,
      repo_full_name: repoFullName,
      agent_type: agentType,
      title,
      body_md: bodyMd,
    })
    if (insertError) {
      console.error(`[Agent Artifact] Failed to insert ${agentType} artifact "${title}" for ticket ${ticketPk}:`, insertError)
      // Check if it's a duplicate key error (race condition - another process inserted)
      if (insertError.message.includes('duplicate') || insertError.code === '23505') {
        // Try to update the newly created artifact
        const { data: existing } = await supabase
          .from('agent_artifacts')
          .select('artifact_id')
          .eq('ticket_pk', ticketPk)
          .eq('agent_type', agentType)
          .eq('title', title)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (existing?.artifact_id) {
          await supabase
            .from('agent_artifacts')
            .update({ body_md: bodyMd })
            .eq('artifact_id', existing.artifact_id)
        }
      }
    }
  } catch (err) {
    console.error(`[Agent Artifact] Error inserting ${agentType} artifact "${title}" for ticket ${ticketPk}:`, err)
  }
}
