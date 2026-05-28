import { CodeBlock } from '@/components/code-block'
import { DocTag } from '@/components/doc-tag'

const HTTP_METHOD_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(.+)$/i

function splitHttpMethod(label: string) {
  const match = label.match(HTTP_METHOD_PATTERN)
  if (!match?.[1] || !match[2]) {
    return null
  }

  return {
    method: match[1].toUpperCase(),
    path: match[2],
  }
}

interface DocEndpointHeadingProps {
  label: string
}

export function DocEndpointHeading({ label }: DocEndpointHeadingProps) {
  const parts = splitHttpMethod(label)

  return (
    <p className="doc-subheading doc-endpoint-heading">
      {parts ? (
        <>
          <DocTag>{parts.method}</DocTag>{' '}
          <span className="doc-endpoint-path">{parts.path}</span>
        </>
      ) : (
        label
      )}
    </p>
  )
}

interface DocHttpExampleProps {
  request: string
  response?: string
  requestLabel: string
  responseLabel: string
}

export function DocHttpExample({ request, response, requestLabel, responseLabel }: DocHttpExampleProps) {
  return (
    <>
      <p className="doc-subheading">{requestLabel}</p>
      <CodeBlock code={request} language="http" />
      {response ? (
        <>
          <p className="doc-subheading">{responseLabel}</p>
          <CodeBlock code={response} language="http" />
        </>
      ) : null}
    </>
  )
}
