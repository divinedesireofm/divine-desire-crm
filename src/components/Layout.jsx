import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const NAV_ITEMS = [
  { to: '/', label: 'Panel general', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
  { to: '/asistencia', label: 'Entradas y salidas', roles: ['admin', 'manager', 'chatter'] },
  { to: '/reportes-turno', label: 'Reportes de turno', roles: ['admin', 'manager', 'chatter'] },
  { to: '/modelos', label: 'Modelos', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
  { to: '/metricas', label: 'Métricas semanales', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
  { to: '/chatters', label: 'Chatters', roles: ['admin', 'manager'] },
  { to: '/horarios', label: 'Horarios', roles: ['admin', 'manager', 'chatter'] },
  { to: '/pagos', label: 'Pagos', roles: ['admin', 'manager', 'chatter'] },
  { to: '/sanciones', label: 'Sanciones', roles: ['admin', 'manager'] },
  { to: '/instagram', label: 'Cuentas de Instagram', roles: ['admin', 'ig_assistant'] },
  { to: '/leads', label: 'Reclutamiento', roles: ['admin'] },
]

const ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Manager',
  chatter: 'Chatter',
  ig_assistant: 'Asistente de Instagram',
}

export default function Layout() {
  const { profile, role, signOut } = useAuth()
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <div className="min-h-screen flex">
      <aside
        className="w-60 shrink-0 flex flex-col p-4"
        style={{ background: 'var(--panel-alt)', borderRight: '1px solid var(--border)' }}
      >
        <div className="mb-8 px-2">
          <img src={logo} alt="Divine Desire" className="h-10 object-contain mb-1" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>CRM interno</p>
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'font-medium' : ''}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text)',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="px-2 text-sm font-medium">{profile?.full_name}</p>
          <p className="px-2 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            {ROLE_LABELS[role] || role}
          </p>
          <button
            onClick={signOut}
            className="px-2 text-xs hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
