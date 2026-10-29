import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { fmtF } from '../lib/excelImport'
import { antiguedadDe } from '../lib/redditAntiguedad'

const BANEOS = [
  { id: 'ninguno', n: 'Sin baneo', c: 'var(--success)' },
  { id: 'shadowban', n: 'Shadowban', c: 'var(--gold)' },
  { id: 'suspendida', n: 'Suspendida', c: 'var(--danger)' },
  { id: 'baneada', n: 'Baneada', c: 'var(--danger)' },
]
const BN = Object.fromEntries(BANEOS.map((b) => [b.id, b]))
const lbl = { color: 'var(--text-muted)' }
const VACIO = { username: '', link: '', model_id: '', responsable_id: '', activa: true, estado_baneo: 'ninguno', baneo_notas: '', comment_karma: '', post_karma: '', fecha_creacion: '', notas: '' }
const urlDe = (c) => (c.link && c.link.trim()) || `https://www.reddit.com/user/${c.username}`
const edadDe = (c) => antiguedadDe(c.fecha_creacion) || c.antiguedad || ''

const limpiarUsuario = (u) => String(u || '').trim().replace(/^https?:\/\/(www\.|old\.)?reddit\.com\/(user|u)\//i, '').replace(/^\/?u\//i, '').replace(/[\/?#].*$/, '').trim()
const aNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : null }
const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-ES'))
function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 64, ...props.style }} />
}

