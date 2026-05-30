export const NATIVE_PLATFORMS = ['ios', 'android', 'desktop'] as const

export type NativePlatform = (typeof NATIVE_PLATFORMS)[number]

export function isNativePlatform(value: string): value is NativePlatform {
  return (NATIVE_PLATFORMS as readonly string[]).includes(value)
}
