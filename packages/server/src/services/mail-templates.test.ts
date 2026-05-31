import { describe, expect, it } from 'vitest'

import { buildDeveloperMailTemplate } from './mail-templates.js'

describe('buildDeveloperMailTemplate', () => {
  it('renders branded HTML with CTA and fallback link', () => {
    const template = buildDeveloperMailTemplate({
      locale: 'en',
      kind: 'email_verify',
      link: 'https://sync.example.com/en/developer/verify?token=abc',
      brandName: 'Senkronla',
      webBaseUrl: 'https://sync.example.com',
    })

    expect(template.subject).toBe('Verify your developer account')
    expect(template.text).toContain('Verify your email')
    expect(template.text).toContain('https://sync.example.com/en/developer/verify?token=abc')
    expect(template.html).toContain('senkron<span style="color:#0b7a71;">la</span>')
    expect(template.html).toContain('background-color:#0b7a71')
    expect(template.html).toContain('Verify email')
    expect(template.html).toContain('https://sync.example.com/en/developer/verify?token=abc')
  })

  it('localizes Turkish password reset copy', () => {
    const template = buildDeveloperMailTemplate({
      locale: 'tr',
      kind: 'password_reset',
      link: 'https://sync.example.com/tr/developer/reset-password?token=xyz',
      brandName: 'Senkronla',
      webBaseUrl: 'https://sync.example.com',
    })

    expect(template.subject).toBe('Geliştirici şifrenizi sıfırlayın')
    expect(template.html).toContain('Parolanızı sıfırlayın')
    expect(template.html).toContain('Parolayı sıfırla')
  })
})
