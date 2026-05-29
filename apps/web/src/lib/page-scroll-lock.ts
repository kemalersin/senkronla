let lockCount = 0
let releaseLock: (() => void) | null = null

export const OVERLAY_OPEN_EVENT = 'senkronla:overlay-open'

function isInsideScrollableOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) {
    return false
  }

  let node: Node | null = target
  while (node instanceof HTMLElement) {
    if (node.getAttribute('role') === 'dialog') {
      return true
    }

    node = node.parentElement
  }

  return false
}

function createPageScrollLock(): () => void {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  const previousBodyPaddingRight = document.body.style.paddingRight
  const header = document.querySelector('.site-header')
  const previousHeaderPaddingRight =
    header instanceof HTMLElement ? header.style.paddingRight : ''

  let spacer: HTMLDivElement | null = null
  if (header instanceof HTMLElement) {
    spacer = document.createElement('div')
    spacer.setAttribute('aria-hidden', 'true')
    spacer.className = 'page-scroll-header-spacer'
    spacer.style.height = `${header.getBoundingClientRect().height}px`
    header.insertAdjacentElement('afterend', spacer)
  }

  document.documentElement.classList.add('page-scroll-locked')
  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`
    if (header instanceof HTMLElement) {
      header.style.paddingRight = `${scrollbarWidth}px`
    }
  }

  function preventBackgroundScroll(event: Event) {
    if (isInsideScrollableOverlay(event.target)) {
      return
    }

    event.preventDefault()
  }

  document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true })
  document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true })

  return () => {
    spacer?.remove()
    document.documentElement.classList.remove('page-scroll-locked')
    document.body.style.paddingRight = previousBodyPaddingRight
    if (header instanceof HTMLElement) {
      header.style.paddingRight = previousHeaderPaddingRight
    }
    document.removeEventListener('wheel', preventBackgroundScroll, { capture: true })
    document.removeEventListener('touchmove', preventBackgroundScroll, { capture: true })
  }
}

export function acquirePageScrollLock(source = 'overlay'): () => void {
  const previousCount = lockCount
  lockCount += 1
  if (lockCount === 1) {
    releaseLock = createPageScrollLock()
  }

  if (previousCount >= 1 && source !== 'site-menu') {
    window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT))
  }

  let released = false
  return () => {
    if (released) {
      return
    }

    released = true
    lockCount -= 1
    if (lockCount === 0 && releaseLock) {
      releaseLock()
      releaseLock = null
    }
  }
}
