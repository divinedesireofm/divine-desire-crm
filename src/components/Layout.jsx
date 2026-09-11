import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import Icon from './Icon'

const SECTIONS = [
  {
    id: 'general',
    label: null, // sin cabecera, siempre visible arriba del todo
    items: [
      { to: '/', label: 'Panel general', icon: 'home', roles: ['admin', 'manager', 'chatter', 'ig_assistant'], end: true },
    ],
  },
  {
    id: 'chatting',
    label: 'Chatting',
    icon: 'chat',
    items: [
      { to: '/asistencia', label: 'Entradas y salidas', icon: 'clock', roles: ['admin', 'manager', 'chatter'] },
      { to: '/reportes-turno', label: 'Reportes de turno', icon: 'file', roles: ['admin', 'manager', 'chatter'] },
      { to: '/chatters', label: 'Chatters', icon: 'users', roles: ['admin', 'manager'] },
      { to: '/horarios', label: 'Horarios', icon: 'calendar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/pagos', label: 'Pagos', icon: 'dollar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/sanciones', label: 'Sanciones', icon: 'alert', roles: ['admin', 'manager'] },
      { to: '/packs', label: 'Packs', icon: 'package', roles: ['admin', 'manager', 'chatter'] },
      { to: '/scripts', label: 'Scripts', icon: 'chat', roles: ['admin', 'manager', 'chatter'] },
      { to: '/activacion', label: 'Activación', icon: 'zap', roles: ['admin', 'manager', 'chatter'] },
      { to: '/precios', label: 'Precios', icon: 'tag', roles: ['admin', 'manager', 'chatter'] },
      { to: '/equipo', label: 'Equipo', icon: 'users', roles: ['admin', 'manager'] },
      { to: '/historial', label: 'Historial', icon: 'clock', roles: ['admin', 'manager'] },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'camera',
    items: [
      { to: '/instagram', label: 'Cuentas de Instagram', icon: 'camera', roles: ['admin', 'ig_assistant'] },
      { to: '/leads', label: 'Reclutamiento', icon: 'target', roles: ['admin'] },
    ],
  },
  {
    id: 'recursos',
    label: 'Recursos compartidos',
    icon: 'file',
    items: [
      { to: '/modelos', label: 'Modelos', icon: 'diamond', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
      { to: '/metricas', label: 'Métricas semanales', icon: 'chart', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
    ],
  },
]

const ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Manager',
  chatter: 'Chatter',
  ig_assistant: 'Asistente de Instagram',
}

// La sección "de casa" de cada rol no se puede plegar, para que siempre esté a la vista
const SIEMPRE_ABIERTA = {
  admin: [],
  manager: ['chatting'],
  chatter: ['chatting'],
  ig_assistant: ['instagram'],
}

export default function Layout() {
  const { profile, role, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState({})

  const visibleSections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((item) => item.roles.includes(role)) }))
    .filter((s) => s.items.length > 0)

  return (
    <div className="min-h-screen flex">
      <aside
        className="w-64 shrink-0 flex flex-col p-4"
        style={{ background: 'var(--panel-alt)', borderRight: '1px solid var(--border)' }}
      >
        <div className="mb-8 px-2 text-center">
          <img src={logo} alt="Divine Desire" className="h-28 object-contain mx-auto mb-2" />
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Disciplina · Dedicación · Distinción</p>
          <div className="h-px w-full mt-4" style={{ background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto">
          {visibleSections.map((section) => {
            const fija = SIEMPRE_ABIERTA[role]?.includes(section.id)
            const abierta = fija || !collapsed[section.id]
            return (
              <div key={section.id}>
                {section.label && (
                  fija ? (
                    <p className="px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <Icon name={section.icon} size={13} />
                      {section.label}
                    </p>
                  ) : (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                      className="w-full flex items-center justify-between px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="flex items-center gap-1.5"><Icon name={section.icon} size={13} />{section.label}</span>
                      <span style={{ fontSize: 10 }}>{collapsed[section.id] ? '▸' : '▾'}</span>
                    </button>
                  )
                )}
                {abierta && (
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                        style={({ isActive }) => ({
                          background: isActive ? 'var(--accent-soft)' : 'transparent',
                          color: isActive ? 'var(--accent)' : 'var(--text)',
                          fontWeight: isActive ? 500 : 400,
                        })}
                      >
                        <Icon name={item.icon} />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
