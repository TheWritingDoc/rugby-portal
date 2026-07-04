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
import { RoleGate } from './components/RoleGate'
import Login from './pages/Login'
import Approvals from './pages/Approvals'
import Reports from './pages/Reports'
import AuditLogs from './pages/AuditLogs'
import { trackUserAction, trackPerformance, metrics } from './utils/metrics'
import Toaster from './components/Toaster'
import { notifyWarning } from './utils/notify'

type FormKey = 'school' | 'player' | 'coach' | 'referee' | 'admin'
type ScreenKey = FormKey | 'home' | 'dashboard' | 'login' | 'approvals' | 'reports' | 'create-user'

const ROLE_LABELS: Record<string, string> = {
  Player: 'Player',
  Referee: 'Referee',
  Coach: 'Coach',
  SchoolAdmin: 'School Admin',
  ZoneCoordinator: 'Zone Coordinator',
  EPHSRUAdmin: 'EPHSRU Admin',
}

export default function App() {
  const [role, setRole] = useState<'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'>(() => {
    try {
      const r = localStorage.getItem('auth:role') as any
      if (r && ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'].includes(r)) return r
    } catch {}
    return 'Player'
  })
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
      notifyWarning('You are not authorized to open that section')
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
      let prev = s[s.length - 1]
      if (!prev) return s
      const activeRole = roleRef.current
      if (!canAccess(prev, activeRole)) return s.slice(0, -1)
      // While signed in, "Back" must never land on the sign-in screens —
      // that reads as an accidental logout. Route those to the dashboard.
      const signedIn = Boolean(localStorage.getItem('auth:token'))
      if (signedIn && (prev === 'home' || prev === 'login')) prev = 'dashboard'
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
      const signedIn = Boolean(localStorage.getItem('auth:token'))
      if (target === 'dashboard' && signedIn) {
        // Signed-in root: empty stack, so the app-level Back stays hidden
        setNavStack([])
        setScreen('dashboard')
      } else if (target && !signedIn) {
        localStorage.removeItem('nav:target')
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
  const [token, setToken] = useState(() => localStorage.getItem('auth:token'))
  useEffect(() => {
    const checkToken = () => setToken(localStorage.getItem('auth:token'))
    checkToken()
    window.addEventListener('storage', checkToken)
    const interval = setInterval(checkToken, 1000)
    return () => { window.removeEventListener('storage', checkToken); clearInterval(interval) }
  }, [])
  const isLoggedIn = !!token
  const showHeader = !isLoggedIn
  return (
    <div className="flex h-full flex-col">
      {showHeader && <Header />}
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button data-testid="btn-back" onClick={goBack} className="flex items-center gap-1 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            )}
            {isLoggedIn && (
              <span data-testid="role-badge" className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand ring-1 ring-brand/30">
                {ROLE_LABELS[role] || role}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn && (role === 'EPHSRUAdmin' || role === 'ZoneCoordinator' || role === 'SchoolAdmin' || role === 'Coach') && (
              <button
                data-testid="btn-create-user"
                onClick={() => navigate('create-user')}
                className="flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                Create User
              </button>
            )}
            {isLoggedIn && (
            <button
              data-testid="btn-logout"
              onClick={() => {
                // Clear the whole session INCLUDING nav:target — otherwise the
                // reload boots straight back into an empty dashboard.
                for (const k of ['auth:token', 'auth:role', 'auth:email', 'auth:zoneId', 'auth:schoolId', 'auth:name', 'auth:surname', 'nav:target', 'reg:email', 'reg:password', 'reg:adminRole', 'reg:form']) {
                  try { localStorage.removeItem(k) } catch {}
                }
                setRole('Player')
                window.location.replace('/')
              }}
              className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              Logout
            </button>
            )}
          </div>
        </div>
        {screen === 'home' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Screen title="Sign In" subtitle="Already registered? Sign in to your dashboard.">
              {/* reset: the dashboard is the signed-in root — no "Back" to the sign-in page */}
              <Login onRole={setRole} onSuccess={() => navigate('dashboard', { reset: true })} />
            </Screen>
            <Screen title="Request Access" subtitle="Need an account? Contact your administrator.">
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  User creation is managed by administrators. Contact the appropriate person based on your role:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li><strong>Players:</strong> Contact your coach</li>
                  <li><strong>Coaches/Referees:</strong> Contact your school admin</li>
                  <li><strong>School Admins:</strong> Contact your zone coordinator</li>
                  <li><strong>Zone Coordinators:</strong> Contact EPHSRU admin</li>
                </ul>
                <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                  <strong>Already have credentials?</strong> Use the Sign In form on the left.
                </div>
              </div>
            </Screen>
          </div>
        )}
        {screen === 'school' && <Screen title="School Registration"><SchoolForm role={role} /></Screen>}
        {screen === 'player' && <Screen title="Player Registration"><PlayerForm role={role} onGoLogin={() => navigate('login')} onGoDashboard={() => navigate('dashboard')} /></Screen>}
        {screen === 'coach' && <Screen title="Coach Registration"><CoachForm role={role} onGoLogin={() => navigate('login')} onGoDashboard={() => navigate('dashboard')} /></Screen>}
        {screen === 'referee' && <Screen title="Referee Registration"><RefereeForm role={role} /></Screen>}
        {screen === 'admin' && <Screen title="Admin Registration"><AdminForm role={role} /></Screen>}
        {screen === 'login' && <Screen title="Sign In"><Login onRole={setRole} onSuccess={() => navigate('dashboard', { reset: true })} /></Screen>}
        {screen === 'approvals' && <Screen title="Approvals"><Approvals /></Screen>}
        {screen === 'reports' && <Screen title="Reports"><Reports /></Screen>}
        {screen === 'dashboard' && <Screen title="Dashboard"><Dashboard role={role} /></Screen>}
        {screen === 'create-user' && (
          <Screen title="Create User" subtitle="Create a new user account below.">
            <Selection onChoose={(k) => navigate(k as ScreenKey)} role={role} restrictByRole={true} />
          </Screen>
        )}
        <RoleGate role={role} allow={['EPHSRUAdmin']}>
          <div className="mt-6">
            <AuditLogs />
          </div>
        </RoleGate>
      </main>
      <footer className="bg-white p-4 text-center text-xs text-gray-500">© 2025 EPHSRU</footer>
      <Toaster />
    </div>
  )
}

function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <section>
      <h1 className={subtitle ? 'mb-0.5 text-xl font-bold' : 'mb-3 text-xl font-bold'}>{title}</h1>
      {subtitle && <p className="mb-3 text-sm text-gray-500">{subtitle}</p>}
      <div className="rounded-lg border bg-white p-4 shadow">{children}</div>
    </section>
  )
}

function canAccess(screen: string, role: 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin') {
  const map: Record<string, string[]> = {
    // Registration forms - only accessible through create-user screen
    school: ['EPHSRUAdmin', 'ZoneCoordinator', 'SchoolAdmin', 'Coach'],
    player: ['Coach', 'SchoolAdmin'],
    coach: ['SchoolAdmin'],
    referee: ['SchoolAdmin'],
    admin: ['ZoneCoordinator', 'EPHSRUAdmin'],
    // Screens
    approvals: ['SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    reports: ['ZoneCoordinator','EPHSRUAdmin'],
    dashboard: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    login: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    home: ['Player','Referee','Coach','SchoolAdmin','ZoneCoordinator','EPHSRUAdmin'],
    'create-user': ['EPHSRUAdmin', 'ZoneCoordinator', 'SchoolAdmin', 'Coach'],
  }
  const allowed = map[screen] || []
  return allowed.includes(role)
}