export default function RedditAccounts() {
  const { hasAnyRole } = useAuth()
  const gestiona = hasAnyRole(['admin', 'reddit_manager'])
  const [cuentas, setCuentas] = useState([])
  const [modelos, setModelos] = useState([])
  const [equipo, setEquipo] = useState([])
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null) // null = cerrado
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [q, setQ] = useState('')
  const [fModelo, setFModelo] = useState('todos')
  const [fEstado, setFEstado] = useState('todas')
  const [fBaneo, setFBaneo] = useState('todos')

  async function cargar() {
    const [{ data: c, error }, { data: m }, { data: e }] = await Promise.all([
      supabase.from('reddit_accounts').select('*').order('username'),
      supabase.rpc('reddit_modelos'),
      supabase.rpc('reddit_equipo'),
    ])
    if (error) setErr(/reddit_accounts/.test(error.message) ? 'Falta ejecutar la migración 68 en Supabase.' : error.message)
    else setErr('')
    setCuentas(c || []); setModelos(m || []); setEquipo(e || []); setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const nombreModelo = (id) => modelos.find((x) => x.id === id)?.stage_name || ''
  const nombrePersona = (id) => equipo.find((x) => x.id === id)?.full_name || ''

  const visibles = useMemo(() => cuentas.filter((c) => {
    if (q && !c.username.toLowerCase().includes(q.trim().toLowerCase())) return false
    if (fModelo !== 'todos' && (fModelo === 'sin' ? c.model_id : c.model_id !== fModelo)) return false
    if (fEstado === 'activas' && !c.activa) return false
    if (fEstado === 'inactivas' && c.activa) return false
    if (fBaneo === 'ninguno' && c.estado_baneo !== 'ninguno') return false
    if (fBaneo === 'problemas' && c.estado_baneo === 'ninguno') return false
    return true
  }), [cuentas, q, fModelo, fEstado, fBaneo])

  const resumen = {
    total: cuentas.length,
    activas: cuentas.filter((c) => c.activa).length,
    inactivas: cuentas.filter((c) => !c.activa).length,
    baneo: cuentas.filter((c) => c.estado_baneo !== 'ninguno').length,
  }

  function nueva() { setEditId(null); setForm({ ...VACIO }); setErr('') }
  function editar(c) {
    setEditId(c.id); setErr('')
    setForm({
      username: c.username, link: c.link || '', model_id: c.model_id || '', responsable_id: c.responsable_id || '', activa: !!c.activa, estado_baneo: c.estado_baneo || 'ninguno',
      baneo_notas: c.baneo_notas || '', comment_karma: c.comment_karma ?? '', post_karma: c.post_karma ?? '', fecha_creacion: c.fecha_creacion || '', notas: c.notas || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function guardar() {
    const username = limpiarUsuario(form.username) || limpiarUsuario(form.link)
    const link = form.link.trim() ? (/^https?:\/\//i.test(form.link.trim()) ? form.link.trim() : `https://${form.link.trim()}`) : null
    if (!username) { setErr('Escribe el nombre de usuario de la cuenta.'); return }
    const payload = {
      username, link, model_id: form.model_id || null, responsable_id: form.responsable_id || null, activa: !!form.activa, estado_baneo: form.estado_baneo,
      baneo_notas: form.baneo_notas.trim() || null, comment_karma: aNum(form.comment_karma), post_karma: aNum(form.post_karma),
      fecha_creacion: form.fecha_creacion || null, notas: form.notas.trim() || null, updated_at: new Date().toISOString(),
    }
    setGuardando(true)
    const { error } = editId
      ? await supabase.from('reddit_accounts').update(payload).eq('id', editId)
      : await supabase.from('reddit_accounts').insert(payload)
    setGuardando(false)
    if (error) { setErr(/duplicate|unique/i.test(error.message) ? `La cuenta u/${username} ya está registrada.` : error.message); return }
    setForm(null); setEditId(null); setErr(''); cargar()
  }
  async function borrar(c) {
    if (!window.confirm(`¿Eliminar la cuenta u/${c.username} y todos sus reportes del día? No se puede deshacer.`)) return
    const { error } = await supabase.from('reddit_accounts').delete().eq('id', c.id)
    if (error) { setErr(error.message); return }
    cargar()
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const personal = equipo.filter((x) => x.active !== false)

  return (
    <div>
      <PageHeader
        title="Cuentas de Reddit"
        subtitle="Todas las cuentas de Reddit con su modelo, estado y baneos. Los datos de karma y baneos se actualizan solos con los reportes del día del personal."
        action={gestiona && <Button onClick={() => (form ? setForm(null) : nueva())}>{form ? 'Cancelar' : '+ Añadir cuenta'}</Button>}
      />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

      {form && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">{editId ? 'Editar cuenta' : 'Nueva cuenta de Reddit'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div><label className="text-xs mb-1 block" style={lbl}>Usuario (sin u/)</label><Input value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="nombre_de_usuario" /></div>
            <div className="sm:col-span-2 lg:col-span-1"><label className="text-xs mb-1 block" style={lbl}>Link directo de la cuenta</label><Input value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="https://www.reddit.com/user/…" /></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Modelo</label>
              <Select value={form.model_id} onChange={(e) => set('model_id', e.target.value)}>
                <option value="">— Sin modelo —</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
              </Select></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Responsable</label>
              <Select value={form.responsable_id} onChange={(e) => set('responsable_id', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {personal.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
              </Select></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Estado</label>
              <Select value={form.activa ? '1' : '0'} onChange={(e) => set('activa', e.target.value === '1')}>
                <option value="1">Activa</option><option value="0">Inactiva</option>
              </Select></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Baneo / suspensión</label>
              <Select value={form.estado_baneo} onChange={(e) => set('estado_baneo', e.target.value)}>
                {BANEOS.map((b) => <option key={b.id} value={b.id}>{b.n}</option>)}
              </Select></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Fecha de creación de la cuenta</label><Input type="date" value={form.fecha_creacion} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('fecha_creacion', e.target.value)} />
              <p className="text-xs mt-1" style={lbl}>{form.fecha_creacion ? `Antigüedad: ${antiguedadDe(form.fecha_creacion)}` : 'La antigüedad se calcula sola a partir de esta fecha.'}</p></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Comment karma</label><Input inputMode="numeric" value={form.comment_karma} onChange={(e) => set('comment_karma', e.target.value)} /></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Post karma</label><Input inputMode="numeric" value={form.post_karma} onChange={(e) => set('post_karma', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className="text-xs mb-1 block" style={lbl}>Detalle del baneo (motivo, fecha, apelación…)</label><Area value={form.baneo_notas} onChange={(e) => set('baneo_notas', e.target.value)} /></div>
            <div><label className="text-xs mb-1 block" style={lbl}>Notas</label><Area value={form.notas} onChange={(e) => set('notas', e.target.value)} /></div>
          </div>
          <div className="flex gap-2"><Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir cuenta'}</Button><Button variant="ghost" onClick={() => { setForm(null); setEditId(null) }}>Cancelar</Button></div>
        </Panel>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[['Cuentas', resumen.total], ['Activas', resumen.activas], ['Inactivas', resumen.inactivas], ['Con baneo / suspensión', resumen.baneo]].map(([t, v], i) => (
          <Panel key={t} className="p-4"><p className="text-xs mb-1" style={lbl}>{t}</p><p className="text-xl font-display font-semibold tabular-nums" style={i === 3 && v ? { color: 'var(--danger)' } : undefined}>{v}</p></Panel>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Input placeholder="Buscar usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
          <option value="todos">Todas las modelos</option><option value="sin">Sin modelo</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="todas">Activas e inactivas</option><option value="activas">Solo activas</option><option value="inactivas">Solo inactivas</option>
        </Select>
        <Select value={fBaneo} onChange={(e) => setFBaneo(e.target.value)}>
          <option value="todos">Con o sin baneo</option><option value="ninguno">Sin baneo</option><option value="problemas">Con baneo / suspensión</option>
        </Select>
      </div>

      <Panel>
        {cargando ? <p className="p-6 text-sm" style={lbl}>Cargando…</p> : visibles.length === 0 ? (
          <p className="p-6 text-sm text-center" style={lbl}>{cuentas.length ? 'Ninguna cuenta coincide con los filtros.' : gestiona ? 'Aún no hay cuentas. Pulsa «+ Añadir cuenta».' : 'Aún no hay cuentas registradas.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Cuenta', 'Modelo', 'Responsable', 'Estado', 'Baneo', 'Comment karma', 'Post karma', 'Antigüedad', 'Último reporte', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap" style={lbl}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {visibles.map((c) => {
                  const b = BN[c.estado_baneo] || BN.ninguno
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: c.activa ? 1 : 0.6 }}>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                        <a href={urlDe(c)} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }} title="Abrir la cuenta en una pestaña nueva">u/{c.username} ↗</a>
                        {c.notas && <span className="block text-xs font-normal max-w-[220px] truncate" style={lbl} title={c.notas}>{c.notas}</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{nombreModelo(c.model_id) || <span style={lbl}>—</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{nombrePersona(c.responsable_id) || <span style={lbl}>—</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span style={{ color: c.activa ? 'var(--success)' : 'var(--text-muted)' }}>{c.activa ? 'Activa' : 'Inactiva'}</span></td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `color-mix(in srgb, ${b.c} 16%, transparent)`, color: b.c }}>{b.n}</span>
                        {c.baneo_notas && <span className="block text-xs mt-1 max-w-[220px]" style={lbl}>{c.baneo_notas}</span>}
                        {c.ultimo_reporte_baneos && <span className="block text-xs mt-1 max-w-[220px]" style={{ color: 'var(--gold)' }}>⚠ Reportado: {c.ultimo_reporte_baneos}</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtN(c.comment_karma)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtN(c.post_karma)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{edadDe(c) || <span style={lbl}>—</span>}{c.fecha_creacion && <span className="block text-xs" style={lbl}>desde {fmtF(c.fecha_creacion)}</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={lbl}>{c.ultimo_reporte_fecha ? <>{fmtF(c.ultimo_reporte_fecha)}{nombrePersona(c.ultimo_reporte_por) ? <span className="block">{nombrePersona(c.ultimo_reporte_por)}</span> : null}</> : 'Sin reportes'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-right">
                        {gestiona && <><button className="underline mr-3" onClick={() => editar(c)}>Editar</button><button className="underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(c)}>Borrar</button></>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
