import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { CredentialCipher, hashPassword, normalizeEmail, verifyPassword } from '../security.mjs'

test('password hashes are salted and verify without storing plaintext', async () => {
  const first = await hashPassword('Correct horse battery staple 42!')
  const second = await hashPassword('Correct horse battery staple 42!')

  assert.notEqual(first, second)
  assert.equal(first.includes('Correct horse'), false)
  assert.equal(await verifyPassword('Correct horse battery staple 42!', first), true)
  assert.equal(await verifyPassword('wrong password', first), false)
})

test('emails are normalized for identity lookup', () => {
  assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com')
  assert.throws(() => normalizeEmail('not-an-email'), /email/i)
})

test('credential encryption is bound to the exact device record and serial', () => {
  const cipher = new CredentialCipher(randomBytes(32))
  const encrypted = cipher.encrypt('pairing-token-secret', 'device-id', 'serial-a')

  assert.equal(JSON.stringify(encrypted).includes('pairing-token-secret'), false)
  assert.equal(cipher.decrypt(encrypted, 'device-id', 'serial-a'), 'pairing-token-secret')
  assert.throws(() => cipher.decrypt(encrypted, 'device-id', 'serial-b'))
})
