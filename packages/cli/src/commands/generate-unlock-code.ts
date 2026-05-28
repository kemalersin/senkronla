interface ParsedArgs {
  namespaceId?: string
  slots?: string
  expiresAt?: string
  note?: string
  apiUrl?: string
  adminToken?: string
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg?.startsWith('--')) {
      continue
    }

    const key = arg.slice(2)
    const value = args[index + 1]
    if (value && !value.startsWith('--')) {
      parsed[key as keyof ParsedArgs] = value
      index += 1
    }
  }

  return parsed
}

function printHelp() {
  console.log(`Usage:
  senkronla generate-unlock-code --namespace-id <uuid> --slots <number> [options]

Options:
  --namespace-id   Target namespace UUID (required)
  --slots          Number of slots to unlock (required)
  --expires-at     ISO expiry datetime (optional)
  --note           Operator note (optional)
  --api-url        API base URL (default: ESR_PUBLIC_URL or http://localhost:8080)
  --admin-token    Admin bearer token (default: ESR_ADMIN_TOKEN)
`)
}

export async function runGenerateUnlockCode(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const parsed = parseArgs(args)
  const namespaceId = parsed.namespaceId
  const slots = parsed.slots

  if (!namespaceId || !slots) {
    printHelp()
    process.exit(1)
  }

  const apiUrl = parsed.apiUrl ?? process.env.ESR_PUBLIC_URL ?? 'http://localhost:8080'
  const adminToken = parsed.adminToken ?? process.env.ESR_ADMIN_TOKEN

  if (!adminToken) {
    console.error('Missing admin token. Set ESR_ADMIN_TOKEN or pass --admin-token.')
    process.exit(1)
  }

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/admin/unlock-codes`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      namespaceId,
      slots: Number(slots),
      ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {}),
      ...(parsed.note ? { note: parsed.note } : {}),
    }),
  })

  const body = await response.text()
  if (!response.ok) {
    console.error(`Request failed (${response.status}): ${body}`)
    process.exit(1)
  }

  console.log(body)
}
