import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { logStartupWarnings } from './lib/startup-warnings.js'
import { ensureBlobDirectory } from './blob/filesystem.js'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/migrate.js'
import { createPool } from './db/pool.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

for (const envFile of ['.env']) {
  const envPath = resolve(repoRoot, envFile)
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath })
  }
}

async function main() {
  let config

  try {
    config = loadConfig()
  } catch (error) {
    console.error('Invalid configuration — startup aborted')
    console.error(error)
    process.exit(1)
  }

  logStartupWarnings(config)

  const db = createPool(config)

  try {
    const applied = await runMigrations(db)
    if (applied.length > 0) {
      console.info(`Applied migrations: ${applied.join(', ')}`)
    }

    const { seedAppsFromConfig } = await import('./services/app-registry-service.js')
    await seedAppsFromConfig(db, config)
  } catch (error) {
    console.error('Database migration failed — startup aborted')
    console.error(error)
    await db.end()
    process.exit(1)
  }

  try {
    await ensureBlobDirectory(config.blob.filesystem.path)
  } catch (error) {
    console.error('Blob directory initialization failed — startup aborted')
    console.error(error)
    await db.end()
    process.exit(1)
  }

  const app = await buildApp({ config, db })

  try {
    await app.listen({ host: config.server.host, port: config.server.port })
    app.log.info(`Senkronla API listening on ${config.server.publicUrl}`)
    app.log.info(`Swagger UI available at ${config.server.publicUrl}/docs`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

main()
