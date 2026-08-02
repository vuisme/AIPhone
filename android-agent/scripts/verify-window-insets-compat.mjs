import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const activity = await readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/MainActivity.kt`, 'utf8')

assert.doesNotMatch(activity, /WindowCompat\.getInsetsController/)
assert.doesNotMatch(activity, /androidx\.core\.view\.WindowInsets/)
assert.match(activity, /window\.setDecorFitsSystemWindows\(false\)/)
assert.match(activity, /rootView\.setOnApplyWindowInsetsListener/)
assert.match(activity, /WindowInsets\.Type\.systemBars\(\)/)
assert.match(activity, /window\.statusBarColor = Color\.TRANSPARENT/)
assert.match(activity, /window\.navigationBarColor = Color\.TRANSPARENT/)

console.log('Android Agent applies platform insets without WindowInsetsController compatibility calls.')
