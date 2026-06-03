import { Prism } from 'prism-react-renderer'

globalThis.Prism = Prism

let ready: Promise<void> | null = null

/** Load Prism grammars that are not bundled in prism-react-renderer. */
export function ensurePrismLanguages(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      import('prismjs/components/prism-bash.js'),
      import('prismjs/components/prism-http.js'),
    ]).then(() => undefined)
  }
  return ready
}

export { Prism }
