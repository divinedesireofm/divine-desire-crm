import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import Icon from './Icon'
import AnnouncementGate from './AnnouncementGate'
import MasivoGate from './MasivoGate'
import PildoraGate from './PildoraGate'
import ShiftTimer from './ShiftTimer'
import { useReportePendiente } from '../lib/reportePendiente'
import { BloqueoReporte, BannerReporte } from './ReporteObligatorio'
import NotificationBell from './NotificationBell'
import NotificationPopup from './NotificationPopup'
import { NotificationsProvider } from '../context/NotificationsContext'
import ThemeToggle from './ThemeToggle'
import { SECTIONS, buscarItem, aplicarOrden } from '../lib/navigation'
import { supabase } from '../lib/supabase'
import { Panel } from './ui'

const ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Manager de Chatting',
  chatter: 'Chatter',
  ig_manager: 'Manager de Instagram',
  ig_assistant: 'Asistente de Instagram',
  reddit_manager: 'Manager de Reddit',
  reddit_assistant: 'Asistente de Reddit',
  planner: 'Planner',
  masivos: 'Equipo de Masivos',
  modelo: 'Modelo',
}

// La sección "de casa" de cada rol no se puede plegar, para que siempre esté a la vista.
// Si tiene varios roles, se le fijan todas las secciones de casa que correspondan.
const SECCION_FIJA_POR_ROL = {
  manager: 'chatting',
  chatter: 'chatting',
  ig_manager: 'instagram',
  ig_assistant: 'instagram',
  reddit_manager: 'reddit',
  reddit_assistant: 'reddit',
  planner: 'instagram',
  masivos: 'chatting',
}

// Color de iconos y nombres por departamento. Chatting no tiene (se queda con el dorado y el texto de siempre).
const TONO_SECCION = {
  instagram: 'var(--menu-ig)',
  reddit: 'var(--menu-reddit)',
  general: 'var(--menu-admin)',
  gestion: 'var(--menu-admin)',
  recursos: 'var(--menu-admin)',
}

