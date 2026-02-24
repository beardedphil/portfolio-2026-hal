import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { saveConversationsToStorage } from '../lib/conversationStorage'
import type { Conversation } from '../lib/conversationStorage'

const SUPABASE_DEBOUNCE_MS = 2000

interface UseConversationPersistenceParams {
  conversations: Map<string, Conversation>
  connectedProject: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  agentSequenceRefs: React.MutableRefObject<Map<string, number>>
  pmMaxSequenceRef: React.MutableRefObject<number>
  setPersistenceError: React.Dispatch<React.SetStateAction<string | null>>
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
  const supabaseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    // Debounce Supabase writes so we don't hit hal_conversation_messages on every conversation update (e.g. streaming)
    if (useSupabase) {
      if (supabaseDebounceRef.current) clearTimeout(supabaseDebounceRef.current)
      supabaseDebounceRef.current = setTimeout(() => {
        supabaseDebounceRef.current = null
        // Save ALL conversations to Supabase (0124)
        ;(async () => {
          try {
            const supabase = getSupabaseClient(supabaseUrl!, supabaseAnonKey!)

            for (const [convId, conv] of conversations.entries()) {
              const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0

              const messagesToSave = conv.messages.filter(
                (msg) => msg.id > currentMaxSeq && msg.agent !== 'system' && Number.isInteger(msg.id)
              )

              if (messagesToSave.length > 0) {
                let insertError: { message: string } | null = null
                for (const msg of messagesToSave) {
                  const row = {
                    project_id: connectedProject,
                    agent: convId,
                    role: msg.agent === 'user' ? 'user' : msg.agent === 'system' ? 'system' : 'assistant',
                    content: msg.content,
                    sequence: msg.id,
                    created_at: msg.timestamp.toISOString(),
                    ...(msg.imageAttachments && msg.imageAttachments.length > 0
                      ? {
                          images: msg.imageAttachments.map((img) => ({
                            dataUrl: img.dataUrl,
                            filename: img.filename,
                            mimeType: img.file?.type || 'image/png',
                          })),
                        }
                      : {}),
                  }
                  const { error } = await supabase.from('hal_conversation_messages').insert(row)
                  if (error) {
                    insertError = error
                    console.error(`[HAL] Failed to save messages for conversation ${convId}:`, error)
                    break
                  }
                }

                if (insertError) {
                  setPersistenceError((prev) => prev || `DB: ${insertError!.message}`)
                } else {
                  const newMaxSeq = Math.max(...messagesToSave.map((m) => m.id), currentMaxSeq)
                  agentSequenceRefs.current.set(convId, newMaxSeq)
                  if (conv.agentRole === 'project-manager' && conv.instanceNumber === 1) {
                    pmMaxSequenceRef.current = newMaxSeq
                  }
                  if (localStorageResult.success) {
                    setPersistenceError(null)
                  }
                }
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            console.error('[HAL] Error persisting conversations to Supabase:', err)
            setPersistenceError((prev) => prev || `DB: ${errMsg}`)
          }
        })()
      }, SUPABASE_DEBOUNCE_MS)
    } else {
      if (localStorageResult.success) {
        setPersistenceError(null)
      }
    }

    return () => {
      if (supabaseDebounceRef.current) {
        clearTimeout(supabaseDebounceRef.current)
        supabaseDebounceRef.current = null
      }
    }
  }, [conversations, connectedProject, supabaseUrl, supabaseAnonKey, agentSequenceRefs, pmMaxSequenceRef, setPersistenceError])
}
