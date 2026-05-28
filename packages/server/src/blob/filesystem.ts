import { access, constants, mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export async function ensureBlobDirectory(blobPath: string): Promise<void> {
  await mkdir(blobPath, { recursive: true })
}

export async function checkBlobStorage(blobPath: string): Promise<void> {
  await access(blobPath, constants.R_OK | constants.W_OK)

  const probePath = join(blobPath, '.health-probe')
  await writeFile(probePath, 'ok', 'utf8')
  await unlink(probePath)
}
