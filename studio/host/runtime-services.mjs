import { AuthService } from './auth-service.mjs'
import { Database } from './database.mjs'
import { ProjectStore } from './project-store.mjs'
import { CredentialCipher } from './security.mjs'
import { connectRedis, RedisSessionStore } from './session-store.mjs'
import { StudioRepository } from './studio-repository.mjs'

function credentialKey(environment) {
  const encoded = environment.AIPHONE_CREDENTIAL_KEY
  if (!encoded) throw new Error('AIPHONE_CREDENTIAL_KEY is required')
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32) throw new Error('AIPHONE_CREDENTIAL_KEY must be a 32-byte base64url value')
  return key
}

async function importLegacyProjects(repository, projectStore, user) {
  if (await repository.legacyImportComplete()) return { imported: 0 }
  let summaries = []
  try {
    summaries = await projectStore.listWorkflows()
  } catch {
    await repository.markLegacyImportComplete()
    return { imported: 0 }
  }
  let imported = 0
  let failed = 0
  for (const summary of summaries) {
    try {
      const workflow = await projectStore.readWorkflow(summary.id)
      try {
        await repository.createWorkflow(user, workflow)
      } catch (error) {
        if (error?.code !== 'WORKFLOW_EXISTS') throw error
      }
      for (const asset of workflow.assets || []) {
        if (asset.type !== 'IMAGE') continue
        try {
          const image = await projectStore.readImageAsset(workflow.id, asset.id)
          await repository.saveImageAsset(user, workflow.id, {
            record: asset,
            imageBase64: `data:image/png;base64,${image.toString('base64')}`,
          })
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      imported += 1
    } catch (error) {
      failed += 1
      process.stderr.write(`${JSON.stringify({ level: 'warn', event: 'legacy_workflow_import_failed', workflowId: summary.id, message: error.message })}\n`)
    }
  }
  if (failed === 0) await repository.markLegacyImportComplete()
  return { imported, failed }
}

export async function createRuntimeServices(environment = process.env) {
  const database = new Database(environment.DATABASE_URL)
  await database.initialize()
  const redis = await connectRedis(environment.REDIS_URL)
  const sessions = new RedisSessionStore(redis)
  const repository = new StudioRepository(database, new CredentialCipher(credentialKey(environment)))
  const auth = new AuthService({ accounts: repository, sessions })
  const legacyProjectStore = new ProjectStore()
  const bootstrapAdmin = (await repository.listUsers()).find((user) => user.role === 'ADMIN' && user.status === 'ACTIVE')
  if (bootstrapAdmin) await importLegacyProjects(repository, legacyProjectStore, bootstrapAdmin)
  return {
    auth,
    repository,
    sessions,
    importLegacy: (user) => importLegacyProjects(repository, legacyProjectStore, user),
    close: async () => {
      await Promise.allSettled([redis.quit(), database.close()])
    },
  }
}
