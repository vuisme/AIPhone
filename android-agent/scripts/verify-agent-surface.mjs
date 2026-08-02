import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const [activity, service, callbackClient, launcher] = await Promise.all([
  readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/MainActivity.kt`, 'utf8'),
  readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/AutomationService.kt`, 'utf8'),
  readFile(`${projectRoot}app/src/main/java/com/aiphone/agent/callback/CloudCallbackClient.kt`, 'utf8'),
  readFile(`${projectRoot}app/src/main/res/drawable/ic_launcher_foreground.xml`, 'utf8'),
])

assert.match(activity, /ConnectionMode\.CLOUD/)
assert.match(activity, /ConnectionMode\.ADB/)
assert.match(activity, /AI PHONE AUTOMATION SYSTEM/)
assert.doesNotMatch(activity, /AUTOMATION STAYS ON PHONE/)
assert.doesNotMatch(activity, /text = "AI"/)
assert.match(service, /ACTION_STOP_SERVICE/)
assert.match(service, /addAction/)
assert.match(service, /R\.drawable\.ic_notification/)
assert.doesNotMatch(service, /Studio cục bộ tại cổng/)
assert.match(callbackClient, /onStatusChanged/)
assert.match(callbackClient, /reportServiceFailure/)
assert.match(activity, /callback\.message\.trim\(\)/)
assert.doesNotMatch(launcher, /M43,69 L51,41 L59,69/)

console.log('Android Agent exposes professional connection modes, branding, and notification controls.')
