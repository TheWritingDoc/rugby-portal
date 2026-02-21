import { useEffect, useRef, useState } from 'react'
import { processQueue } from './utils/api'
import Header from './components/Header'
import Selection from './pages/Selection'
import Dashboard from './pages/Dashboard'
import SchoolForm from './pages/forms/SchoolForm'
import PlayerForm from './pages/forms/PlayerForm'
import CoachForm from './pages/forms/CoachForm'
import RefereeForm from './pages/forms/RefereeForm'
import AdminForm from './pages/forms/AdminForm'
import { RolePicker, RoleGate } from './components/RoleGate'
import Login from './pages/Login'
import Approvals from './pages/Approvals'
import Reports from './pages/Reports'
import AuditLogs from './pages/AuditLogs'
import { trackUserAction, trackPerformance, metrics } from './utils/metrics'

type FormKey = 'school' | 'player' | 'coach' | 'referee' | 'admin'
type ScreenKey = FormKey | 'home' | 'dashboard' | 'login' | 'approvals' | 'reports'

export default function App() {
  const [role, setRole] = useState<'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'>('Player')
  const [screen, setScreen] = useState<ScreenKey>('home')
  const [navStack, setNavStack] = useState<ScreenKey[]>([])
  const roleRef = useRef(role)
  const screenRef = useRef(screen)
  useEffect(() => { roleRef.current = role }, [role])
  useEffect(() => { screenRef.current = screen }, [screen])

  function navigate(next: ScreenKey, opts?: { reset?: boolean; replace?: boolean }) {
    const activeRole = roleRef.current
    if (!canAccess(next, activeRole)) {
      trackUserAction('navigation_denied', 'role_guard', { attempted: next, role: activeRole })
      alert('Not authorized for this section')
      return
    }
    const current = screenRef.current
    if (opts?.reset) {
      trackUserAction('navigation', 'screen_change', { from: current, to: next, role: activeRole, mode: 'reset' })
      setNavStack([])
      setScreen(next)
      return
    }
    if (!opts?.replace && current !== next) {
      setNavStack((s) => [...s, current])
    }
    trackUserAction('navigation', 'screen_change', { from: current, to: next, role: activeRole, mode: opts?.replace ? 'replace' : 'push' })
    setScreen(next)
  }

  function goBack() {
    setNavStack((s) => {
      const prev = s[s.length - 1]
      if (!prev) return s
      const activeRole = roleRef.current
      if (!canAccess(prev, activeRole)) return s.slice(0, -1)
      trackUserAction('navigation', 'back', { from: screenRef.current, to: prev, role: activeRole })
      setScreen(prev)
      return s.slice(0, -1)
    })
  }
  
  useEffect(() => {
    // Initialize metrics with user info
    const email = localStorage.getItem('auth:email') || 'anonymous'
    metrics.setUser(email)
    trackUserAction('app_init', 'application', { role })
    
    try {
      const target = localStorage.getItem('nav:target')
      if (target === 'dashboard') {
        setNavStack(['home'])
        setScreen('dashboard')
      }
    } catch {}
    
    const h = (e: any) => {
      const next = e?.detail
      if (typeof next === 'string') {
        trackUserAction('navigation', 'app_navigate', next)
        navigate(next as ScreenKey)
      }
    }
    window.addEventListener('app:navigate', h as any)
    return () => { window.removeEventListener('app:navigate', h as any) }
  }, [])
  
  useEffect(() => {
    if (screen === 'dashboard') {
      const r = localStorage.getItem('auth:role') as any
      if (r) setRole(r)
      try {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('app:dashboard:mounted'))
          trackUserAction('dashboard_mounted', 'navigation', { role: r })
        }, 50)
      } catch {}
    }
  }, [screen])
  
  useEffect(() => {
    const id = setInterval(() => { 
      processQueue()
      trackUserAction('queue_process', 'background_task')
    }, 5000)
    return () => clearInterval(id)
  }, [])
  
  const canGoBack = navStack.length > 0
  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        {canGoBack && (
          <div className="mb-4">
            <button data-testid="btn-back" onClick={goBack} className="rounded-md border bg-white px-3 py-2">Back</button>
          </div>
        )}
        {screen !== 'home' && !(['school','player','coach','referee','admin'] as any).includes(screen) && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RolePicker value={role} onChange={setRole} />
            <button data-testid="btn-home" onClick={() => navigate('home', { reset: true })} className="rounded-md border bg-white p-2">Home</button>
            <button data-testid="btn-dashboard" onClick={() => navigate('dashboard')} className="rounded-md border bg-white p-2">Dashboard</button>
            <button data-testid="btn-login" onClick={() => navigate('login')} className="rounded-md border bg-white p-2">Login</button>
            {(role === 'SchoolAdmin' || role === 'EPHSRUAdmin') && (
              <button data-testid="btn-approvals" onClick={() => navigate('approvals')} className="rounded-md border bg-white p-2">Approvals</button>
            )}
            {(role === 'ZoneCoordinator' || role === 'EPHSRUAdmin') && (
              <button data-testid="btn-reports" onClick={() => navigate('reports')} className="rounded-md border bg-white p-2">Reports</button>
            )}
          </div>
        )}
        {screen === 'home' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Screen title="Sign In">
              <Login onRole={setRole} onSuccess={() => navigate('dashboard')} />
            </Screen>
            <Screen title="Register">
              <Selection onChoose={(k) => navigate(k as ScreenKey)} role={role} restrictByRole={false} />
            </Screen>
          </div>
        )}
        {screen === 'school' && <Screen title="School Registration"><SchoolForm role={role} /></Screen>}
        {screen === 'player' && <Screen title="Player Registration"><PlayerForm role={role} onGoLogin={() => navigate('login')} onGoDashboard={() => navigate('dashboard')} /></Screen>}
        {screen === 'coach' && <Screen title="Coach Registration"><CoachForm role={role} onGoLogin={() => navigate('login')} onGoDashboard={() => navigate('dashboard')} /></Screen>}
        {screen === 'referee' && <Screen title="Referee Registration"><RefereeForm role={role} /></Screen>}
        {screen === 'admin' && <Screen title="Admin Registration"><AdminForm role={role} /></Screen>}
        {screen === 'login' && <Screen title="Sign In"><Login onRole={setRole} onSuccess={() => navigate('dashboard')} /></Screen>}
        {screen === 'approvals' && <Screen title="Approvals"><Approvals /></Screen>}
        {screen === 'reports' && <Screen title="Reports"><Reports /></Screen>}
        {screen === 'dashboard' && <Screen title="Dashboard"><Dashboard role={role} /></Screen>}
        <RoleGate role={role} allow={['EPHSRUAdmin']}>
          <div className="mt-6">
            <AuditLogs />
          </div>
        </RoleGate>
      </main>
      <footer className="bg-white p-4 text-center text-xs text-gray-500">© 2025 EPHSRU</footer>
    </div>
  )
}

function Screen({ title, children }: { title: string; children: any }) {
  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">{title}</h1>
      <div className="rounded-lg border bg-white p-4 shadow">{children}</div>
    </section>
  )
}

function canAccess(screen: string, role: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin') {
  const map: Record<string, string[]> = {
    school: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    player: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    coach: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    referee: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    admin: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    approvals: ['SchoolAdmin','EPHSRUAdmin'],
    reports: ['ZoneCoordinator','EPHSRUAdmin'],
    dashboard: ['Player','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    login: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    home: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
  }
  const allowed = map[screen] || []
  return allowed.includes(role)
}
