import { useEffect } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { saveConversationsToStorage } from '../lib/conversationStorage'
import type { Conversation } from '../lib/conversationStorage'

interface UseConversationPersistenceParams {
  conversations: Map<string, Conversation>
  connectedProject: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  agentSequenceRefs: React.MutableRefObject<Map<string, number>>
  pmMaxSequenceRef: React.MutableRefObject<number>
  setPersistenceError: (error: string | null) => void
}

export function useConversationPersistence({
  conversations,
  connectedProject,
  supabaseUrl,
  supabaseAnonKey,
  agentSequenceRefs,
  pmMaxSequenceRef,
  setPersistenceError,
}: UseConversationPersistenceParams) {
  // Persist conversations to Supabase (0124: save ALL conversations to Supabase when connected, fallback to localStorage)
  // 0097: ALWAYS save to localStorage as backup, even when Supabase is available, to ensure conversations persist across disconnect/reconnect
  useEffect(() => {
    if (!connectedProject) return
    const useSupabase = supabaseUrl != null && supabaseAnonKey != null

    // ALWAYS save to localStorage first (synchronously) as backup (0097: ensure conversations persist even if Supabase fails or is slow)
    const localStorageResult = saveConversationsToStorage(connectedProject, conversations)
    if (!localStorageResult.success && localStorageResult.error) {
      setPersistenceError(localStorageResult.error)
    }

    // Also save to Supabase if available (async, for cross-device persistence)
    if (useSupabase) {
      // Save ALL conversations to Supabase (0124)
      ;(async () => {
        try {
          const supabase = getSupabaseClient(supabaseUrl!, supabaseAnonKey!)

          // For each conversation, save new messages that aren't yet in Supabase
          for (const [convId, conv] of conversations.entries()) {
            const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0

            // Find messages that need to be saved (sequence > currentMaxSeq)
            // Filter out system messages - they are ephemeral and use fractional IDs that can't be stored as integers
            const messagesToSave = conv.messages.filter((msg) => msg.id > currentMaxSeq && msg.agent !== 'system')

            if (messagesToSave.length > 0) {
              // Insert new messages into Supabase
              const inserts = messagesToSave.map((msg) => ({
                project_id: connectedProject,
                agent: convId, // Use conversation ID as agent field (e.g., "project-manager-1", "implementation-agent-2")
                role: msg.agent === 'user' ? 'user' : msg.agent === 'system' ? 'system' : 'assistant',
                content: msg.content,
                sequence: msg.id,
                created_at: msg.timestamp.toISOString(),
                images: msg.imageAttachments
                  ? msg.imageAttachments.map((img) => ({
                      dataUrl: img.dataUrl,
                      filename: img.filename,
                      mimeType: img.file?.type || 'image/png',
                    }))
                  : null,
              }))

              const { error } = await supabase.from('hal_conversation_messages').insert(inserts)

              if (error) {
                console.error(`[HAL] Failed to save messages for conversation ${convId}:`, error)
                // Don't overwrite localStorage error if it exists, but show Supabase error
                setPersistenceError((prev) => prev || `DB: ${error.message}`)
              } else {
                // Update max sequence for this conversation
                const newMaxSeq = Math.max(...messagesToSave.map((m) => m.id), currentMaxSeq)
                agentSequenceRefs.current.set(convId, newMaxSeq)

                // Backward compatibility: update pmMaxSequenceRef for PM conversations
                if (conv.agentRole === 'project-manager' && conv.instanceNumber === 1) {
                  pmMaxSequenceRef.current = newMaxSeq
                }

                // Clear error only if localStorage save succeeded
                if (localStorageResult.success) {
                  setPersistenceError(null)
                }
              }
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[HAL] Error persisting conversations to Supabase:', err)
          // Don't overwrite localStorage error if it exists, but show Supabase error
          setPersistenceError((prev) => prev || `DB: ${errMsg}`)
        }
      })()
    } else {
      // No Supabase: localStorage save already done above, just clear error if successful
      if (localStorageResult.success) {
        setPersistenceError(null)
      }
    }
  }, [conversations, connectedProject, supabaseUrl, supabaseAnonKey, agentSequenceRefs, pmMaxSequenceRef, setPersistenceError])
}
