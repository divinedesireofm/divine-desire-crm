import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const SECTIONS = [
  {
    id: 'general',
    label: null, // sin cabecera, siempre visible arriba del todo
    items: [
      { to: '/', label: '🏠 Panel general', roles: ['admin', 'manager', 'chatter', 'ig_assistant'], end: true },
    ],
  },
  {
    id: 'chatting',
    label: '💬 Chatting',
    items: [
      { to: '/asistencia', label: '🕐 Entradas y salidas', roles: ['admin', 'manager', 'chatter'] },
      { to: '/reportes-turno', label: '📋 Reportes de turno', roles: ['admin', 'manager', 'chatter'] },
      { to: '/chatters', label: '👥 Chatters', roles: ['admin', 'manager'] },
      { to: '/horarios', label: '📅 Horarios', roles: ['admin', 'manager', 'chatter'] },
      { to: '/pagos', label: '💰 Pagos', roles: ['admin', 'manager', 'chatter'] },
      { to: '/sanciones', label: '⚠️ Sanciones', roles: ['admin', 'manager'] },
      { to: '/packs', label: '🎁 Packs', roles: ['admin', 'manager', 'chatter'] },
      { to: '/scripts', label: '💭 Scripts', roles: ['admin', 'manager', 'chatter'] },
      { to: '/activacion', label: '⚡ Activación', roles: ['admin', 'manager', 'chatter'] },
      { to: '/precios', label: '🏷️ Precios', roles: ['admin', 'manager', 'chatter'] },
    ],
  },
  {
    id: 'instagram',
    label: '📸 Instagram',
    items: [
      { to: '/instagram', label: '📱 Cuentas de Instagram', roles: ['admin', 'ig_assistant'] },
      { to: '/leads', label: '🎯 Reclutamiento', roles: ['admin'] },
    ],
  },
  {
    id: 'recursos',
    label: '📁 Recursos compartidos',
    items: [
      { to: '/modelos', label: '💎 Modelos', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
      { to: '/metricas', label: '📊 Métricas semanales', roles: ['admin', 'manager', 'chatter', 'ig_assistant'] },
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
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>CRM interno</p>
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
                    <p className="px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      {section.label}
                    </p>
                  ) : (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                      className="w-full flex items-center justify-between px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>{section.label}</span>
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
                        className="block px-3 py-2 rounded-md text-sm transition-colors"
                        style={({ isActive }) => ({
                          background: isActive ? 'var(--accent-soft)' : 'transparent',
                          color: isActive ? 'var(--accent)' : 'var(--text)',
                          fontWeight: isActive ? 500 : 400,
                        })}
                      >
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
