import { describe, it, expect } from 'vitest'
import { generateFailureFingerprint } from './_shared.js'
import type { FailureInput } from './_shared.js'

describe('generateFailureFingerprint', () => {
  it('generates fingerprint for failure input', () => {
    const input: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const fingerprint = generateFailureFingerprint(input)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent fingerprints for same input', () => {
    const input: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const fp1 = generateFailureFingerprint(input)
    const fp2 = generateFailureFingerprint(input)
    expect(fp1).toBe(fp2)
  })

  it('normalizes failure type to uppercase', () => {
    const input1: FailureInput = {
      failureType: 'test_failure',
      sourceType: 'drift_attempt',
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).toBe(fp2)
  })

  it('trims whitespace from failure type', () => {
    const input1: FailureInput = {
      failureType: '  TEST_FAILURE  ',
      sourceType: 'drift_attempt',
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).toBe(fp2)
  })

  it('includes metadata in fingerprint', () => {
    const input1: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { key1: 'value1' },
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { key2: 'value2' },
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).not.toBe(fp2)
  })

  it('excludes volatile metadata keys', () => {
    const input1: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { timestamp: '2024-01-01', key: 'value' },
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { timestamp: '2024-01-02', key: 'value' },
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).toBe(fp2) // Same fingerprint because timestamp is excluded
  })

  it('produces different fingerprints for different source types', () => {
    const input1: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'agent_outcome',
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).not.toBe(fp2)
  })

  it('handles metadata with sorted keys', () => {
    const input1: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { a: 1, b: 2 },
    }
    const input2: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: { b: 2, a: 1 },
    }
    const fp1 = generateFailureFingerprint(input1)
    const fp2 = generateFailureFingerprint(input2)
    expect(fp1).toBe(fp2) // Same fingerprint regardless of key order
  })

  it('handles empty metadata', () => {
    const input: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
      metadata: {},
    }
    const fingerprint = generateFailureFingerprint(input)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles null metadata', () => {
    const input: FailureInput = {
      failureType: 'TEST_FAILURE',
      sourceType: 'drift_attempt',
    }
    const fingerprint = generateFailureFingerprint(input)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})
