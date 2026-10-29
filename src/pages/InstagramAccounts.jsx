import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, Td, StatusBadge, PageHeader } from '../components/ui'
import CeldaCopia from '../components/CeldaCopia'
import ScrollSuperior from '../components/ScrollSuperior'
import ZeroAccounts from './ZeroAccounts'
import IGProfileMetrics from './IGProfileMetrics'

// Columnas: k = clave de orden, n = cabecera, w = ancho en px. Todas las filas miden lo mismo; lo que no cabe se corta con «ver más».
const COLS = [
  { k: 'cuenta', n: 'Cuenta actual', w: 200 }, { k: 'modelo', n: 'Modelo', w: 180 }, { k: 'estado', n: 'Estado', w: 180 },
  { k: 'responsable', n: 'Responsable', w: 180 }, { k: 'seguidores', n: 'Seguidores', w: 130 }, { k: 'original', n: 'IG original', w: 200 },
  { k: 'correo', n: 'Correo', w: 250 }, { k: 'dosfa', n: '2FA', w: 140 }, { k: 'publico', n: 'Público', w: 180 },
  { k: 'asignacion', n: 'Asignación', w: 130 }, { k: 'dias', n: 'Días', w: 90 }, { k: 'obs', n: 'Observaciones', w: 260 },
  { k: 'restr', n: 'Restricciones', w: 260 }, { k: 'acc', n: '', w: 150 },
]
// Foto de perfil del propio Instagram (la última leída con ScrapeCreators); si no hay o no carga, la inicial de la cuenta
function FotoIG({ url, nombre, size = 36 }) {
  const [fallo, setFallo] = useState(false)
  const base = { width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0 }
  if (url && !fallo) return <img src={url} alt={nombre} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallo(true)} style={{ ...base, objectFit: 'cover', border: '1px solid var(--border)' }} />
  return <span aria-hidden="true" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>{(nombre || '?').charAt(0).toUpperCase()}</span>
}

