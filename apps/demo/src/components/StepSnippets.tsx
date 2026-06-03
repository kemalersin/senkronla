import type { StepId } from '../i18n.ts'
import { formatConnectSdkSnippet, formatConnectYoursSnippet, SNIPPETS } from '../i18n.ts'
import { CodeBlock } from './CodeBlock.tsx'

interface StepSnippetsProps {
  step: StepId
  dark: boolean
  sdkLabel: string
  yoursLabel: string
  yoursHint: string
  copyLabel: string
  copiedLabel: string
  persistRecoveryPhrase?: boolean
  deviceLabel?: string
}

export function StepSnippets({
  step,
  dark,
  sdkLabel,
  yoursLabel,
  yoursHint,
  copyLabel,
  copiedLabel,
  persistRecoveryPhrase,
  deviceLabel,
}: StepSnippetsProps) {
  const snippet = SNIPPETS[step]
  const sdkCode =
    step === 'connect' && deviceLabel !== undefined
      ? formatConnectSdkSnippet(persistRecoveryPhrase ?? false, deviceLabel)
      : snippet.sdk
  const yoursCode =
    step === 'connect' && persistRecoveryPhrase !== undefined
      ? formatConnectYoursSnippet(persistRecoveryPhrase)
      : snippet.yours

  return (
    <div className="snippet-stack">
      <CodeBlock
        code={sdkCode}
        language={snippet.lang}
        dark={dark}
        label={sdkLabel}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />
      {yoursCode ? (
        <>
          <p className="snippet-hint">{yoursHint}</p>
          <CodeBlock
            code={yoursCode}
            language={snippet.lang}
            dark={dark}
            label={yoursLabel}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            className="code-block-yours"
          />
        </>
      ) : null}
    </div>
  )
}
