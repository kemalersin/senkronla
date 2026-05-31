export type ShikiThemeId = 'github-light' | 'github-dark'

export const SHIKI_THEME_CHANGED_EVENT = 'senkronla-shiki-theme-change'

export function resolveShikiThemeId(theme?: string | null): ShikiThemeId {
  return theme === 'dark' ? 'github-dark' : 'github-light'
}

export function readDocumentShikiTheme(): ShikiThemeId {
  if (typeof document === 'undefined') {
    return 'github-light'
  }

  return resolveShikiThemeId(document.documentElement.dataset.theme)
}

export function notifyShikiThemeChange() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(SHIKI_THEME_CHANGED_EVENT))
}
