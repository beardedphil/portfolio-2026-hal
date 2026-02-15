import { describe, it, expect } from 'vitest'
import { canonicalizeColumnRows, KANBAN_COLUMN_IDS } from './canonicalizeColumns'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'

describe('canonicalizeColumnRows', () => {
  describe('canonical column ordering', () => {
    it('returns columns in canonical order when all are present', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-done', title: 'Done', position: 6, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-unassigned', title: 'Unassigned', position: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-todo', title: 'To-do', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-doing', title: 'Doing', position: 2, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-qa', title: 'Ready for QA', position: 3, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-human-in-the-loop', title: 'Human in the Loop', position: 4, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-process-review', title: 'Process Review', position: 5, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-wont-implement', title: 'Will Not Implement', position: 7, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]
      const result = canonicalizeColumnRows(rows)
      expect(result).toHaveLength(8)
      expect(result[0].id).toBe('col-unassigned')
      expect(result[1].id).toBe('col-todo')
      expect(result[2].id).toBe('col-doing')
      expect(result[3].id).toBe('col-qa')
      expect(result[4].id).toBe('col-human-in-the-loop')
      expect(result[5].id).toBe('col-process-review')
      expect(result[6].id).toBe('col-done')
      expect(result[7].id).toBe('col-wont-implement')
    })

    it('filters out non-canonical columns', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-todo', title: 'To-do', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-custom', title: 'Custom Column', position: 2, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-doing', title: 'Doing', position: 3, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]
      const result = canonicalizeColumnRows(rows)
      expect(result).toHaveLength(8)
      expect(result.find(c => c.id === 'col-custom')).toBeUndefined()
      expect(result.find(c => c.id === 'col-todo')).toBeDefined()
      expect(result.find(c => c.id === 'col-doing')).toBeDefined()
    })

    it('preserves original column data when present', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-todo', title: 'Custom To-do Title', position: 42, created_at: '2024-01-01', updated_at: '2024-01-02' },
      ]
      const result = canonicalizeColumnRows(rows)
      const todoCol = result.find(c => c.id === 'col-todo')
      expect(todoCol).toBeDefined()
      expect(todoCol?.title).toBe('Custom To-do Title')
      expect(todoCol?.position).toBe(42)
      expect(todoCol?.created_at).toBe('2024-01-01')
      expect(todoCol?.updated_at).toBe('2024-01-02')
    })
  })

  describe('fallback titles', () => {
    it('uses "Ready for QA" for col-qa when missing', () => {
      const rows: SupabaseKanbanColumnRow[] = []
      const result = canonicalizeColumnRows(rows)
      const qaCol = result.find(c => c.id === 'col-qa')
      expect(qaCol).toBeDefined()
      expect(qaCol?.title).toBe('Ready for QA')
    })

    it('generates fallback title from id for other missing columns', () => {
      const rows: SupabaseKanbanColumnRow[] = []
      const result = canonicalizeColumnRows(rows)
      
      const unassignedCol = result.find(c => c.id === 'col-unassigned')
      expect(unassignedCol?.title).toBe('unassigned')
      
      const todoCol = result.find(c => c.id === 'col-todo')
      expect(todoCol?.title).toBe('todo')
      
      const doingCol = result.find(c => c.id === 'col-doing')
      expect(doingCol?.title).toBe('doing')
      
      const hitlCol = result.find(c => c.id === 'col-human-in-the-loop')
      expect(hitlCol?.title).toBe('human in the loop')
      
      const processCol = result.find(c => c.id === 'col-process-review')
      expect(processCol?.title).toBe('process review')
      
      const doneCol = result.find(c => c.id === 'col-done')
      expect(doneCol?.title).toBe('done')
      
      const wontCol = result.find(c => c.id === 'col-wont-implement')
      expect(wontCol?.title).toBe('wont implement')
    })

    it('creates fallback columns with correct position index', () => {
      const rows: SupabaseKanbanColumnRow[] = []
      const result = canonicalizeColumnRows(rows)
      
      expect(result[0].position).toBe(0)
      expect(result[1].position).toBe(1)
      expect(result[2].position).toBe(2)
      expect(result[3].position).toBe(3)
      expect(result[4].position).toBe(4)
      expect(result[5].position).toBe(5)
      expect(result[6].position).toBe(6)
      expect(result[7].position).toBe(7)
    })

    it('creates fallback columns with empty created_at and updated_at', () => {
      const rows: SupabaseKanbanColumnRow[] = []
      const result = canonicalizeColumnRows(rows)
      
      result.forEach(col => {
        expect(col.created_at).toBe('')
        expect(col.updated_at).toBe('')
      })
    })

    it('creates fallback columns for partially missing columns', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-todo', title: 'To-do', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-done', title: 'Done', position: 6, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]
      const result = canonicalizeColumnRows(rows)
      
      expect(result).toHaveLength(8)
      expect(result.find(c => c.id === 'col-todo')?.title).toBe('To-do')
      expect(result.find(c => c.id === 'col-done')?.title).toBe('Done')
      expect(result.find(c => c.id === 'col-unassigned')?.title).toBe('unassigned')
      expect(result.find(c => c.id === 'col-qa')?.title).toBe('Ready for QA')
    })
  })

  describe('edge cases', () => {
    it('handles empty input array', () => {
      const rows: SupabaseKanbanColumnRow[] = []
      const result = canonicalizeColumnRows(rows)
      expect(result).toHaveLength(8)
      expect(result.every(c => KANBAN_COLUMN_IDS.includes(c.id as any))).toBe(true)
    })

    it('handles duplicate canonical columns by using first occurrence', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-todo', title: 'First To-do', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'col-todo', title: 'Second To-do', position: 2, created_at: '2024-01-02', updated_at: '2024-01-02' },
      ]
      const result = canonicalizeColumnRows(rows)
      const todoCol = result.find(c => c.id === 'col-todo')
      expect(todoCol?.title).toBe('First To-do')
    })

    it('always returns exactly 8 columns in canonical order', () => {
      const rows: SupabaseKanbanColumnRow[] = [
        { id: 'col-todo', title: 'To-do', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]
      const result = canonicalizeColumnRows(rows)
      expect(result).toHaveLength(8)
      expect(result.map(c => c.id)).toEqual([
        'col-unassigned',
        'col-todo',
        'col-doing',
        'col-qa',
        'col-human-in-the-loop',
        'col-process-review',
        'col-done',
        'col-wont-implement',
      ])
    })
  })
})