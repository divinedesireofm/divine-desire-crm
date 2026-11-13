import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, Td, StatusBadge, PageHeader } from '../components/ui'
import CeldaCopia from '../components/CeldaCopia'
import ScrollSuperior from '../components/ScrollSuperior'
import Desplegable from '../components/Desplegable'
import ZeroAccounts from './ZeroAccounts'
import IGProfileMetrics from './IGProfileMetrics'
import TablaRegistros from '../components/TablaRegistros'
import ModalMotivo, { hoyLocal } from '../components/ModalMotivo'
import { SECCIONES, ORDEN_SECCIONES } from '../lib/cuentasIGSecciones'
import QrCelda from '../components/QrCelda'
import { PERMISO_IG_2FA, PERMISO_IG_HISTORIAL } from '../lib/navigation'
import { urlInstagram, usuarioIG } from '../lib/instagramLink'
import HistorialIG from '../components/HistorialIG'
import { moverFila, guardarOrden } from '../lib/ordenManual'

// Columnas: k = clave de orden, n = cabecera. Todo se ve completo salvo 2FA, Observaciones y Restricciones, que se abrevian (con «ver más») si son largas: `w` es su ancho máximo.
const COLS = [
  { k: 'cuenta', n: 'Cuenta actual' }, { k: 'modelo', n: 'Modelo' }, { k: 'estado', n: 'Estado' },
  { k: 'responsable', n: 'Responsable' }, { k: 'seguidores', n: 'Seguidores' }, { k: 'original', n: 'IG original' },
  { k: 'correo', n: 'Correo' }, { k: 'dosfa', n: '2FA', w: 200 }, { k: 'publico', n: 'Público' },
  { k: 'asignacion', n: 'Asignación' }, { k: 'dias', n: 'Días' }, { k: 'obs', n: 'Observaciones', w: 260 },
  { k: 'restr', n: 'Restricciones', w: 260 }, { k: 'acc', n: '' },
]
// Foto de perfil del propio Instagram (la última leída con ScrapeCreators); si no hay o no carga, la inicial de la cuenta
function FotoIG({ url, nombre, size = 36 }) {
  const [fallo, setFallo] = useState(false)
  const base = { width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0 }
  if (url && !fallo) return <img src={url} alt={nombre} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallo(true)} style={{ ...base, objectFit: 'cover', border: '1px solid var(--border)' }} />
  return <span aria-hidden="true" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>{(nombre || '?').charAt(0).toUpperCase()}</span>
}

const ORDENABLES = [{ k: 'manual', n: 'Orden manual (arrastrar)' }, ...COLS.filter((c) => c.k !== 'acc')]
const vacio = (v) => v === null || v === undefined || v === ''

const STATUS_OPTIONS = ['calentando', 'activa', 'en_pausa', 'en_revision', 'suspendida', 'baneada']

const EMPTY_FORM = {
  original_username: '',
  email: '',
  profile_link: '',
  username: '',
  model_id: '',
  target_audience: '',
  bio_link: '',
  status: 'calentando',
  assigned_to: '',
  two_fa_code: '',
  assigned_at: '',
  observations: '',
  restrictions: '',
}

function diasTranscurridos(fecha) {
  if (!fecha) return '—'
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  return dias >= 0 ? dias : '—'
}

