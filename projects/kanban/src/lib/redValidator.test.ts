import { describe, it, expect } from 'vitest'
import { validateRed, parseRedJson, type RedDocument } from './redValidator'

describe('redValidator', () => {
  describe('validateRed', () => {
    it('passes valid RED document', () => {
      const red: RedDocument = {
        version: 'v0',
        functionalRequirements: [
          'The system shall allow users to create accounts with email and password',
          'The system shall support password reset via email verification',
          'The system shall allow users to update their profile information',
          'The system shall provide role-based access control for different user types',
          'The system shall log all authentication attempts for security auditing',
        ],
        edgeCases: [
          'Handle case where user tries to register with existing email',
          'Handle case where password reset token expires before use',
          'Handle case where user updates profile while logged in from multiple devices',
          'Handle case where role assignment changes while user has active session',
          'Handle case where authentication log storage is full',
          'Handle case where email service is temporarily unavailable during registration',
          'Handle case where user attempts to access resource after role downgrade',
          'Handle case where session expires during critical operation',
        ],
        nonFunctionalRequirements: 'The system must respond to user requests within 2 seconds under normal load',
        outOfScope: 'Social media integration and third-party authentication providers are not included in this phase',
        assumptions: 'Users have access to email for account verification and password reset',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(true)
      expect(result.failures).toHaveLength(0)
    })
    
    it('fails when functional requirements count is too low', () => {
      const red: RedDocument = {
        functionalRequirements: ['Req 1', 'Req 2', 'Req 3'],
        edgeCases: Array(8).fill('Edge case'),
        nonFunctionalRequirements: 'NFR',
        outOfScope: 'Out of scope',
        assumptions: 'Assumption',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'count' && f.field === 'functionalRequirements')).toBe(true)
    })
    
    it('fails when edge cases count is too low', () => {
      const red: RedDocument = {
        functionalRequirements: Array(5).fill('Req'),
        edgeCases: ['Edge 1', 'Edge 2', 'Edge 3'],
        nonFunctionalRequirements: 'NFR',
        outOfScope: 'Out of scope',
        assumptions: 'Assumption',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'count' && f.field === 'edgeCases')).toBe(true)
    })
    
    it('fails when required fields are missing', () => {
      const red: RedDocument = {
        functionalRequirements: Array(5).fill('Req'),
        edgeCases: Array(8).fill('Edge'),
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'presence' && f.field === 'nonFunctionalRequirements')).toBe(true)
      expect(result.failures.some(f => f.type === 'presence' && f.field === 'outOfScope')).toBe(true)
      expect(result.failures.some(f => f.type === 'presence' && f.field === 'assumptions')).toBe(true)
    })
    
    it('fails when placeholders are present', () => {
      const red: RedDocument = {
        functionalRequirements: ['Valid requirement', 'TBD', 'TODO: implement this'],
        edgeCases: Array(8).fill('Edge case'),
        nonFunctionalRequirements: 'NFR',
        outOfScope: 'Out of scope',
        assumptions: 'Assumption',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'placeholder')).toBe(true)
    })
    
    it('fails when items are too vague', () => {
      const red: RedDocument = {
        functionalRequirements: [
          'The system shall handle errors',
          'The system shall make it robust',
          'The system shall optimize performance',
          'The system shall ensure quality',
          'Valid requirement with enough detail to pass validation',
        ],
        edgeCases: Array(8).fill('Edge case'),
        nonFunctionalRequirements: 'NFR',
        outOfScope: 'Out of scope',
        assumptions: 'Assumption',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'vagueness')).toBe(true)
    })
    
    it('fails when items are too short', () => {
      const red: RedDocument = {
        functionalRequirements: ['Short', 'Also short', 'Too brief', 'Not enough', 'Valid requirement with enough detail to pass validation'],
        edgeCases: Array(8).fill('Edge case'),
        nonFunctionalRequirements: 'NFR',
        outOfScope: 'Out of scope',
        assumptions: 'Assumption',
      }
      
      const result = validateRed(red)
      expect(result.pass).toBe(false)
      expect(result.failures.some(f => f.type === 'vagueness' && f.message.includes('too short'))).toBe(true)
    })
    
    it('handles array and string formats for optional fields', () => {
      const red1: RedDocument = {
        functionalRequirements: Array(5).fill('Req'),
        edgeCases: Array(8).fill('Edge'),
        nonFunctionalRequirements: 'Single string',
        outOfScope: ['Array', 'format'],
        assumptions: 'Single string',
      }
      
      const red2: RedDocument = {
        functionalRequirements: Array(5).fill('Req'),
        edgeCases: Array(8).fill('Edge'),
        nonFunctionalRequirements: ['Array', 'format'],
        outOfScope: 'Single string',
        assumptions: ['Array', 'format'],
      }
      
      const result1 = validateRed(red1)
      const result2 = validateRed(red2)
      
      expect(result1.pass).toBe(true)
      expect(result2.pass).toBe(true)
    })
    
    it('produces deterministic failure ordering', () => {
      const red: RedDocument = {
        functionalRequirements: ['TBD', 'TODO', 'Short', 'Handle errors'],
        edgeCases: ['Edge 1'],
        nonFunctionalRequirements: '',
        outOfScope: '',
        assumptions: '',
      }
      
      const result1 = validateRed(red)
      const result2 = validateRed(red)
      
      expect(result1.failures).toEqual(result2.failures)
      expect(result1.failures.map(f => f.type)).toEqual(['count', 'count', 'presence', 'presence', 'presence', 'placeholder', 'placeholder', 'vagueness', 'vagueness'])
    })
  })
  
  describe('parseRedJson', () => {
    it('parses valid JSON', () => {
      const json = JSON.stringify({ version: 'v0', functionalRequirements: [] })
      const { red, error } = parseRedJson(json)
      expect(error).toBeNull()
      expect(red).toEqual({ version: 'v0', functionalRequirements: [] })
    })
    
    it('rejects invalid JSON', () => {
      const { red, error } = parseRedJson('invalid json')
      expect(red).toBeNull()
      expect(error).not.toBeNull()
    })
    
    it('rejects non-object JSON', () => {
      const { red, error } = parseRedJson('"string"')
      expect(red).toBeNull()
      expect(error).toContain('object')
    })
  })
})
