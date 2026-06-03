import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons.tsx'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  showLabel: string
  hideLabel: string
  onBlur?: () => void
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = 'off',
  showLabel,
  hideLabel,
  onBlur,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}
