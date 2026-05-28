import { describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error.js'
import type { ServerConfig } from '../config/schema.js'
import { assertCanAddDevice, buildLimits, canAddDevice } from './slot-service.js'

const config = {
  limits: {
    onLimitReached: {
      mode: 'payment',
      slotPackages: [3, 5, 10],
    },
  },
} as ServerConfig

describe('slot-service', () => {
  it('computes max devices from free and purchased slots', () => {
    expect(buildLimits(2, 3, 1)).toEqual({
      freeDeviceLimit: 2,
      purchasedSlots: 3,
      maxDevices: 5,
      activeDevices: 1,
    })
  })

  it('detects when a new device can be added', () => {
    expect(canAddDevice(buildLimits(2, 0, 2))).toBe(false)
    expect(canAddDevice(buildLimits(2, 0, 1))).toBe(true)
  })

  it('throws payment required when mode is payment', () => {
    try {
      assertCanAddDevice(config, buildLimits(2, 0, 2))
      expect.unreachable('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('DEVICE_LIMIT_PAYMENT_REQUIRED')
    }
  })
})
