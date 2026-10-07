import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import Icon from './Icon'
import AnnouncementGate from './AnnouncementGate'
import PildoraGate from './PildoraGate'
import ShiftTimer from './ShiftTimer'
import NotificationBell from './NotificationBell'
import NotificationPopup from './NotificationPopup'
import { NotificationsProvider } from '../context/NotificationsContext'
import ThemeToggle from './ThemeToggle'
import { SECTIONS, buscarItem } from '../lib/navigation'
import { Panel } from './ui'

const ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Manager de Chatting',
  chatter: 'Chatter',
  ig_manager: 'Manager de Instagram',
  ig_assistant: 'Asistente de Instagram',
  modelo: 'Modelo',
}

// La sección "de casa" de cada rol no se puede plegar, para que siempre esté a la vista.
// Si tiene varios roles, se le fijan todas las secciones de casa que correspondan.
const SECCION_FIJA_POR_ROL = {
  manager: 'chatting',
  chatter: 'chatting',
  ig_manager: 'instagram',
  ig_assistant: 'instagram',
}

export default function Layout() {
  const { profile, roles, puedeVer, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const mainRef = useRef(null)
  const location = useLocation()

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    setMobileOpen(false)
  }, [location.pathname])

  const visibleSections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((item) => puedeVer(item.to, item.roles)) }))
    .filter((s) => s.items.length > 0)

  const itemActual = buscarItem(location.pathname)
  const sinAcceso = itemActual && !puedeVer(itemActual.to, itemActual.roles)

  const seccionesFijas = new Set(roles.map((r) => SECCION_FIJA_POR_ROL[r]).filter(Boolean))
  const etiquetaRoles = roles.map((r) => ROLE_LABELS[r] || r).join(' · ')

  return (
    <NotificationsProvider>
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Barra superior, solo en móvil: logo + botón de menú */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}
      >
        <img src={logo} alt="Divine Desire" className="h-9 object-contain" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className="p-1">
            <Icon name="menu" size={24} />
          </button>
        </div>
      </div>

      <ShiftTimer />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Fondo oscuro al abrir el menú en móvil */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-30"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={`fixed md:static inset-y-0 left-0 z-40 w-64 shrink-0 flex flex-col p-4 h-full md:h-auto overflow-hidden transform transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: 'var(--panel-alt)', borderRight: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden absolute top-3 right-3 p-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Icon name="x" size={20} />
          </button>

          <div className="mb-8 px-2 text-center">
            <img src={logo} alt="Divine Desire" className="h-28 object-contain mx-auto mb-2" />
            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Disciplina · Dedicación · Distinción</p>
            <div className="h-px w-full mt-4" style={{ background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
          </div>

        <nav className="flex-1 space-y-4 overflow-y-auto">
          {visibleSections.map((section) => {
            const fija = seccionesFijas.has(section.id)
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
                  <div className="space-y-1 animate-in">
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
            {etiquetaRoles}
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
      <main ref={mainRef} className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden relative">
        <div className="hidden md:flex items-center justify-end gap-2 mb-4">
          <ThemeToggle />
          <NotificationBell />
        </div>
        <AnnouncementGate>
          <PildoraGate>
            {sinAcceso ? (
              <Panel className="p-6">
                <p className="font-medium mb-1">No tienes acceso a este apartado</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Si lo necesitas, pídeselo al administrador.</p>
              </Panel>
            ) : <Outlet />}
          </PildoraGate>
        </AnnouncementGate>
      </main>
      </div>
      <NotificationPopup />
    </div>
    </NotificationsProvider>
  )
}
