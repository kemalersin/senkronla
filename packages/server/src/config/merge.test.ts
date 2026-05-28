import { describe, expect, it } from 'vitest'
import { deepMerge, interpolateEnv } from './merge.js'
import { serverConfigSchema } from './schema.js'

describe('config merge', () => {
  it('deep merges nested objects', () => {
    const merged = deepMerge(
      { server: { host: '0.0.0.0', port: 8080 }, limits: { defaultFreeDeviceLimit: 2 } },
      { server: { port: 9090 } },
    )

    expect(merged).toEqual({
      server: { host: '0.0.0.0', port: 9090 },
      limits: { defaultFreeDeviceLimit: 2 },
    })
  })

  it('interpolates environment placeholders', () => {
    const result = interpolateEnv(
      { auth: { adminApiToken: '${ESR_ADMIN_TOKEN}' } },
      { ESR_ADMIN_TOKEN: 'x'.repeat(32) },
    )

    expect(result).toEqual({ auth: { adminApiToken: 'x'.repeat(32) } })
  })

  it('rejects invalid config at schema boundary', () => {
    expect(() =>
      serverConfigSchema.parse({
        server: { publicUrl: 'not-a-url' },
      }),
    ).toThrow()
  })
})
