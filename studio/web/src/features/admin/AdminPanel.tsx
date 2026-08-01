import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, Smartphone, UserPlus, Users, Workflow } from 'lucide-react'
import { adminApi, projectApi, type ManagedDevice, type ResourceGrant, type StudioUser } from '../../api/client'
import type { WorkflowSummary } from '../../contracts/workflow'

type AdminSection = 'MEMBERS' | 'WORKFLOWS' | 'DEVICES'
type ManagedWorkflow = WorkflowSummary & { ownerUserId?: string; ownerDisplayName?: string; access?: string }

export function AdminPanel({ currentUser }: { currentUser: StudioUser }) {
  const [section, setSection] = useState<AdminSection>('MEMBERS')
  const [users, setUsers] = useState<StudioUser[]>([])
  const [workflows, setWorkflows] = useState<ManagedWorkflow[]>([])
  const [devices, setDevices] = useState<ManagedDevice[]>([])
  const [workflowId, setWorkflowId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [grants, setGrants] = useState<ResourceGrant[]>([])
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [nextUsers, nextWorkflows, nextDevices] = await Promise.all([adminApi.getUsers(), projectApi.getWorkflows(), adminApi.getDevices()])
      setUsers(nextUsers)
      setWorkflows(nextWorkflows as ManagedWorkflow[])
      setDevices(nextDevices)
      setWorkflowId((current) => current || nextWorkflows[0]?.id || '')
      setDeviceId((current) => current || nextDevices[0]?.id || '')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu quản trị')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const loadGrants = async () => {
      try {
        if (section === 'WORKFLOWS' && workflowId) setGrants(await adminApi.getWorkflowGrants(workflowId))
        else if (section === 'DEVICES' && deviceId) setGrants(await adminApi.getDeviceGrants(deviceId))
        else setGrants([])
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : 'Không thể tải danh sách cấp quyền')
      }
    }
    void loadGrants()
  }, [deviceId, section, workflowId])

  const grantedIds = useMemo(() => new Set(grants.map((grant) => grant.userId)), [grants])
  const selectedWorkflow = workflows.find((workflow) => workflow.id === workflowId)
  const selectedDevice = devices.find((device) => device.id === deviceId)

  const toggleGrant = async (userId: string, enabled: boolean) => {
    try {
      if (section === 'WORKFLOWS') await adminApi.setWorkflowGrant(workflowId, userId, enabled)
      else await adminApi.setDeviceGrant(deviceId, userId, enabled)
      setGrants((current) => enabled
        ? [...current.filter((grant) => grant.userId !== userId), { userId, permission: section === 'WORKFLOWS' ? 'EDIT' : 'USE', email: users.find((user) => user.id === userId)?.email || '', displayName: users.find((user) => user.id === userId)?.displayName || '' }]
        : current.filter((grant) => grant.userId !== userId))
      setNotice(enabled ? 'Đã cấp quyền' : 'Đã thu hồi quyền')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Không thể cập nhật quyền')
    }
  }

  return (
    <section className="admin-workspace">
      <header className="admin-heading"><div><span>IDENTITY & ACCESS</span><h2>Quản trị Studio</h2><p>Quản lý thành viên, quyền chỉnh workflow và quyền sử dụng thiết bị.</p></div><button className="secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} /> Làm mới</button></header>
      {notice && <button className="admin-notice" onClick={() => setNotice(undefined)}>{notice}<span>Đóng</span></button>}
      <nav className="admin-tabs" aria-label="Nhóm quản trị"><button className={section === 'MEMBERS' ? 'active' : ''} onClick={() => setSection('MEMBERS')}><Users size={17} /> Thành viên</button><button className={section === 'WORKFLOWS' ? 'active' : ''} onClick={() => setSection('WORKFLOWS')}><Workflow size={17} /> Quyền Workflow</button><button className={section === 'DEVICES' ? 'active' : ''} onClick={() => setSection('DEVICES')}><Smartphone size={17} /> Quyền thiết bị</button></nav>
      {section === 'MEMBERS' && <MembersSection users={users} currentUser={currentUser} onUsersChanged={setUsers} onNotice={setNotice} />}
      {section === 'WORKFLOWS' && <GrantSection resourceLabel="Workflow" resources={workflows.map((workflow) => ({ id: workflow.id, label: workflow.name, ownerUserId: workflow.ownerUserId, detail: workflow.ownerDisplayName || workflow.access }))} selectedId={workflowId} onSelect={setWorkflowId} users={users} grantedIds={grantedIds} onToggle={toggleGrant} empty="Chưa có workflow để cấp." ownerUserId={selectedWorkflow?.ownerUserId} />}
      {section === 'DEVICES' && <GrantSection resourceLabel="Thiết bị" resources={devices.map((device) => ({ id: device.id, label: device.label || device.model || device.serial, ownerUserId: device.ownerUserId, detail: `${device.serial} · ${device.ownerDisplayName || 'chưa rõ chủ sở hữu'}` }))} selectedId={deviceId} onSelect={setDeviceId} users={users} grantedIds={grantedIds} onToggle={toggleGrant} empty="Chưa có thiết bị đã pairing." ownerUserId={selectedDevice?.ownerUserId} />}
    </section>
  )
}

