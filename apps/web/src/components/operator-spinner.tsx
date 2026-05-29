interface OperatorSpinnerProps {
  label: string
  compact?: boolean
}

export function OperatorSpinner({ label, compact = false }: OperatorSpinnerProps) {
  return (
    <div
      className={`operator-panel-spinner${compact ? ' is-compact' : ''}`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="operator-spinner" aria-label={label} role="status" />
    </div>
  )
}
