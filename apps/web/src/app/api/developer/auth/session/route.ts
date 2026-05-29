import { developerUnauthorized } from '@/lib/developer-api-response'
import { DeveloperAuthError, relayDeveloperJson } from '@/lib/developer-relay'

export async function GET() {
  try {
    const { status, body } = await relayDeveloperJson('/developer/me')
    return Response.json(body, { status })
  } catch (error) {
    if (error instanceof DeveloperAuthError) {
      return developerUnauthorized(error.message)
    }

    return developerUnauthorized()
  }
}