const ORDENABLES = COLS.filter((c) => c.k !== 'acc')
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
  const { hasAnyRole } = useAuth()
  const canEdit = hasAnyRole(['admin', 'ig_manager', 'ig_assistant'])
  const canDelete = hasAnyRole(['admin', 'ig_manager'])
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cero' ? 'cero' : params.get('tab') === 'metricas' ? 'metricas' : 'cuentas'
  const [accounts, setAccounts] = useState([])
  const [models, setModels] = useState([])
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [seguidores, setSeguidores] = useState({}) // account_id -> última lectura de seguidores
  const [fotos, setFotos] = useState({}) // account_id -> foto de perfil de Instagram
  const [ordenK, setOrdenK] = useState('modelo')   // por defecto: por modelo
  const [ordenDir, setOrdenDir] = useState('asc')
  const [fModelo, setFModelo] = useState('todos')
  const [fEstado, setFEstado] = useState('todos')
  const [fResp, setFResp] = useState('todos')
  const [busca, setBusca] = useState('')

  // Valor de cada columna para ordenar
  function valorDe(a, k) {
    switch (k) {
      case 'cuenta': return (a.username || '').toLowerCase()
      case 'modelo': return a.models?.stage_name ? a.models.stage_name.toLowerCase() : null
      case 'estado': return STATUS_OPTIONS.indexOf(a.status)
      case 'responsable': return a.profiles?.full_name ? a.profiles.full_name.toLowerCase() : null
      case 'seguidores': return seguidores[a.id] != null ? Number(seguidores[a.id]) : null
      case 'original': return a.original_username ? a.original_username.toLowerCase() : null
      case 'correo': return a.email ? a.email.toLowerCase() : null
      case 'dosfa': return a.two_fa_code || null
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
  function ordenarPor(k) { if (k === ordenK) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setOrdenK(k); setOrdenDir('asc') } }

  async function load() {
    setLoading(true)
    const [{ data: acc }, { data: mods }, profs] = await Promise.all([
      supabase.from('instagram_accounts').select('*, models(stage_name), profiles(full_name)').order('created_at', { ascending: false }),
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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(a) {
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
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = {
      original_username: form.original_username || null,
      email: form.email || null,
      profile_link: form.profile_link || null,
      username: form.username,
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
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    load()
  }

  async function borrarCuenta(a) {
    if (!confirm(`¿Eliminar la cuenta @${a.username}?\n\nSe borrarán también sus planificaciones, reels ganadores y registros de seguidores. No se puede deshacer.`)) return
    const { error: err } = await supabase.from('instagram_accounts').delete().eq('id', a.id)
    if (err) { setError('No se pudo eliminar: ' + err.message); return }
    if (editingId === a.id) { setShowForm(false); setEditingId(null) }
    load()
  }

  const pestanas = (
    <div className="flex gap-2 mb-5">
      {[['cuentas', 'Cuentas'], ['metricas', 'Métricas de perfil'], ['cero', 'Cuentas de cero']].map(([id, label]) => (
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
    </div>
  )

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

  return (
    <div>
      <PageHeader
        title="Cuentas de Instagram"
        subtitle="Ficha completa de cada cuenta: origen, credenciales, responsable y estado."
        action={canEdit && !editingId && (
          <Button onClick={showForm ? () => setShowForm(false) : startCreate}>
            {showForm ? 'Cancelar' : 'Añadir cuenta'}
          </Button>
        )}
      />

      {pestanas}
      {error && !showForm && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}

      {showForm && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4 font-medium">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</p>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              placeholder="Instagram original (si la cuenta fue comprada)"
              value={form.original_username}
              onChange={(e) => setForm({ ...form, original_username: e.target.value })}
            />
            <Input
              placeholder="Correo de la cuenta"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Link de Instagram"
              value={form.profile_link}
              onChange={(e) => setForm({ ...form, profile_link: e.target.value })}
            />
            <Input
              placeholder="@usuario actual"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
              <option value="">Sin modelo asignado</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Input
              placeholder="Público objetivo (ej: Español, USA)"
              value={form.target_audience}
              onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
            />
            <Input
              placeholder="Link bio"
              value={form.bio_link}
              onChange={(e) => setForm({ ...form, bio_link: e.target.value })}
            />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </Select>
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Sin asistente asignado</option>
              {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </Select>
            <Input
              placeholder="Código 2FA"
              value={form.two_fa_code}
              onChange={(e) => setForm({ ...form, two_fa_code: e.target.value })}
            />
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha de creación/asignación</label>
              <Input
                type="date"
                value={form.assigned_at}
                onChange={(e) => setForm({ ...form, assigned_at: e.target.value })}
              />
            </div>
            <Input
              placeholder="Observaciones"
              className="col-span-1"
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
            />
            <Input
              placeholder="Restricciones"
              className="col-span-1"
              value={form.restrictions}
              onChange={(e) => setForm({ ...form, restrictions: e.target.value })}
            />
            {error && <p className="sm:col-span-2 lg:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
              <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar cuenta'}</Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Panel>
      )}

      {/* Orden y filtros */}
      <Panel className="p-4 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="col-span-2 lg:col-span-1">
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Ordenar por</label>
            <div className="flex gap-2">
              <Select value={ordenK} onChange={(e) => { setOrdenK(e.target.value); setOrdenDir('asc') }}>
                {ORDENABLES.map((c) => <option key={c.k} value={c.k}>{c.n}</option>)}
              </Select>
              <button type="button" onClick={() => setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'))} title={ordenDir === 'asc' ? 'Ascendente (A→Z, menor a mayor)' : 'Descendente (Z→A, mayor a menor)'}
                className="px-3 rounded-md text-sm whitespace-nowrap" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>{ordenDir === 'asc' ? '▲ A→Z' : '▼ Z→A'}</button>
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Modelo</label>
            <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
              <option value="todos">Todas</option><option value="sin">Sin modelo</option>
              {models.slice().sort((x, y) => String(x.stage_name).localeCompare(String(y.stage_name), 'es')).map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Estado</label>
            <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="todos">Todos</option>
              {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Responsable</label>
            <Select value={fResp} onChange={(e) => setFResp(e.target.value)}>
              <option value="todos">Todos</option><option value="sin">Sin asignar</option>
              {assistants.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Buscar</label>
            <Input placeholder="Cuenta, correo, texto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
          <span>{visibles.length} de {accounts.length} cuentas · orden: {ORDENABLES.find((c) => c.k === ordenK)?.n} ({ordenDir === 'asc' ? 'ascendente' : 'descendente'})</span>
          {(hayFiltros || ordenK !== 'modelo' || ordenDir !== 'asc') && (
            <button type="button" className="underline" onClick={() => { setFModelo('todos'); setFEstado('todos'); setFResp('todos'); setBusca(''); setOrdenK('modelo'); setOrdenDir('asc') }}>Restablecer (orden por modelo)</button>
          )}
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <ScrollSuperior>
            <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%', minWidth: COLS.reduce((t, c) => t + c.w, 0) }}>
              <colgroup>{COLS.map((c) => <col key={c.k} style={{ width: c.w }} />)}</colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {COLS.map((c, i) => (
                    <th key={c.k} className="text-left px-3 py-3 font-medium whitespace-nowrap"
                      style={{ color: ordenK === c.k ? 'var(--accent)' : 'var(--text-muted)', ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 6, background: 'var(--panel)' } : {}) }}>
                      {c.k === 'acc' ? '' : (
                        <button type="button" onClick={() => ordenarPor(c.k)} className="hover:underline" title="Ordenar por esta columna">
                          {c.n}{ordenK === c.k ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr><td colSpan={COLS.length} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>{accounts.length ? 'Ninguna cuenta coincide con los filtros.' : 'Todavía no hay cuentas.'}</td></tr>
                ) : visibles.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', height: 56 }}>
                    <td className="px-3 align-middle" style={{ position: 'sticky', left: 0, zIndex: 5, background: 'var(--panel)' }}>
                      <CeldaCopia titulo="Cuenta actual" texto={`@${a.username}`}>
                        <span className="inline-flex items-center gap-2 align-middle">
                          <FotoIG url={fotos[a.id]} nombre={a.username} />
                          {a.profile_link ? <a href={a.profile_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@{a.username}</a> : `@${a.username}`}
                        </span>
                      </CeldaCopia>
                    </td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Modelo" texto={a.models?.stage_name} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Estado" texto={String(a.status || '').replace(/_/g, ' ')}><StatusBadge status={a.status} /></CeldaCopia></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Responsable" texto={a.profiles?.full_name} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Seguidores" texto={seguidores[a.id] != null ? Number(seguidores[a.id]).toLocaleString('es-ES') : ''} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="IG original" texto={a.original_username} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Correo" texto={a.email} muted /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="2FA" texto={a.two_fa_code} muted /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Público" texto={(a.target_audience || []).join(', ')} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Asignación" texto={a.assigned_at} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Días" texto={a.assigned_at ? String(diasTranscurridos(a.assigned_at)) : ''} /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Observaciones" texto={a.observations} muted /></td>
                    <td className="px-3 align-middle"><CeldaCopia titulo="Restricciones" texto={a.restrictions} muted /></td>
                    <td className="px-3 align-middle">
                      <div className="flex gap-3 whitespace-nowrap">
                        {canEdit && (
                          <button onClick={() => startEdit(a)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => borrarCuenta(a)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollSuperior>
        )}
      </Panel>
    </div>
  )
}
