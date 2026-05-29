'use client'

import { useEffect } from 'react'
import { acquirePageScrollLock } from '@/lib/page-scroll-lock'

export function usePageScrollLock(locked: boolean, source = 'overlay'): void {
  useEffect(() => {
    if (!locked) {
      return
    }

    return acquirePageScrollLock(source)
  }, [locked, source])
}