export default function InstagramAccounts() {
  const { hasAnyRole, puedeVer } = useAuth()
  const ver2fa = puedeVer(PERMISO_IG_2FA, ['admin', 'ig_manager', 'ig_assistant'])
  const canEdit = hasAnyRole(['admin', 'ig_manager', 'ig_assistant'])
  const canDelete = hasAnyRole(['admin', 'ig_manager'])
  const canEditSecciones = canDelete
  const [params, setParams] = useSearchParams()
  // Eliminadas, Stock mails, Cuentas propias y Stock Instagram llevan credenciales: solo admin y manager de Instagram
  const verSecciones = hasAnyRole(['admin', 'ig_manager'])
  const tabParam = params.get('tab')
  const tab = tabParam === 'cero' ? 'cero' : tabParam === 'metricas' ? 'metricas' : (verSecciones && SECCIONES[tabParam]) ? tabParam : 'cuentas'
  const [accounts, setAccounts] = useState([])
  const [models, setModels] = useState([])
  const [assistants, setAssistants] = useState([])
  const [creadores, setCreadores] = useState([]) // opciones del campo «Creador» de Cuentas propias
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [seguidores, setSeguidores] = useState({}) // account_id -> última lectura de seguidores
  const [fotos, setFotos] = useState({}) // account_id -> foto de perfil de Instagram
  const [ordenK, setOrdenK] = useState('manual')   // por defecto: el orden manual que pones tú arrastrando
  const [ordenDir, setOrdenDir] = useState('asc')
  const [fModelo, setFModelo] = useState('todos')
  const [fEstado, setFEstado] = useState('todos')
  const [fResp, setFResp] = useState('todos')
  const [busca, setBusca] = useState('')
  const [arrastrando, setArrastrando] = useState(null)
  const [sobre, setSobre] = useState(null)
  const [bajaDe, setBajaDe] = useState(null)         // cuenta que se va a dar de baja (eliminada/suspendida)
  const [rehabDe, setRehabDe] = useState(null)        // fila de Eliminadas que se va a rehabilitar
  const [modalErr, setModalErr] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [versionElim, setVersionElim] = useState(0)
  const [cerrando, setCerrando] = useState(false)   // la ventana de edición se está plegando
  const panelRef = useRef(null)
  const [anchoVista, setAnchoVista] = useState(900)

  // Valor de cada columna para ordenar
  function valorDe(a, k) {
    switch (k) {
      case 'manual': return a.orden != null ? Number(a.orden) : null
      case 'cuenta': return (a.username || '').toLowerCase()
      case 'modelo': return a.models?.stage_name ? a.models.stage_name.toLowerCase() : null
      case 'estado': return STATUS_OPTIONS.indexOf(a.status)
      case 'responsable': return a.profiles?.full_name ? a.profiles.full_name.toLowerCase() : null
      case 'seguidores': return seguidores[a.id] != null ? Number(seguidores[a.id]) : null
      case 'original': return a.original_username ? a.original_username.toLowerCase() : null
      case 'correo': return a.email ? a.email.toLowerCase() : null
      case 'dosfa': return ver2fa ? (a.two_fa_code || null) : null
      case 'publico': return (a.target_audience || []).join(', ').toLowerCase() || null
      case 'asignacion': return a.assigned_at || null
      case 'dias': return a.assigned_at ? Number(diasTranscurridos(a.assigned_at)) : null
      case 'obs': return a.observations ? a.observations.toLowerCase() : null
      case 'restr': return a.restrictions ? a.restrictions.toLowerCase() : null
      default: return null
    }
  }
  const cmp = (x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true }))

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = accounts.filter((a) => {
      if (fModelo !== 'todos' && (fModelo === 'sin' ? a.model_id : a.model_id !== fModelo)) return false
      if (fEstado !== 'todos' && a.status !== fEstado) return false
      if (fResp !== 'todos' && (fResp === 'sin' ? a.assigned_to : a.assigned_to !== fResp)) return false
      if (q && ![a.username, a.original_username, a.email, a.models?.stage_name, a.profiles?.full_name, a.observations, a.restrictions].some((v) => String(v || '').toLowerCase().includes(q))) return false
      return true
    })
    if (ordenK === 'manual') return lista.sort((p, q2) => (Number(p.orden ?? 1e15) - Number(q2.orden ?? 1e15)) || cmp(valorDe(p, 'cuenta'), valorDe(q2, 'cuenta')))
    const dir = ordenDir === 'asc' ? 1 : -1
    return lista.sort((p, q2) => {
      const vp = valorDe(p, ordenK), vq = valorDe(q2, ordenK)
      // Lo que no tiene valor (sin modelo, sin responsable…) va siempre al final, ordenes como ordenes
      if (vacio(vp) !== vacio(vq)) return vacio(vp) ? 1 : -1
      if (!vacio(vp)) { const c = cmp(vp, vq); if (c) return c * dir }
      // Desempate: modelo y después nombre de cuenta
      const mp = valorDe(p, 'modelo'), mq = valorDe(q2, 'modelo')
      if (vacio(mp) !== vacio(mq)) return vacio(mp) ? 1 : -1
      if (!vacio(mp) && mp !== mq) return cmp(mp, mq)
      return cmp(valorDe(p, 'cuenta'), valorDe(q2, 'cuenta'))
    })
  }, [accounts, seguidores, ordenK, ordenDir, fModelo, fEstado, fResp, busca]) // eslint-disable-line
  const hayFiltros = fModelo !== 'todos' || fEstado !== 'todos' || fResp !== 'todos' || busca.trim() !== ''
  // Arrastrar filas: solo con el orden manual y sin filtros (así lo que ves es la lista completa)
  const puedeArrastrar = canDelete && ordenK === 'manual' && !busca.trim() && fModelo === 'todos' && fEstado === 'todos' && fResp === 'todos' && !editingId
  async function soltar(haciaId) {
    const desde = arrastrando
    setArrastrando(null); setSobre(null)
    if (!desde || desde === haciaId) return
    const { lista, cambios } = moverFila(visibles, desde, haciaId)
    if (!cambios.length) return
    setAccounts((prev) => prev.map((r) => lista.find((x) => x.id === r.id) ? { ...r, orden: lista.find((x) => x.id === r.id).orden } : r))
    const err = await guardarOrden('instagram_accounts', cambios)
    if (err) { setError('No se pudo guardar el orden: ' + err.message); load() }
  }
  function ordenarPor(k) { if (k === ordenK) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setOrdenK(k); setOrdenDir('asc') } }

  // «Creador» (Cuentas propias): asistentes y extrabajadores de Instagram. Las cuentas de las modelos van en «Cuentas de modelos».
  async function cargarCreadores(profs, mods) {
    const limpia = (n) => String(n || '').replace(/\s*\(extrabajador\)\s*$/i, '').trim()
    let ex = []
    try {
      const { data: ur } = await supabase.from('user_roles').select('user_id').in('role', ['ig_assistant', 'ig_manager'])
      const ids = Array.from(new Set((ur || []).map((r) => r.user_id)))
      if (ids.length) {
        const { data: pr, error: e2 } = await supabase.from('profiles').select('id, full_name, extrabajador').in('id', ids).eq('extrabajador', true)
        if (!e2) ex = (pr || []).map((x) => limpia(x.full_name)).filter(Boolean)
      }
    } catch { /* sin extrabajadores */ }
    const uniq = (a) => Array.from(new Set(a)).sort((x, y) => x.localeCompare(y, 'es'))
    setCreadores([
      { grupo: 'Asistentes de Instagram', items: uniq(profs.map((x) => limpia(x.full_name)).filter(Boolean)) },
      { grupo: 'Extrabajadores de Instagram', items: uniq(ex) },
    ])
  }

  async function load() {
    setLoading(true)
    const [{ data: acc }, { data: mods }, profs] = await Promise.all([
      supabase.from('instagram_accounts').select('*, models(stage_name), profiles(full_name)').eq('archivada', false).order('created_at', { ascending: false }),
      supabase.from('models').select('id, stage_name'),
      getProfilesByRoles(['ig_assistant']),
    ])
    setAccounts(acc || [])
    supabase.from('ig_profile_stats').select('account_id, followers, profile_pic_url, captured_at').order('captured_at', { ascending: false }).limit(2000).then(({ data: st }) => {
      const m = {}, ft = {}
      ;(st || []).forEach((r) => { if (!(r.account_id in m)) m[r.account_id] = r.followers; if (r.profile_pic_url && !(r.account_id in ft)) ft[r.account_id] = r.profile_pic_url })
      setSeguidores(m); setFotos(ft)
    })
    setModels(mods || [])
    setAssistants(profs)
    cargarCreadores(profs, mods || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  // Al volver al cuadro General se recargan los datos, así se ve lo que se haya cambiado en los otros apartados
  const primeraVez = useRef(true)
  useEffect(() => { if (primeraVez.current) { primeraVez.current = false; return } if (tab === 'cuentas') load() }, [tab]) // eslint-disable-line
  // La ventana de edición se ajusta al ancho visible de la tabla (aunque la tabla sea más ancha y tenga scroll)
  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const medir = () => setAnchoVista(Math.max(320, el.clientWidth - 2))
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [loading, tab])

  function startCreate() {
    setEditingId(null); setCerrando(false)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(a) {
    setShowForm(false); setCerrando(false)
    setEditingId(a.id)
    setForm({
      original_username: a.original_username || '',
      email: a.email || '',
      profile_link: a.profile_link || '',
      username: a.username || '',
      model_id: a.model_id || '',
      target_audience: (a.target_audience || []).join(', '),
      bio_link: a.bio_link || '',
      status: a.status || 'calentando',
      assigned_to: a.assigned_to || '',
      two_fa_code: a.two_fa_code || '',
      assigned_at: a.assigned_at || '',
      observations: a.observations || '',
      restrictions: a.restrictions || '',
    })
  }
  const cerrarEdicion = () => setCerrando(true)          // se pliega con animación y luego se quita
  const finEdicion = () => { setEditingId(null); setCerrando(false); setError(null) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = {
      original_username: form.original_username || null,
      email: form.email || null,
      profile_link: urlInstagram(form.username) || null,   // el enlace se crea solo a partir del usuario
      username: usuarioIG(form.username) || form.username,
      model_id: form.model_id || null,
      target_audience: form.target_audience
        ? form.target_audience.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      bio_link: form.bio_link || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
      two_fa_code: form.two_fa_code || null,
      assigned_at: form.assigned_at || null,
      observations: form.observations || null,
      restrictions: form.restrictions || null,
    }

    const { error } = editingId
      ? await supabase.from('instagram_accounts').update(payload).eq('id', editingId)
      : await supabase.from('instagram_accounts').insert([payload])

    if (error) {
      setError('No se pudo guardar. Comprueba que el usuario no esté ya registrado.')
      return
    }
    if (editingId) cerrarEdicion(); else { setShowForm(false); setForm(EMPTY_FORM) }
    load()
  }

  const fmt = (f) => String(f || '').split('-').reverse().join('/')

  // General → Eliminadas: la cuenta NO se borra (conserva planificaciones, reels y métricas), se guarda una ficha en Eliminadas y se oculta del General
  async function darDeBaja({ tipo, motivo, fecha }) {
    const a = bajaDe
    setTrabajando(true); setModalErr(null)
    const obs = [a.observations, a.restrictions ? `Restricciones: ${a.restrictions}` : null].filter(Boolean).join(' · ') || null
    const ficha = {
      cuenta_id: a.id, estado: tipo, motivo, fecha_eliminacion: fecha,
      instagram_nuevo: a.username, instagram_original: a.original_username || null, correo: a.email || null, link: urlInstagram(a.username) || null,
      modelo: a.models?.stage_name || null, idioma: (a.target_audience || []).join(', ') || null, link_bio: a.bio_link || null,
      asistente: a.profiles?.full_name || null, dos_fa: a.two_fa_code || null, fecha_asignacion: a.assigned_at || null, observaciones: obs,
    }
    const { data: ins, error: e1 } = await supabase.from('ig_eliminadas').insert([ficha]).select('id').single()
    if (e1) { setTrabajando(false); setModalErr('No se pudo guardar en Eliminadas: ' + e1.message); return }
    const { error: e2 } = await supabase.from('instagram_accounts').update({ archivada: true }).eq('id', a.id)
    if (e2) { await supabase.from('ig_eliminadas').delete().eq('id', ins.id); setTrabajando(false); setModalErr('No se pudo quitar del General: ' + e2.message); return }
    setTrabajando(false); setBajaDe(null)
    if (editingId === a.id) finEdicion()
    setVersionElim((v) => v + 1)
    load()
  }

  // Eliminadas → General (pidiendo el motivo). Si la ficha viene de una cuenta del CRM se reactiva esa misma; si viene del Excel se crea de nuevo en General.
  async function rehabilitar({ motivo, fecha }) {
    const f = rehabDe
    setTrabajando(true); setModalErr(null)
    const nota = `Eliminada/suspendida${f.fecha_eliminacion ? ' el ' + fmt(f.fecha_eliminacion) : ''}${f.motivo ? ': ' + f.motivo : ''} · Rehabilitada el ${fmt(fecha)}: ${motivo}`
    const sumar = (previo) => [previo, nota].filter(Boolean).join('\n')
    let ok = false
    if (f.cuenta_id) {
      const { data: cta } = await supabase.from('instagram_accounts').select('id, observations').eq('id', f.cuenta_id).maybeSingle()
      if (cta) {
        const { error: e } = await supabase.from('instagram_accounts').update({ archivada: false, status: 'activa', observations: sumar(cta.observations) }).eq('id', cta.id)
        if (e) { setTrabajando(false); setModalErr('No se pudo rehabilitar: ' + e.message); return }
        ok = true
      }
    }
    if (!ok) {
      const usuario = (f.instagram_nuevo || f.instagram_original || '').trim()
      if (!usuario) { setTrabajando(false); setModalErr('Esta ficha no tiene usuario de Instagram. Edítala y pon el «Instagram nuevo» antes de rehabilitarla.'); return }
      const mod = models.find((m) => String(m.stage_name || '').trim().toLowerCase() === String(f.modelo || '').trim().toLowerCase())
      const asis = assistants.find((x) => String(x.full_name || '').trim().toLowerCase() === String(f.asistente || '').trim().toLowerCase())
      const { error: e } = await supabase.from('instagram_accounts').insert([{
        username: usuario, original_username: f.instagram_original || null, email: f.correo || null, profile_link: urlInstagram(usuario) || null,
        model_id: mod?.id || null, assigned_to: asis?.id || null, target_audience: f.idioma ? f.idioma.split(',').map((x) => x.trim()).filter(Boolean) : null,
        bio_link: f.link_bio || null, status: 'activa', two_fa_code: f.dos_fa || null, assigned_at: f.fecha_asignacion || null,
        observations: sumar(f.observaciones), archivada: false,
      }])
      if (e) { setTrabajando(false); setModalErr(/duplicate|unique/i.test(e.message) ? `Ya existe en General una cuenta con el usuario «${usuario}». Cambia el «Instagram nuevo» de esta ficha o revisa la cuenta del General.` : 'No se pudo rehabilitar: ' + e.message); return }
    }
    await supabase.from('ig_eliminadas').delete().eq('id', f.id)
    setTrabajando(false); setRehabDe(null)
    setVersionElim((v) => v + 1)
    load()
  }

  // Cuentas propias → General: al asignar una modelo, la cuenta aparece en el cuadro General (o se actualiza si ya estaba)
  async function sincronizarPropia(f, esModelos = false) {
    if (!f.modelo_id) return null
    const est = String(f.estado || '').toUpperCase()
    if (est.startsWith('ELIMIN')) return { tipo: 'ok', texto: 'Guardada. No se añade al General porque está marcada como ELIMINADA.' }
    const usuario = usuarioIG(f.usuario)
    if (!usuario) return { tipo: 'error', texto: 'Para añadirla al General hace falta el usuario de Instagram.' }
    const mod = models.find((m) => m.id === f.modelo_id)
    const status = est.startsWith('ACTIV') ? 'activa' : est.startsWith('SUSP') || est.startsWith('BLOQ') ? 'suspendida' : est.startsWith('RESTR') ? 'en_revision' : est.includes('REPOSO') ? 'en_pausa' : 'activa'
    const creador = String(f.creador || '').trim().toLowerCase()
    const asis = esModelos ? null : assistants.find((x) => String(x.full_name || '').trim().toLowerCase() === creador)

    let cuenta = null
    if (f.cuenta_id) { const { data } = await supabase.from('instagram_accounts').select('*').eq('id', f.cuenta_id).maybeSingle(); cuenta = data }
    if (!cuenta) {
      const { data: cand } = await supabase.from('instagram_accounts').select('*').ilike('username', usuario)
      cuenta = (cand || []).find((c) => String(c.username).trim().toLowerCase() === usuario.toLowerCase()) || null
    }
    if (cuenta?.archivada) return { tipo: 'error', texto: `@${usuario} está dada de baja (en Eliminadas). Se guardó la cuenta propia, pero no se añadió al General: rehabilítala desde Eliminadas.` }

    let texto
    if (cuenta) {
      const cambios = { model_id: f.modelo_id }
      if (!cuenta.email && f.email) cambios.email = f.email
      if (!cuenta.profile_link) cambios.profile_link = urlInstagram(usuario)
      if (!cuenta.two_fa_code && f.dos_fa) cambios.two_fa_code = f.dos_fa
      if (!cuenta.assigned_at && f.fecha_creacion) cambios.assigned_at = f.fecha_creacion
      const { error } = await supabase.from('instagram_accounts').update(cambios).eq('id', cuenta.id)
      if (error) throw error
      texto = `@${usuario} ya estaba en el General: se ha asignado a ${mod?.stage_name || 'la modelo'}.`
    } else {
      const { data: nueva, error } = await supabase.from('instagram_accounts').insert([{
        username: usuario, model_id: f.modelo_id, status, email: f.email || null, profile_link: urlInstagram(usuario) || null, two_fa_code: f.dos_fa || null,
        assigned_at: f.fecha_creacion || null, assigned_to: asis?.id || null, archivada: false,
      }]).select('id').single()
      if (error) throw error
      cuenta = nueva
      texto = `@${usuario} se ha añadido al cuadro General con ${mod?.stage_name || 'la modelo'}.`
    }
    if (f.cuenta_id !== cuenta.id) await supabase.from('ig_cuentas_propias').update({ cuenta_id: cuenta.id }).eq('id', f.id)
    load()
    return { tipo: 'ok', texto }
  }

  async function borrarCuenta(a) {
    if (!confirm(`¿Eliminar la cuenta @${a.username}?\n\nSe borrarán también sus planificaciones, reels ganadores y registros de seguidores. No se puede deshacer.`)) return
    const { error: err } = await supabase.from('instagram_accounts').delete().eq('id', a.id)
    if (err) { setError('No se pudo eliminar: ' + err.message); return }
    if (editingId === a.id) finEdicion()
    load()
  }

  const pestanas = (
    <div className="flex flex-wrap gap-2 mb-5">
      {[['cuentas', 'General'], ...(verSecciones ? ORDEN_SECCIONES.map((id) => [id, SECCIONES[id].pestana]) : []), ['metricas', 'Métricas de perfil'], ['cero', 'Cuentas de cero']].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setParams(id === 'cuentas' ? {} : { tab: id })}
          className="px-3 py-1.5 rounded-full text-sm"
          style={{
            background: tab === id ? 'var(--accent-soft)' : 'var(--panel-alt)',
            border: `1px solid ${tab === id ? 'var(--accent)' : 'var(--border)'}`,
            color: tab === id ? 'var(--accent)' : 'var(--text)',
          }}
        >
          {label}
        </button>
      ))}
      {puedeVer(PERMISO_IG_HISTORIAL, ['admin', 'ig_manager']) && <HistorialIG onRestaurado={() => { setVersionElim((v) => v + 1); load() }} />}
    </div>
  )

  if (SECCIONES[tab]) {
    return (
      <div>
        <PageHeader title="Cuentas de Instagram" subtitle={SECCIONES[tab].subtitulo} />
        {pestanas}
        <TablaRegistros cfg={SECCIONES[tab]} canEdit={canEditSecciones} modelos={models.map((m) => m.stage_name).filter(Boolean)} personas={creadores} modelosLista={models} onGuardado={SECCIONES[tab].sincroniza ? (f) => sincronizarPropia(f, tab === 'modelos') : undefined} version={versionElim} onRehabilitar={(f) => { setModalErr(null); setRehabDe(f) }} />
        {rehabDe && (
          <ModalMotivo titulo={`Rehabilitar @${rehabDe.instagram_nuevo || rehabDe.instagram_original || ''}`} descripcion="La cuenta volverá al cuadro General como activa. Queda anotado el motivo de la baja y el de la rehabilitación en sus observaciones." etiquetaMotivo="Motivo de la rehabilitación" etiquetaFecha="Fecha de rehabilitación" textoBoton="Rehabilitar cuenta" error={modalErr} trabajando={trabajando} onConfirmar={rehabilitar} onCancelar={() => setRehabDe(null)} />
        )}
      </div>
    )
  }

  if (tab === 'metricas') {
    return (
      <div>
        <PageHeader title="Cuentas de Instagram" subtitle="Métricas reales de cada perfil (seguidores, publicaciones, interacción) leídas con ScrapeCreators." />
        {pestanas}
        <IGProfileMetrics />
      </div>
    )
  }

  if (tab === 'cero') {
    return (
      <div>
        <PageHeader title="Cuentas de Instagram" subtitle="Cuentas de cero: seguimiento especial de las cuentas recién creadas, en fase de calentamiento." />
        {pestanas}
        <ZeroAccounts embebido />
      </div>
    )
  }

  // Campos del formulario (sirven para «Añadir cuenta» y para la ventana que se despliega bajo la fila al editar)
  const C = ({ t, children, cls = '' }) => (
    <div className={cls}><label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{t}</label>{children}</div>
  )
  const formulario = (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {C({ t: '@ usuario actual', children: <Input placeholder="@usuario actual" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /> })}
      {C({ t: 'Modelo', children: (
        <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
          <option value="">Sin modelo asignado</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>) })}
      {C({ t: 'Estado', children: (
        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replaceAll('_', ' ')}</option>)}
        </Select>) })}
      {C({ t: 'Responsable (asistente)', children: (
        <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
          <option value="">Sin asistente asignado</option>
          {assistants.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
        </Select>) })}
      {C({ t: 'Instagram original (si la cuenta fue comprada)', children: <Input placeholder="Instagram original" value={form.original_username} onChange={(e) => setForm({ ...form, original_username: e.target.value })} /> })}
      {C({ t: 'Correo de la cuenta', children: <Input placeholder="Correo de la cuenta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /> })}
      {C({ t: 'Código 2FA y foto del QR', children: !ver2fa ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }} data-candado title="El admin no te ha dado permiso para ver el 2FA">🔒 No tienes permiso</span> : <div className="flex items-center gap-3"><div style={{ flex: 1 }}><Input placeholder="Código 2FA" value={form.two_fa_code} onChange={(e) => setForm({ ...form, two_fa_code: e.target.value })} /></div><QrCelda usuario={form.username} canEdit={canEdit} /></div> })}
      {C({ t: 'Link bio', children: <Input placeholder="Link bio" value={form.bio_link} onChange={(e) => setForm({ ...form, bio_link: e.target.value })} /> })}
      {C({ t: 'Público objetivo (separado por comas)', children: <Input placeholder="Ej: Español, USA" value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} /> })}
      {C({ t: 'Fecha de creación/asignación', children: <Input type="date" value={form.assigned_at} onChange={(e) => setForm({ ...form, assigned_at: e.target.value })} /> })}
      {C({ t: 'Observaciones', cls: 'lg:col-span-1', children: <Input placeholder="Observaciones" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /> })}
      {C({ t: 'Restricciones', children: <Input placeholder="Restricciones" value={form.restrictions} onChange={(e) => setForm({ ...form, restrictions: e.target.value })} /> })}
      {error && <p className="sm:col-span-2 lg:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
        <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar cuenta'}</Button>
        <Button type="button" variant="ghost" onClick={() => (editingId ? cerrarEdicion() : setShowForm(false))}>Cancelar</Button>
      </div>
    </form>
  )
  const fila = { whiteSpace: 'nowrap' }
  const corta = (c) => ({ width: c.w, maxWidth: c.w })

  return (
    <div>
      <style>{`
        .tabla-ig tbody tr.fila-ig { transition: background-color .2s ease; }
        .tabla-ig tbody tr.fila-ig:hover > td { background: var(--panel-alt) !important; }
        .tabla-ig tbody tr.fila-ig.editando > td { background: color-mix(in srgb, var(--accent) 14%, var(--panel)) !important; }
        .tabla-ig tbody tr.sobre > td { box-shadow: inset 0 3px 0 0 var(--accent); }
        .tabla-ig tbody tr.arrastrada { opacity: .45; }
        .tabla-ig thead th { text-transform: uppercase; letter-spacing: .06em; font-size: 11px; }
      `}</style>
      <PageHeader
        title="Cuentas de Instagram"
        subtitle="Ficha completa de cada cuenta: origen, credenciales, responsable y estado. Las cuentas se añaden desde Cuentas propias, Cuentas de modelos o Stock Instagram y aparecen aquí solas."
      />

      {pestanas}
      {error && !showForm && !editingId && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}

      {showForm && !editingId && (
        <Panel className="p-5 mb-5">
          <p className="text-sm mb-4 font-medium">Nueva cuenta</p>
          {formulario}
        </Panel>
      )}

      {bajaDe && (
        <ModalMotivo titulo={`Dar de baja @${bajaDe.username}`} descripcion="La cuenta pasa al apartado «Eliminadas» con el motivo y la fecha. No se borra nada: conserva sus planificaciones, reels y métricas, y se puede rehabilitar desde Eliminadas."
          tipos={[{ v: 'ELIMINADA', n: 'Eliminada' }, { v: 'SUSPENDIDA', n: 'Suspendida' }]} etiquetaTipo="¿Eliminada o suspendida?" etiquetaMotivo="Motivo" etiquetaFecha="Fecha" textoBoton="Pasar a Eliminadas"
          error={modalErr} trabajando={trabajando} onConfirmar={darDeBaja} onCancelar={() => setBajaDe(null)} />
      )}

      <Panel ref={panelRef} className="overflow-hidden" style={{ boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
        {/* Filtros y orden, integrados en la propia tabla para que esta quede arriba */}
        <div className="px-4 py-3" style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow basis-52">
              <Input placeholder="🔎 Buscar cuenta, correo, texto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="w-44">
              <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)} aria-label="Modelo">
                <option value="todos">Modelo: todas</option><option value="sin">Sin modelo</option>
                {models.slice().sort((x, y) => String(x.stage_name).localeCompare(String(y.stage_name), 'es')).map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
              </Select>
            </div>
            <div className="w-40">
              <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Estado">
                <option value="todos">Estado: todos</option>
                {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
              </Select>
            </div>
            <div className="w-52">
              <Select value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsable">
                <option value="todos">Responsable: todos</option><option value="sin">Sin asignar</option>
                {assistants.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
              </Select>
            </div>
            <div className="flex gap-1.5">
              <div className="w-56">
                <Select value={ordenK} onChange={(e) => { setOrdenK(e.target.value); setOrdenDir('asc') }} aria-label="Ordenar por">
                  {ORDENABLES.map((c) => <option key={c.k} value={c.k}>Ordenar: {c.n}</option>)}
                </Select>
              </div>
              {ordenK !== 'manual' && <button type="button" onClick={() => setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'))} title={ordenDir === 'asc' ? 'Ascendente (A→Z, menor a mayor)' : 'Descendente (Z→A, mayor a menor)'}
                className="px-3 rounded-md text-sm whitespace-nowrap" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>{ordenDir === 'asc' ? '▲ A→Z' : '▼ Z→A'}</button>}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span>{visibles.length} de {accounts.length} cuentas · orden: {ORDENABLES.find((c) => c.k === ordenK)?.n}{ordenK !== 'manual' ? ` (${ordenDir === 'asc' ? 'ascendente' : 'descendente'})` : ''}{puedeArrastrar ? ' · arrastra ⠿ para mover una cuenta' : ordenK === 'manual' && canDelete ? ' · quita los filtros para poder arrastrar' : ''}</span>
            {(hayFiltros || ordenK !== 'manual' || ordenDir !== 'asc') && (
              <button type="button" className="underline" onClick={() => { setFModelo('todos'); setFEstado('todos'); setFResp('todos'); setBusca(''); setOrdenK('manual'); setOrdenDir('asc') }}>Restablecer (orden manual)</button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <ScrollSuperior>
            <table className="tabla-ig text-sm" style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
                  {COLS.map((c, i) => (
                    <th key={c.k} className="text-left px-4 py-3 font-medium whitespace-nowrap"
                      style={{ color: ordenK === c.k ? 'var(--accent)' : 'var(--text-muted)', ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 6, background: 'var(--panel)' } : {}), ...(c.k === 'acc' ? { position: 'sticky', right: 0, zIndex: 6, background: 'var(--panel)', borderLeft: '1px solid var(--border)' } : {}) }}>
                      {c.k === 'acc' ? '' : (
                        <button type="button" onClick={() => ordenarPor(c.k)} className="hover:underline uppercase" title="Ordenar por esta columna">
                          {c.n}{ordenK === c.k ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr><td colSpan={COLS.length} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>{accounts.length ? 'Ninguna cuenta coincide con los filtros.' : 'Todavía no hay cuentas.'}</td></tr>
                ) : visibles.map((a, idx) => {
                  // línea gruesa entre cuentas de distinta modelo (con el orden manual o por modelo)
                  const cambiaModelo = idx > 0 && (ordenK === 'manual' || ordenK === 'modelo') && (a.model_id || null) !== (visibles[idx - 1].model_id || null)
                  return (
                  <Fragment key={a.id}>
                    <tr className={`fila-ig${editingId === a.id ? ' editando' : ''}${sobre === a.id && arrastrando && arrastrando !== a.id ? ' sobre' : ''}${arrastrando === a.id ? ' arrastrada' : ''}`}
                      onDragOver={puedeArrastrar && arrastrando ? (e) => { e.preventDefault(); if (sobre !== a.id) setSobre(a.id) } : undefined}
                      onDrop={puedeArrastrar && arrastrando ? (e) => { e.preventDefault(); soltar(a.id) } : undefined}
                      style={{ borderBottom: editingId === a.id ? 'none' : '1px solid var(--border)', borderTop: cambiaModelo ? '4px solid color-mix(in srgb, var(--accent) 55%, var(--border))' : undefined, height: 62 }}>
                      <td className="px-4 align-middle" style={{ position: 'sticky', left: 0, zIndex: 5, background: 'var(--panel)', ...fila }}>
                        <div className="flex items-center">
                        {puedeArrastrar && (
                          <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); const tr = e.currentTarget.closest('tr'); if (tr) e.dataTransfer.setDragImage(tr, 24, 20); setArrastrando(a.id) }} onDragEnd={() => { setArrastrando(null); setSobre(null) }}
                            className="cursor-grab select-none mr-2 align-middle" style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }} title="Arrastra para cambiar el orden" aria-label="Arrastrar para ordenar">⠿</span>
                        )}
                        <CeldaCopia completo titulo="Cuenta actual" texto={`@${a.username}`}>
                          <span className="inline-flex items-center gap-2.5 align-middle font-medium">
                            <FotoIG url={fotos[a.id]} nombre={a.username} size={38} />
                            <a href={urlInstagram(a.username)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} title="Abrir la cuenta de Instagram">@{a.username}</a>
                          </span>
                        </CeldaCopia>
                        </div>
                      </td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Modelo" texto={a.models?.stage_name} /></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Estado" texto={String(a.status || '').replace(/_/g, ' ')}><StatusBadge status={a.status} /></CeldaCopia></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Responsable" texto={a.profiles?.full_name} /></td>
                      <td className="px-4 align-middle tabular-nums" style={fila}><CeldaCopia completo titulo="Seguidores" texto={seguidores[a.id] != null ? Number(seguidores[a.id]).toLocaleString('es-ES') : ''} /></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="IG original" texto={a.original_username} /></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Correo" texto={a.email} muted /></td>
                      <td className="px-4 align-middle" style={corta(COLS[7])}>{!ver2fa ? <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }} data-candado title="El admin no te ha dado permiso para ver el 2FA">🔒 No tienes permiso</span> : <div className="flex items-center gap-2" style={{ minWidth: 0 }}><div style={{ minWidth: 0, flex: '1 1 auto' }}><CeldaCopia titulo="2FA" texto={a.two_fa_code} muted><span className="font-mono tracking-wide">{a.two_fa_code}</span></CeldaCopia></div><QrCelda usuario={a.username} canEdit={canEdit} /></div>}</td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Público" texto={(a.target_audience || []).join(', ')} /></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Asignación" texto={a.assigned_at} /></td>
                      <td className="px-4 align-middle" style={fila}><CeldaCopia completo titulo="Días" texto={a.assigned_at ? String(diasTranscurridos(a.assigned_at)) : ''} /></td>
                      <td className="px-4 align-middle" style={corta(COLS[11])}><CeldaCopia titulo="Observaciones" texto={a.observations} muted /></td>
                      <td className="px-4 align-middle" style={corta(COLS[12])}><CeldaCopia titulo="Restricciones" texto={a.restrictions} muted /></td>
                      <td className="px-4 align-middle" style={{ position: 'sticky', right: 0, zIndex: 5, background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}>
                        <div className="flex gap-3 whitespace-nowrap">
                          {canEdit && (
                            <button onClick={() => (editingId === a.id ? cerrarEdicion() : startEdit(a))} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                              {editingId === a.id && !cerrando ? 'Cerrar' : 'Editar'}
                            </button>
                          )}
                          {canDelete && verSecciones && (
                            <button onClick={() => { setModalErr(null); setBajaDe(a) }} className="text-xs hover:underline" style={{ color: 'var(--gold)' }} title="Pasar a Eliminadas (eliminada o suspendida) indicando el motivo">
                              Dar de baja
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => borrarCuenta(a)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }} title="Borra la cuenta y todo su historial para siempre">
                              Borrar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingId === a.id && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={COLS.length} style={{ padding: 0, background: 'var(--panel-alt)' }}>
                          <div style={{ position: 'sticky', left: 0, width: anchoVista }}>
                            <Desplegable abierto={!cerrando} onCerrado={finEdicion}>
                              <div className="p-5">
                                <p className="text-sm mb-4 font-medium">Editar @{a.username}</p>
                                {formulario}
                              </div>
                            </Desplegable>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </ScrollSuperior>
        )}
      </Panel>
    </div>
  )
}
