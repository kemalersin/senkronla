import { describe, expect, it } from 'vitest'

import {
  mergeEffectiveMailConfig,
  mergeMailSettingsOverride,
  redactMailSettingsForResponse,
} from '../types/mail-settings.js'
import { mailConfigSchema } from '../types/mail-settings.js'

const baseConfig = mailConfigSchema.parse({
  enabled: false,
  from: 'config@example.com',
  fromName: 'Config Name',
  webBaseUrl: 'http://localhost:3000',
  smtp: {
    host: 'smtp.config.example',
    port: 587,
    secure: false,
    user: 'config-user',
    password: 'config-pass',
  },
})

describe('mail settings merge', () => {
  it('merges operator overrides over config defaults', () => {
    const override = mergeMailSettingsOverride(null, {
      enabled: true,
      smtp: {
        host: 'smtp.override.example',
        password: 'override-pass',
      },
    })

    const effective = mergeEffectiveMailConfig(baseConfig, override)

    expect(effective.enabled).toBe(true)
    expect(effective.from).toBe('config@example.com')
    expect(effective.smtp.host).toBe('smtp.override.example')
    expect(effective.smtp.password).toBe('override-pass')
    expect(effective.smtp.user).toBe('config-user')
  })

  it('redacts passwords in admin response', () => {
    const override = mergeMailSettingsOverride(null, {
      smtp: { password: 'override-pass' },
    })
    const effective = mergeEffectiveMailConfig(baseConfig, override)
    const response = redactMailSettingsForResponse(baseConfig, override, effective)

    expect(response.config.smtp.passwordConfigured).toBe(true)
    expect(response.effective.smtp.passwordConfigured).toBe(true)
    expect(response).not.toHaveProperty('effective.smtp.password')
  })
})
