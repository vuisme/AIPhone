import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const runtime = await readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/workflow/WorkflowRuntime.kt`, 'utf8')

assert.ok(runtime.includes('private val TEMPLATE_EXPRESSION = Regex("\\\\{\\\\{(.*?)\\\\}\\\\}"'))

console.log('Android workflow runtime escapes both opening and closing template braces.')
