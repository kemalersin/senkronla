import { OperatorCopyButton } from '@/components/operator-copy-button'

interface OperatorCopyFieldProps {
  label: string
  value: string
}

export function OperatorCopyField({ label, value }: OperatorCopyFieldProps) {
  return (
    <div className="operator-verify-field">
      <span className="operator-verify-field-label">{label}</span>
      <div className="operator-verify-field-value">
        <code>{value}</code>
        <OperatorCopyButton value={value} />
      </div>
    </div>
  )
}
