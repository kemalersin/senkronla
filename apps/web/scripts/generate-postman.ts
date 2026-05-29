import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPostmanArtifacts } from '../src/lib/postman-artifacts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(scriptDir, '..', 'public', 'postman')

const artifacts = buildPostmanArtifacts()

mkdirSync(publicDir, { recursive: true })

writeFileSync(
  join(publicDir, 'senkronla-relay.postman_collection.json'),
  `${JSON.stringify(artifacts.collection, null, 2)}\n`,
)
writeFileSync(
  join(publicDir, 'senkronla-relay-local.postman_environment.json'),
  `${JSON.stringify(artifacts.environments.local, null, 2)}\n`,
)
writeFileSync(
  join(publicDir, 'senkronla-relay-production.postman_environment.json'),
  `${JSON.stringify(artifacts.environments.production, null, 2)}\n`,
)

console.log('Wrote Postman artifacts to apps/web/public/postman/')
