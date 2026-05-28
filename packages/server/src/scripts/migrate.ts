import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { loadConfig } from '../config.js'
import { runMigrations } from '../db/migrate.js'
import { createPool } from '../db/pool.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

for (const envFile of ['.env', 'docker/.env']) {
  const envPath = resolve(repoRoot, envFile)
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath })
  }
}

async function main() {
  const config = loadConfig()
  const pool = createPool(config)

  try {
    const applied = await runMigrations(pool)
    if (applied.length === 0) {
      console.info('No pending migrations')
    } else {
      console.info(`Applied migrations: ${applied.join(', ')}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
