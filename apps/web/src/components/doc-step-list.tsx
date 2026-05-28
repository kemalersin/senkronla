export interface DocStep {
  title: string
  body: React.ReactNode
}

interface DocStepListProps {
  steps: DocStep[]
}

export function DocStepList({ steps }: DocStepListProps) {
  return (
    <ol className="doc-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="doc-step-num">{index + 1}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
