import { Highlight, themes, type PrismTheme } from 'prism-react-renderer'
import { useState } from 'react'
import { Prism } from '../prism-setup.ts'
import { CheckIcon, CopyIcon } from './icons.tsx'

export interface CodeBlockProps {
  code: string
  language: string
  dark: boolean
  copyLabel?: string
  copiedLabel?: string
  /** Header label; defaults to uppercased language id. */
  label?: string
  compact?: boolean
  showCopy?: boolean
  maxHeight?: string
  className?: string
}

export interface HttpExampleBlocksProps {
  headers: string
  body?: string | null
  dark: boolean
  copyLabel: string
  copiedLabel: string
  requestLabel: string
  bodyLabel: string
  headersLanguage?: 'http' | 'bash'
  compact?: boolean
}

const LIGHT_THEME: PrismTheme = themes.oneLight
const DARK_THEME: PrismTheme = themes.vsDark

export function HttpExampleBlocks({
  headers,
  body,
  dark,
  copyLabel,
  copiedLabel,
  requestLabel,
  bodyLabel,
  headersLanguage = 'http',
  compact = true,
}: HttpExampleBlocksProps) {
  return (
    <>
      <CodeBlock
        code={headers}
        language={headersLanguage}
        dark={dark}
        label={requestLabel}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
        compact={compact}
      />
      {body ? (
        <CodeBlock
          code={body}
          language="json"
          dark={dark}
          label={bodyLabel}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          compact={compact}
        />
      ) : null}
    </>
  )
}

export function CodeBlock({
  code,
  language,
  dark,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  label,
  compact = false,
  showCopy = true,
  maxHeight,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const headerLabel = label ?? language

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`code-block${compact ? ' code-block-compact' : ''}${className ? ` ${className}` : ''}`}>
      {!compact || showCopy ? (
        <div className="code-block-head">
          <span className="code-block-lang">{headerLabel}</span>
          {showCopy ? (
            <button type="button" className="code-copy" data-copied={copied} onClick={handleCopy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? copiedLabel : copyLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className="code-block-body"
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        <Highlight
          code={code.trimEnd()}
          language={language}
          theme={dark ? DARK_THEME : LIGHT_THEME}
          prism={Prism}
        >
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre
              style={{
                ...style,
                background: 'transparent',
                margin: 0,
              }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => {
                    const tokenProps = getTokenProps({ token })
                    return (
                      <span
                        key={key}
                        {...tokenProps}
                        style={{
                          ...(typeof tokenProps.style === 'object' ? tokenProps.style : undefined),
                          display: token.empty ? tokenProps.style?.display : 'inline',
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
