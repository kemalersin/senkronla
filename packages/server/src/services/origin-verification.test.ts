import { describe, expect, it } from 'vitest'
import type { ServerConfig } from '../config/schema.js'
import {
  buildVerificationInstructions,
  generateVerificationToken,
  isLocalhostOriginVerificationExempt,
} from './origin-verification-service.js'

const config = {
  apps: {
    allowLocalhostOrigins: false,
    verification: {
      dnsRecordPrefix: '_esr-verify',
      wellKnownPath: '/.well-known/esr-app-verification',
      fetchTimeoutSeconds: 10,
    },
  },
} as ServerConfig

const localhostConfig = {
  apps: {
    allowLocalhostOrigins: true,
    verification: config.apps.verification,
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

  it('detects localhost origin verification exemption', () => {
    expect(isLocalhostOriginVerificationExempt(localhostConfig, 'http://localhost')).toBe(true)
    expect(isLocalhostOriginVerificationExempt(localhostConfig, 'http://127.0.0.1:3000')).toBe(true)
    expect(isLocalhostOriginVerificationExempt(localhostConfig, 'https://app.example.com')).toBe(
      false,
    )
    expect(isLocalhostOriginVerificationExempt(config, 'http://localhost')).toBe(false)
  })

  it('generates unique verification tokens', () => {
    const first = generateVerificationToken()
    const second = generateVerificationToken()

    expect(first).toHaveLength(32)
    expect(second).toHaveLength(32)
    expect(first).not.toBe(second)
  })
})