function MembersSection({ users, currentUser, onUsersChanged, onNotice }: { users: StudioUser[]; currentUser: StudioUser; onUsersChanged: (users: StudioUser[]) => void; onNotice: (notice: string) => void }) {
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<string>()
  const [resetPassword, setResetPassword] = useState('')

  const update = async (userId: string, changes: Partial<Pick<StudioUser, 'role' | 'status'>>) => {
    try {
      const updated = await adminApi.updateUser(userId, changes)
      onUsersChanged(users.map((user) => user.id === updated.id ? updated : user))
      onNotice('Đã cập nhật tài khoản')
    } catch (reason) {
      onNotice(reason instanceof Error ? reason.message : 'Không thể cập nhật tài khoản')
    }
  }

  const reset = async (event: FormEvent) => {
    event.preventDefault()
    if (!resetTarget) return
    try {
      await adminApi.resetPassword(resetTarget, resetPassword)
      setResetTarget(undefined)
      setResetPassword('')
      onNotice('Đã đặt mật khẩu mới và thu hồi toàn bộ phiên cũ')
    } catch (reason) {
      onNotice(reason instanceof Error ? reason.message : 'Không thể đặt lại mật khẩu')
    }
  }

  return <div className="admin-members"><div className="admin-section-title"><div><h3>{users.length} thành viên</h3><p>Khóa tài khoản sẽ thu hồi session Redis ngay lập tức.</p></div><button className="primary-button" onClick={() => setShowCreate((value) => !value)}><UserPlus size={16} /> Thêm thành viên</button></div>{showCreate && <CreateMemberForm onCreated={(user) => { onUsersChanged([...users, user]); setShowCreate(false); onNotice(`Đã tạo ${user.displayName}`) }} onNotice={onNotice} />}<div className="member-table"><div className="member-row member-header"><span>Thành viên</span><span>Vai trò</span><span>Trạng thái</span><span>Hành động</span></div>{users.map((user) => <div className="member-row" key={user.id}><span className="member-identity"><strong>{user.displayName}</strong><small>{user.email}{user.id === currentUser.id ? ' · Bạn' : ''}</small></span><span><select value={user.role} onChange={(event) => void update(user.id, { role: event.target.value as StudioUser['role'] })} disabled={user.id === currentUser.id}><option value="USER">User</option><option value="ADMIN">Admin</option></select></span><span><button className={`status-pill ${user.status.toLowerCase()}`} onClick={() => void update(user.id, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })} disabled={user.id === currentUser.id}>{user.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}</button></span><span><button className="text-button" onClick={() => { setResetTarget(user.id); setResetPassword('') }}><KeyRound size={14} /> Reset mật khẩu</button></span>{resetTarget === user.id && <form className="inline-password-reset" onSubmit={reset}><input type="password" autoFocus value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} maxLength={128} placeholder="Mật khẩu mới, tối thiểu 12 ký tự" required /><button className="primary-button">Xác nhận</button><button type="button" className="secondary-button" onClick={() => setResetTarget(undefined)}>Hủy</button></form>}</div>)}</div></div>
}

function CreateMemberForm({ onCreated, onNotice }: { onCreated: (user: StudioUser) => void; onNotice: (notice: string) => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'USER'>('USER')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try { onCreated(await adminApi.createUser({ displayName, email, password, role })) }
    catch (reason) { onNotice(reason instanceof Error ? reason.message : 'Không thể tạo thành viên') }
  }
  return <form className="create-member" onSubmit={submit}><label>Họ tên<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Mật khẩu tạm<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label><label>Vai trò<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="USER">User</option><option value="ADMIN">Admin</option></select></label><button className="primary-button"><ShieldCheck size={16} /> Tạo tài khoản</button></form>
}

function GrantSection({ resourceLabel, resources, selectedId, onSelect, users, grantedIds, onToggle, empty, ownerUserId }: { resourceLabel: string; resources: Array<{ id: string; label: string; detail?: string; ownerUserId?: string }>; selectedId: string; onSelect: (id: string) => void; users: StudioUser[]; grantedIds: Set<string>; onToggle: (userId: string, enabled: boolean) => void; empty: string; ownerUserId?: string }) {
  if (resources.length === 0) return <div className="admin-empty">{empty}</div>
  return <div className="grant-layout"><aside><label>Chọn {resourceLabel.toLowerCase()}<select value={selectedId} onChange={(event) => onSelect(event.target.value)}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>{resources.filter((resource) => resource.id === selectedId).map((resource) => <div className="resource-card" key={resource.id}><strong>{resource.label}</strong><small>{resource.detail}</small></div>)}</aside><section><div className="admin-section-title"><div><h3>Thành viên được cấp</h3><p>Chủ sở hữu luôn có quyền; grant có thể thu hồi bất kỳ lúc nào.</p></div></div><div className="grant-list">{users.filter((user) => user.status === 'ACTIVE' && user.id !== ownerUserId).map((user) => <label key={user.id} className="grant-row"><span><strong>{user.displayName}</strong><small>{user.email} · {user.role}</small></span><input type="checkbox" checked={grantedIds.has(user.id)} onChange={(event) => void onToggle(user.id, event.target.checked)} /></label>)}</div></section></div>
}
