import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const manifest = await readFile(`${projectRoot}app/src/main/AndroidManifest.xml`, 'utf8')
const policy = await readFile(`${projectRoot}app/src/main/res/xml/network_security_config.xml`, 'utf8')
const callbackClient = await readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/callback/CloudCallbackClient.kt`, 'utf8')

assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/)
assert.doesNotMatch(manifest, /android:usesCleartextTraffic="true"/)
assert.match(policy, /<base-config\s+cleartextTrafficPermitted="false"\s*\/>/)
assert.equal((policy.match(/cleartextTrafficPermitted="true"/g) ?? []).length, 1)
assert.match(
  policy,
  /<domain-config\s+cleartextTrafficPermitted="true">\s*<domain\s+includeSubdomains="false">127\.0\.0\.1<\/domain>\s*<\/domain-config>/,
)
assert.match(callbackClient, /URL\("http:\/\/127\.0\.0\.1:8765\$path"\)/)

console.log('Android network policy permits cleartext only for the Agent loopback bridge.')
