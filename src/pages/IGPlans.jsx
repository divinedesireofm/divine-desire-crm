import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

const ORIGENES = [{ id: 'nuevo', n: 'Nuevo' }, { id: 'ganador', n: 'Ganador' }]
const TIPOS = [{ id: 'sugerente', n: 'Sugerente' }, { id: 'marca_personal', n: 'Marca personal' }]
const nOrigen = (id) => ORIGENES.find((o) => o.id === id)?.n || id
const nTipo = (id) => TIPOS.find((t) => t.id === id)?.n || id

const reelVacio = (i = 0) => ({ origen: 'nuevo', tipo: i % 2 === 0 ? 'sugerente' : 'marca_personal', link: '', gancho: '', texto: '' })
const estructura = (dias, porDia) => Array.from({ length: dias }, () => ({ reels: Array.from({ length: porDia }, (_, i) => reelVacio(i)) }))
const VACIA = { id: null, account_id: '', titulo: '', reglas: '', mostrar_resumen: true, dias: estructura(7, 2) }

const sinArroba = (u) => String(u || '').replace(/^@/, '')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const fmtTS = (ts) => (ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')

// ---- Texto listo para copiar y pegar a la chica ----
function bloqueReel(r) {
  const l = [`${nOrigen(r.origen).toUpperCase()} ${nTipo(r.tipo).toUpperCase()}`]
  if (r.link?.trim()) l.push(`🔗 ${r.link.trim()}`)
  if (r.gancho?.trim()) l.push(`🎣 ${r.gancho.trim()}`)
  if (r.texto?.trim()) l.push(`📝 ${r.texto.trim()}`)
  return l.join('\n')
}
function textoDia(d, i) {
  return [`DIA ${i + 1}:`, ...(d.reels || []).map(bloqueReel).map((b, j) => (j === 0 ? b : '\n' + b))].join('\n')
}
function textoPlan(p, usuario) {
  const todos = (p.dias || []).flatMap((d) => d.reels || [])
  const partes = [`REELS ${sinArroba(usuario)} ${String(p.titulo || '').toUpperCase()}`.trim()]
  if (p.mostrar_resumen) {
    const mp = todos.filter((r) => r.tipo === 'marca_personal').length
    const ga = todos.filter((r) => r.origen === 'ganador').length
    const resumen = []
    if (mp) resumen.push(plural(mp, 'reel marca personal', 'reels marca personal'))
    if (ga) resumen.push(plural(ga, 'reel ganador adaptado', 'reels ganadores adaptados'))
    if (resumen.length) partes.push('\n' + resumen.join('\n'))
  }
  if (p.reglas?.trim()) partes.push('\n' + p.reglas.trim())
  ;(p.dias || []).forEach((d, i) => partes.push('\n' + textoDia(d, i)))
  return partes.join('\n') + '\n'
}

export default function IGPlans() {
  const { hasAnyRole } = useAuth()
  const puedeBorrar = hasAnyRole(['admin', 'ig_manager'])
  const [cuentas, setCuentas] = useState([])
  const [planes, setPlanes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [ed, setEd] = useState(null) // planificación en edición
  const [nDias, setNDias] = useState(7)
  const [nPorDia, setNPorDia] = useState(2)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username, models(stage_name)').order('username'),
      supabase.from('ig_plans').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    setCuentas(c || [])
    setPlanes(p || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const cuenta = (id) => cuentas.find((c) => c.id === id)
  const usuarioDe = (id) => cuenta(id)?.username || ''
  const visibles = useMemo(() => planes.filter((p) => filtro === 'todas' || p.account_id === filtro), [planes, filtro])
  const texto = useMemo(() => (ed ? textoPlan(ed, usuarioDe(ed.account_id) || 'cuenta') : ''), [ed, cuentas])
  const totalReels = (p) => (p.dias || []).reduce((a, d) => a + (d.reels?.length || 0), 0)

  function nueva() {
    setMsg(''); setErr('')
    setEd({ ...VACIA, account_id: filtro !== 'todas' ? filtro : (cuentas[0]?.id || ''), dias: estructura(7, 2) })
    setNDias(7); setNPorDia(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function abrir(p) {
    setMsg(''); setErr('')
    setEd({ id: p.id, account_id: p.account_id, titulo: p.titulo, reglas: p.reglas || '', mostrar_resumen: p.mostrar_resumen, dias: JSON.parse(JSON.stringify(p.dias || [])) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // Mismo esquema (días, reels, nuevo/ganador y tipo) pero sin enlaces ni textos: punto de partida de la semana siguiente
  function duplicarEstructura(p) {
    setMsg(''); setErr('')
    setEd({
      id: null, account_id: p.account_id, titulo: '', reglas: p.reglas || '', mostrar_resumen: p.mostrar_resumen,
      dias: (p.dias || []).map((d) => ({ reels: (d.reels || []).map((r) => ({ origen: r.origen, tipo: r.tipo, link: '', gancho: '', texto: '' })) })),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function crearEstructura() {
    const hayContenido = ed.dias.some((d) => d.reels.some((r) => r.link || r.gancho || r.texto))
    if (hayContenido && !confirm('Esto reemplaza los días y reels actuales, y se pierde lo que ya has escrito. ¿Continuar?')) return
    setEd({ ...ed, dias: estructura(Math.min(Math.max(nDias, 1), 14), Math.min(Math.max(nPorDia, 1), 8)) })
  }
  const setDias = (fn) => setEd((e) => ({ ...e, dias: fn(e.dias) }))
  const setReel = (di, ri, k, v) => setDias((ds) => ds.map((d, i) => (i !== di ? d : { ...d, reels: d.reels.map((r, j) => (j === ri ? { ...r, [k]: v } : r)) })))
  const addReel = (di) => setDias((ds) => ds.map((d, i) => (i === di ? { ...d, reels: [...d.reels, reelVacio(d.reels.length)] } : d)))
  const quitarReel = (di, ri) => setDias((ds) => ds.map((d, i) => (i === di ? { ...d, reels: d.reels.filter((_, j) => j !== ri) } : d)))
  const addDia = () => setDias((ds) => [...ds, { reels: [reelVacio(0), reelVacio(1)] }])
  function quitarDia(di) {
    const d = ed.dias[di]
    if (d.reels.some((r) => r.link || r.gancho || r.texto) && !confirm(`El día ${di + 1} tiene contenido. ¿Quitarlo?`)) return
    setDias((ds) => ds.filter((_, i) => i !== di))
  }

  async function guardar() {
    setErr(''); setMsg('')
    if (!ed.account_id) { setErr('Elige la cuenta de Instagram.'); return }
    if (!ed.titulo.trim()) { setErr('Escribe el título de la semana (por ejemplo «2ª SEMANA OCTUBRE 26»).'); return }
    setGuardando(true)
    const payload = { account_id: ed.account_id, titulo: ed.titulo.trim(), reglas: ed.reglas.trim() || null, mostrar_resumen: ed.mostrar_resumen, dias: ed.dias }
    const { data, error } = ed.id
      ? await supabase.from('ig_plans').update(payload).eq('id', ed.id).select().single()
      : await supabase.from('ig_plans').insert([payload]).select().single()
    setGuardando(false)
    if (error) { setErr(error.message.includes('does not exist') ? 'Falta ejecutar la migración 43 en Supabase.' : 'No se pudo guardar. Revisa que tengas acceso a esa cuenta.'); return }
    setEd((e) => ({ ...e, id: data.id }))
    setMsg('Guardada.')
    cargar()
  }
  async function borrar(p) {
    if (!confirm(`¿Borrar la planificación «${p.titulo}» de @${sinArroba(usuarioDe(p.account_id))}? No se puede deshacer.`)) return
    const { error } = await supabase.from('ig_plans').delete().eq('id', p.id)
    if (error) { alert('No se pudo borrar.'); return }
    if (ed?.id === p.id) setEd(null)
    cargar()
  }

  return (
    <div>
      <PageHeader
        title="Planificaciones de reels"
        subtitle="Confecciona la planificación semanal de cada cuenta con la plantilla y copia el texto listo para enviárselo a la chica."
        action={<Button onClick={nueva} disabled={!cuentas.length}>Nueva planificación</Button>}
      />

      {ed && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-6 mb-8 items-start">
          <div>
            <Panel className="p-5 mb-4">
              <p className="text-sm font-medium mb-3">{ed.id ? 'Editar planificación' : 'Nueva planificación'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Cuenta de Instagram</label>
                  <Select value={ed.account_id} onChange={(e) => setEd({ ...ed, account_id: e.target.value })}>
                    <option value="">— Elegir cuenta —</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}{c.models?.stage_name ? ` · ${c.models.stage_name}` : ''}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Semana</label>
                  <Input placeholder="2ª SEMANA OCTUBRE 26" value={ed.titulo} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} />
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Avisos y reglas (salen debajo del resumen; déjalo vacío si no hay)</label>
                <textarea
                  value={ed.reglas} onChange={(e) => setEd({ ...ed, reglas: e.target.value })} rows={3}
                  placeholder={'🔴NADA EN ROPA INTERIOR🔴\n💡CADA 2 REELS CAMBIA DE ROPA💡'}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                  style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm mb-4">
                <input type="checkbox" checked={ed.mostrar_resumen} onChange={(e) => setEd({ ...ed, mostrar_resumen: e.target.checked })} />
                Incluir el resumen («N reels marca personal / N reels ganadores adaptados»), calculado solo
              </label>
              <div className="p-3 rounded-md flex flex-wrap items-end gap-3" style={{ background: 'var(--panel-alt)' }}>
                <div className="w-24">
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Días</label>
                  <Input type="number" min={1} max={14} value={nDias} onChange={(e) => setNDias(Number(e.target.value) || 1)} />
                </div>
                <div className="w-32">
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Reels por día</label>
                  <Input type="number" min={1} max={8} value={nPorDia} onChange={(e) => setNPorDia(Number(e.target.value) || 1)} />
                </div>
                <Button variant="ghost" onClick={crearEstructura}>Crear estructura</Button>
                <p className="text-xs flex-1 min-w-[180px]" style={{ color: 'var(--text-muted)' }}>Después puedes añadir o quitar días y reels sueltos, y cambiar cada reel a nuevo/ganador y sugerente/marca personal.</p>
              </div>
            </Panel>

            {ed.dias.map((d, di) => (
              <Panel key={di} className="p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">DÍA {di + 1} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {plural(d.reels.length, 'reel', 'reels')}</span></p>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => addReel(di)} className="hover:underline" style={{ color: 'var(--accent)' }}>+ Añadir reel</button>
                    <button onClick={() => quitarDia(di)} className="hover:underline" style={{ color: 'var(--danger)' }}>Quitar día</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {d.reels.map((r, ri) => (
                    <div key={ri} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Select value={r.origen} onChange={(e) => setReel(di, ri, 'origen', e.target.value)}>
                          {ORIGENES.map((o) => <option key={o.id} value={o.id}>{o.n}</option>)}
                        </Select>
                        <Select value={r.tipo} onChange={(e) => setReel(di, ri, 'tipo', e.target.value)}>
                          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Input placeholder="🔗 Enlace del reel de referencia" value={r.link} onChange={(e) => setReel(di, ri, 'link', e.target.value)} />
                        <Input placeholder="🎣 Gancho" value={r.gancho} onChange={(e) => setReel(di, ri, 'gancho', e.target.value)} />
                        <Input placeholder="📝 Texto / indicaciones" value={r.texto} onChange={(e) => setReel(di, ri, 'texto', e.target.value)} />
                      </div>
                      {d.reels.length > 1 && (
                        <button onClick={() => quitarReel(di, ri)} className="text-xs hover:underline mt-2" style={{ color: 'var(--danger)' }}>Quitar este reel</button>
                      )}
                    </div>
                  ))}
                  {d.reels.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Día sin reels. Añade uno.</p>}
                </div>
              </Panel>
            ))}
            <Button variant="ghost" onClick={addDia}>+ Añadir día</Button>
          </div>

          <div className="xl:sticky xl:top-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <p className="text-sm font-medium">Texto para copiar</p>
                <CopyButton text={texto} label="Copiar todo" />
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words rounded-md p-3 max-h-[60vh] overflow-y-auto" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', fontFamily: 'inherit' }}>{texto}</pre>
              {ed.dias.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {ed.dias.map((d, i) => <CopyButton key={i} text={textoDia(d, i)} label={`Copiar día ${i + 1}`} />)}
                </div>
              )}
              {err && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{err}</p>}
              {msg && <p className="text-sm mt-3" style={{ color: 'var(--success)' }}>{msg}</p>}
              <div className="flex gap-2 mt-4">
                <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar planificación'}</Button>
                <Button variant="ghost" onClick={() => setEd(null)}>Cerrar</Button>
              </div>
            </Panel>
          </div>
        </div>
      )}

      <Panel className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="text-sm font-medium">Planificaciones guardadas</p>
          <div className="min-w-[220px]">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todas">Todas las cuentas</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}</option>)}
            </Select>
          </div>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Todavía no hay planificaciones. Pulsa «Nueva planificación».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cuenta', 'Semana', 'Contenido', 'Actualizada', ''].map((c) => <th key={c} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap"><strong>@{sinArroba(usuarioDe(p.account_id))}</strong></td>
                    <td className="px-3 py-2">{p.titulo}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{plural((p.dias || []).length, 'día', 'días')} · {plural(totalReels(p), 'reel', 'reels')}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtTS(p.updated_at)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className="text-xs underline mr-3" onClick={() => abrir(p)}>Abrir / editar</button>
                      <button className="text-xs underline mr-3" onClick={() => { navigator.clipboard.writeText(textoPlan(p, usuarioDe(p.account_id))).catch(() => {}); setMsg('') ; alert('Texto copiado.') }}>Copiar texto</button>
                      <button className="text-xs underline mr-3" onClick={() => duplicarEstructura(p)}>Duplicar estructura</button>
                      {puedeBorrar && <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(p)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
