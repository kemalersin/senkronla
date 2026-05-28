'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface CodeBlockCopyButtonProps {
  code: string
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M4.75 10.75H3.75C2.78 10.75 2 9.97 2 8.99V3.76C2 2.79 2.78 2 3.76 2H8.99C9.97 2 10.75 2.78 10.75 3.76V4.75"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.25L6.75 11.5L12.5 4.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CodeBlockCopyButton({ code }: CodeBlockCopyButtonProps) {
  const t = useTranslations('codeBlock')
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <button
      type="button"
      className="code-block-copy"
      onClick={handleCopy}
      aria-label={copied ? t('copied') : t('copy')}
      title={copied ? t('copied') : t('copy')}
      data-copied={copied ? 'true' : 'false'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
