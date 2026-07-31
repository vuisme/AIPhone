import type { NodeType } from '../../contracts/workflow'

export interface AndroidUserOption {
  value: number
  label: string
}

const MAIN_USER: AndroidUserOption = { value: 0, label: 'App chính' }
const CLONE_USER: AndroidUserOption = { value: 999, label: 'App kép / XSpace' }
const CLONE_ONLY_NODES = new Set<NodeType>(['CREATE_CLONE', 'DELETE_CLONE', 'CLEAR_CLONE'])

export function androidUserOptions(nodeType: NodeType): AndroidUserOption[] {
  return CLONE_ONLY_NODES.has(nodeType) ? [CLONE_USER] : [MAIN_USER, CLONE_USER]
}
