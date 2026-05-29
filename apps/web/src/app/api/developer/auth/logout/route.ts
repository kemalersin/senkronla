import { clearDeveloperToken } from '@/lib/developer-auth'
import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

export async function POST() {
  const response = await handleDeveloperRelay(async () => {
    const result = await relayDeveloperJson('/developer/logout', { method: 'POST' })
    await clearDeveloperToken()
    return result
  })

  if (response.status === 401) {
    await clearDeveloperToken()
  }

  return response
}
