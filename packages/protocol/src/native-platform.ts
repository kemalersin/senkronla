/** Native app platforms registered in the app bundle registry. */
export const NATIVE_PLATFORMS = ['ios', 'android', 'desktop'] as const

export type NativePlatform = (typeof NATIVE_PLATFORMS)[number]

export type AppPlatform = 'web' | NativePlatform

export function isNativePlatform(value: string): value is NativePlatform {
  return (NATIVE_PLATFORMS as readonly string[]).includes(value)
}
