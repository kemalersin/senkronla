import { describe, expect, it } from 'vitest'
import type { ServerConfig } from '../config/schema.js'
import { buildVerificationInstructions, generateVerificationToken } from './origin-verification-service.js'

const config = {
  apps: {
    verification: {
      dnsRecordPrefix: '_esr-verify',
      wellKnownPath: '/.well-known/esr-app-verification',
      fetchTimeoutSeconds: 10,
    },
  },
} as ServerConfig

describe('origin-verification-service', () => {
  it('builds DNS and HTTPS verification instructions', () => {
    const token = generateVerificationToken()
    const instructions = buildVerificationInstructions(
      'https://app.example.com',
      'esr_app_demo',
      token,
      config,
    )

    expect(instructions.dnsHost).toBe('_esr-verify.app.example.com')
    expect(instructions.dnsTxt).toBe(`esr_verify=esr_app_demo:${token}`)
    expect(instructions.wellKnownUrl).toBe(
      'https://app.example.com/.well-known/esr-app-verification',
    )
  })

  it('generates unique verification tokens', () => {
    const first = generateVerificationToken()
    const second = generateVerificationToken()

    expect(first).toHaveLength(32)
    expect(second).toHaveLength(32)
    expect(first).not.toBe(second)
  })
})