export default function Layout() {
  const { profile, roles, puedeVer, signOut, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const soloModeloCuenta = roles.length > 0 && roles.every((r) => r === 'modelo')
  const soloPlannerCuenta = roles.length > 0 && roles.every((r) => r === 'planner')
  const soloMasivosCuenta = roles.length > 0 && roles.every((r) => r === 'masivos')
  const cuentaAcotada = soloModeloCuenta || soloPlannerCuenta || soloMasivosCuenta   // cuentas que solo ven lo suyo (sin Panel general)
  const [collapsed, setCollapsed] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [ordenCfg, setOrdenCfg] = useState(null)      // orden del menú guardado por el admin
  const [editandoMenu, setEditandoMenu] = useState(false)
  const [errMenu, setErrMenu] = useState('')
  const [arrastre, setArrastre] = useState(null)   // { tipo: 'item'|'seccion', si, ii } lo que se está arrastrando
  const [destino, setDestino] = useState(null)     // { tipo, si, ii } dónde caería
  const mainRef = useRef(null)
  const navRef = useRef(null)
  const location = useLocation()
  const { pendiente: reportePend, marcarEnviado } = useReportePendiente()
  const enReportes = location.pathname.startsWith('/reportes-turno')

  // Mientras el reporte esté pendiente, el navegador pide confirmación antes de cerrar o recargar la pestaña
  useEffect(() => {
    if (!reportePend) return undefined
    const aviso = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [reportePend])

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let vivo = true
    supabase.from('menu_orden').select('valor').eq('clave', 'menu').maybeSingle().then(({ data }) => { if (vivo && data?.valor) setOrdenCfg(data.valor) })
    return () => { vivo = false }
  }, [])

  const visibleSections = aplicarOrden(SECTIONS, ordenCfg)
    .map((s) => ({ ...s, items: s.items.filter((item) => (!item.soloModelo || soloModeloCuenta) && (!item.soloCuenta || cuentaAcotada) && (!item.soloRoles || item.soloRoles.some((r) => roles.includes(r))) && !(cuentaAcotada && item.to === '/') && puedeVer(item.to, item.roles)) }))
    .filter((s) => s.items.length > 0)

  // ---- Ordenar el menú (solo admin): se guarda para todo el equipo ----
  async function guardarOrden(estructura) {
    const cfg = { sections: estructura.map((s) => s.id), items: Object.fromEntries(estructura.map((s) => [s.id, s.items.map((i) => i.to)])) }
    setOrdenCfg(cfg); setErrMenu('')
    const { error } = await supabase.from('menu_orden').upsert({ clave: 'menu', valor: cfg, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
    if (error) setErrMenu('No se pudo guardar el orden. ¿Has ejecutado la migración 52b?')
  }
  async function restablecerOrden() {
    if (!confirm('¿Volver al orden original del menú?')) return
    setOrdenCfg(null); setErrMenu('')
    await supabase.from('menu_orden').delete().eq('clave', 'menu')
  }
  const copia = () => visibleSections.map((s) => ({ ...s, items: [...s.items] }))
  // Arrastrar y soltar con el ratón (sin flechas)
  function soltar() {
    if (!arrastre || !destino) { setArrastre(null); setDestino(null); return }
    const e = copia()
    if (arrastre.tipo === 'seccion' && destino.tipo === 'seccion') {
      const [sec] = e.splice(arrastre.si, 1)
      let at = destino.si; if (arrastre.si < destino.si) at -= 1
      e.splice(Math.max(0, at), 0, sec); guardarOrden(e)
    } else if (arrastre.tipo === 'item' && destino.tipo === 'item') {
      const [it] = e[arrastre.si].items.splice(arrastre.ii, 1)
      let at = destino.ii; if (arrastre.si === destino.si && arrastre.ii < destino.ii) at -= 1
      e[destino.si].items.splice(Math.max(0, at), 0, it); guardarOrden(e)
    }
    setArrastre(null); setDestino(null)
  }
  const mitad = (ev) => { const r = ev.currentTarget.getBoundingClientRect(); return ev.clientY > r.top + r.height / 2 ? 1 : 0 }

  const itemActual = buscarItem(location.pathname)
  const sinAcceso = itemActual && (!puedeVer(itemActual.to, itemActual.roles) || (itemActual.soloRoles && !itemActual.soloRoles.some((r) => roles.includes(r)) && !esAdmin))

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

        <nav
          ref={navRef}
          className="flex-1 space-y-4 overflow-y-auto"
          onDragOverCapture={(ev) => {
            // al arrastrar cerca del borde de arriba o abajo, el menú se desplaza solo
            if (!arrastre || !navRef.current) return
            const r = navRef.current.getBoundingClientRect()
            if (ev.clientY < r.top + 50) navRef.current.scrollTop -= 14
            else if (ev.clientY > r.bottom - 50) navRef.current.scrollTop += 14
          }}
        >
          {visibleSections.map((section, si) => {
            const fija = seccionesFijas.has(section.id)
            const tono = TONO_SECCION[section.id]
            const abierta = editandoMenu || fija || !collapsed[section.id]
            return (
              <div key={section.id}>
                {editandoMenu && (
                  <div
                    draggable
                    onDragStart={(ev) => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', section.id); setArrastre({ tipo: 'seccion', si }) }}
                    onDragEnd={() => { setArrastre(null); setDestino(null) }}
                    onDragOver={(ev) => {
                      if (!arrastre) return
                      ev.preventDefault()
                      if (arrastre.tipo === 'seccion') setDestino({ tipo: 'seccion', si: si + mitad(ev) })
                      else setDestino({ tipo: 'item', si, ii: 0 })
                    }}
                    onDrop={(ev) => { ev.preventDefault(); soltar() }}
                    className="flex items-center gap-2 px-2 py-1 mb-1 rounded cursor-grab active:cursor-grabbing select-none"
                    style={{ background: 'var(--accent-soft)',
                      boxShadow: destino?.tipo === 'seccion' && destino.si === si ? '0 -2px 0 var(--accent)' : destino?.tipo === 'seccion' && destino.si === si + 1 && si === visibleSections.length - 1 ? '0 2px 0 var(--accent)' : 'none',
                      opacity: arrastre?.tipo === 'seccion' && arrastre.si === si ? 0.4 : 1 }}
                    title="Arrastra para mover la categoría entera"
                  >
                    <span style={{ color: 'var(--accent)' }}>⠿</span>
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{section.label || 'Principal'}</span>
                  </div>
                )}
                {!editandoMenu && section.label && (
                  fija ? (
                    <p className="px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: tono || 'var(--text-muted)' }}>
                      <Icon name={section.icon} size={13} color={tono} />
                      {section.label}
                    </p>
                  ) : (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                      className="w-full flex items-center justify-between px-2 py-1 mb-1 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: tono || 'var(--text-muted)' }}
                    >
                      <span className="flex items-center gap-1.5"><Icon name={section.icon} size={13} color={tono} />{section.label}</span>
                      <span style={{ fontSize: 10 }}>{collapsed[section.id] ? '▸' : '▾'}</span>
                    </button>
                  )
                )}
                {abierta && (
                  <div className="space-y-1 animate-in">
                    {editandoMenu && section.items.map((item, ii) => (
                      <div
                        key={item.to}
                        draggable
                        onDragStart={(ev) => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', item.to); setArrastre({ tipo: 'item', si, ii }) }}
                        onDragEnd={() => { setArrastre(null); setDestino(null) }}
                        onDragOver={(ev) => { if (arrastre?.tipo !== 'item') return; ev.preventDefault(); ev.stopPropagation(); setDestino({ tipo: 'item', si, ii: ii + mitad(ev) }) }}
                        onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); soltar() }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-grab active:cursor-grabbing select-none"
                        style={{ background: 'var(--panel)', opacity: arrastre?.tipo === 'item' && arrastre.si === si && arrastre.ii === ii ? 0.4 : 1,
                          boxShadow: destino?.tipo === 'item' && destino.si === si && destino.ii === ii ? '0 -2px 0 var(--accent)' : destino?.tipo === 'item' && destino.si === si && destino.ii === ii + 1 && ii === section.items.length - 1 ? '0 2px 0 var(--accent)' : 'none' }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>⠿</span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </div>
                    ))}
                    {editandoMenu && section.items.length === 0 && (
                      <div onDragOver={(ev) => { if (arrastre?.tipo === 'item') { ev.preventDefault(); setDestino({ tipo: 'item', si, ii: 0 }) } }} onDrop={(ev) => { ev.preventDefault(); soltar() }}
                        className="px-2 py-2 text-xs rounded-md" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>Suelta aquí un apartado</div>
                    )}
                    {!editandoMenu && section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                        style={({ isActive }) => ({
                          background: isActive ? (tono ? `color-mix(in srgb, ${tono} 16%, transparent)` : 'var(--accent-soft)') : 'transparent',
                          color: tono || (isActive ? 'var(--accent)' : 'var(--text)'),
                          fontWeight: isActive ? 600 : 400,
                        })}
                      >
                        <Icon name={item.icon} color={tono} />
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
          {esAdmin && (
            <div className="px-2 mb-3">
              <button onClick={() => setEditandoMenu(!editandoMenu)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                {editandoMenu ? '✓ Terminar de ordenar' : '↕ Ordenar menú'}
              </button>
              {editandoMenu && ordenCfg && <button onClick={restablecerOrden} className="text-xs hover:underline ml-3" style={{ color: 'var(--text-muted)' }}>Restablecer</button>}
              {editandoMenu && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Arrastra con el ratón los apartados (o categorías enteras) hasta donde quieras, incluso a otra categoría. Lo ve todo el equipo.</p>}
              {errMenu && <p className="text-[10px] mt-1" style={{ color: 'var(--danger)' }}>{errMenu}</p>}
            </div>
          )}
          <div className="flex items-center gap-2 px-2 mb-3">
            {profile?.foto_url
              ? <img src={profile.foto_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
              : <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 }}>{(profile?.full_name || '?').trim().charAt(0).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{etiquetaRoles}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={!!reportePend}
            title={reportePend ? 'Envía primero el reporte de tu turno' : undefined}
            className="px-2 text-xs hover:underline"
            style={{ color: 'var(--text-muted)', opacity: reportePend ? 0.45 : 1, cursor: reportePend ? 'not-allowed' : undefined }}
          >
            {reportePend ? 'Cerrar sesión (envía antes tu reporte)' : 'Cerrar sesión'}
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
            {reportePend && !enReportes ? (
              <BloqueoReporte marcarEnviado={marcarEnviado} />
            ) : sinAcceso ? (
              <Panel className="p-6">
                <p className="font-medium mb-1">No tienes acceso a este apartado</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Si lo necesitas, pídeselo al administrador.</p>
              </Panel>
            ) : <>{reportePend && <BannerReporte marcarEnviado={marcarEnviado} />}<Outlet /></>}
          </PildoraGate>
        </AnnouncementGate>
      </main>
      </div>
      <NotificationPopup />
      <MasivoGate />
    </div>
    </NotificationsProvider>
  )
}
