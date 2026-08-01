import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react'
import { App } from '../../App'
import { ApiError, authApi, isStandaloneStudio, type AuthSession, type StudioUser } from '../../api/client'

type AuthView = 'LOADING' | 'SETUP' | 'LOGIN' | 'READY'

export function AuthGate() {
  const standalone = isStandaloneStudio()
  const [view, setView] = useState<AuthView>('LOADING')
  const [session, setSession] = useState<AuthSession>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!standalone) return
    let cancelled = false
    const initialize = async () => {
      try {
        const status = await authApi.setupStatus()
        if (cancelled) return
        if (status.setupRequired) return setView('SETUP')
        try {
          const active = await authApi.session()
          if (!cancelled) { setSession(active); setView('READY') }
        } catch (reason) {
          if (!cancelled) {
            if (reason instanceof ApiError && reason.status !== 401) setError(reason.message)
            setView('LOGIN')
          }
        }
      } catch (reason) {
        if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Không thể kết nối Studio Host'); setView('LOGIN') }
      }
    }
    const requireLogin = () => { setSession(undefined); setView('LOGIN'); setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.') }
    window.addEventListener('aiphone:auth-required', requireLogin)
    void initialize()
    return () => { cancelled = true; window.removeEventListener('aiphone:auth-required', requireLogin) }
  }, [standalone])

  if (!standalone) {
    const deviceUser: StudioUser = { id: 'device-local', email: 'device@local', displayName: 'Thiết bị cục bộ', role: 'ADMIN', status: 'ACTIVE' }
    return <App user={deviceUser} onLogout={() => undefined} />
  }

  if (view === 'LOADING') return <AuthLoading />
  if (view === 'SETUP') return <AuthForm mode="SETUP" error={error} onAuthenticated={(next) => { setSession(next); setView('READY') }} />
  if (view === 'LOGIN' || !session) return <AuthForm mode="LOGIN" error={error} onAuthenticated={(next) => { setError(undefined); setSession(next); setView('READY') }} />
  return <App user={session.user} onLogout={async () => { await authApi.logout(); setSession(undefined); setView('LOGIN') }} />
}

function AuthLoading() {
  return <main className="auth-shell"><section className="auth-card auth-loading" aria-live="polite"><LoaderCircle className="spin" size={28} /><strong>Đang mở kho Studio an toàn...</strong></section></main>
}

function AuthForm({ mode, error: initialError, onAuthenticated }: { mode: 'SETUP' | 'LOGIN'; error?: string; onAuthenticated: (session: AuthSession) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const setup = mode === 'SETUP'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (setup && password !== confirmation) return setError('Mật khẩu xác nhận không khớp')
    setBusy(true)
    setError(undefined)
    try {
      onAuthenticated(setup
        ? await authApi.setup({ email, displayName, password })
        : await authApi.login({ email, password }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-hidden="true">
        <div className="auth-brand"><span>AI</span><strong>PHONE STUDIO</strong></div>
        <h1>{setup ? 'Thiết lập trung tâm điều khiển.' : 'Quay lại phòng điều khiển.'}</h1>
        <p>Workflow, Assets và thiết bị được phân quyền tại backend. Pairing token được mã hóa và không bao giờ quay lại trình duyệt.</p>
        <div className="auth-security-list"><span><ShieldCheck size={17} /> RBAC Admin / User</span><span><KeyRound size={17} /> Session HttpOnly + CSRF</span><span><Smartphone size={17} /> Thiết bị theo chủ sở hữu và grant</span></div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-heading"><LockKeyhole size={22} /><div><span>{setup ? 'FIRST RUN' : 'SECURE ACCESS'}</span><h2>{setup ? 'Tạo quản trị viên đầu tiên' : 'Đăng nhập Studio'}</h2></div></div>
        {setup && <label>Họ tên<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required /></label>}
        <label>Email<input autoFocus={!setup} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required /></label>
        {setup && <label>Xác nhận mật khẩu<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{setup ? 'Khởi tạo Studio' : 'Đăng nhập'}</button>
        <small>{setup ? 'Tài khoản này có toàn quyền quản lý thành viên và tài nguyên.' : 'Phiên đăng nhập được lưu phía server, không dùng localStorage token.'}</small>
      </form>
    </main>
  )
}
