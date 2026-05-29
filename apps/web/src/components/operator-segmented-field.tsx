'use client'

import { useId } from 'react'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface OperatorSegmentedFieldProps<T extends string> {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  ariaLabel?: string
  compact?: boolean
}

export function OperatorSegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
}: OperatorSegmentedFieldProps<T>) {
  const labelId = useId()

  return (
    <div className={`form-field operator-segmented-field${compact ? ' is-compact' : ''}`}>
      <span className="operator-segmented-label" id={labelId}>
        {label}
      </span>
      <div
        className="operator-segmented-control"
        role="group"
        aria-labelledby={labelId}
        aria-label={ariaLabel ?? label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="operator-segmented-option"
            data-active={value === option.value ? 'true' : 'false'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
