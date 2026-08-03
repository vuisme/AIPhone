import { slugifyId } from './ids'

export function accountScope(accountId: string): string {
  return `user-${slugifyId(accountId, 'account', 48)}`
}

export function accountStorageKey(baseKey: string, accountId: string): string {
  return `${baseKey}.${accountScope(accountId)}`
}
