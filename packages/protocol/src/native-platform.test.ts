import { describe, expect, it } from 'vitest'

import { isNativePlatform, NATIVE_PLATFORMS } from './native-platform.js'

describe('native-platform', () => {
  it('lists ios, android, and desktop', () => {
    expect(NATIVE_PLATFORMS).toEqual(['ios', 'android', 'desktop'])
  })

  it('validates known platforms', () => {
    expect(isNativePlatform('ios')).toBe(true)
    expect(isNativePlatform('android')).toBe(true)
    expect(isNativePlatform('desktop')).toBe(true)
    expect(isNativePlatform('web')).toBe(false)
  })
})
