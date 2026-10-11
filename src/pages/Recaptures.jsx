import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { exportCSV } from '../lib/csv'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import ImportarInflow from '../components/ImportarInflow'

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const hoy = () => iso(new Date())
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); return iso(d) }
const fmtF = (s) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const money = (n) => '$' + Number(n || 0).toFixed(2)
function lunesDe(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7 // lunes = 0
  dt.setDate(dt.getDate() - dow)
  return iso(dt)
}
function sumarDias(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return iso(dt)
}
function barajar(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

const PRESETS = [
  { id: 7, n: 'Últimos 7 días' },
  { id: 14, n: 'Últimos 14 días' },
  { id: 30, n: 'Últimos 30 días' },
  { id: 60, n: 'Últimos 60 días' },
  { id: 90, n: 'Últimos 90 días' },
  { id: 0, n: 'Personalizado' },
]

async function traerFilas(desde, hasta, modelo) {
  const filas = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('shift_report_details')
      .select('compras, model_id, models(stage_name), shift_reports!inner(fecha, chatter_id, profiles(full_name))')
      .gte('shift_reports.fecha', desde)
      .lte('shift_reports.fecha', hasta)
      .range(from, from + 999)
    if (modelo && modelo !== 'todos') q = q.eq('model_id', modelo)
    const { data, error } = await q
    if (error || !data) break
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

function agregar(filas, fChatter) {
  const mapa = new Map()
  const quienes = new Map()
  let sin = 0
  for (const d of filas) {
    const chId = d.shift_reports?.chatter_id
    const chNombre = d.shift_reports?.profiles?.full_name || 'Sin nombre'
    if (chId) quienes.set(chId, chNombre)
    if (fChatter !== 'todos' && chId !== fChatter) continue
    const fecha = d.shift_reports?.fecha
    for (const c of d.compras || []) {
      const user = String(c.user || '').trim()
      const monto = Number(c.monto) || 0
      if (user.length < 2 || !(monto > 0)) { sin++; continue }
      const k = user.toLowerCase()
      let e = mapa.get(k)
      if (!e) { e = { user, nombre: c.fan, total: 0, ppv: 0, tips: 0, n: 0, ultima: '', modelos: new Set(), chatters: new Set() }; mapa.set(k, e) }
      e.chatters.add(chNombre)
      e.total += monto
      if (c.tipo === 'tip') e.tips += monto; else e.ppv += monto
      e.n += 1
      if (fecha && fecha >= e.ultima) { e.ultima = fecha; e.nombre = c.fan }
      if (d.models?.stage_name) e.modelos.add(d.models.stage_name)
    }
  }
  return {
    ranking: Array.from(mapa.values()).sort((a, b) => b.total - a.total),
    sinMonto: sin,
    chattersVenta: Array.from(quienes, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

// Une los fans importados de Inflow con los del ranking de reportes (si están en ambos, gana el gasto mayor)
function fusionar(rank, imp) {
  const mapa = new Map(rank.map((r) => [r.user.toLowerCase(), { ...r, origen: 'Reportes' }]))
  for (const f of imp) {
    const k = f.fan_user.toLowerCase()
    const e = mapa.get(k)
    const g = Number(f.gasto) || 0
    const mods = String(f.modelos || '').split(',').map((x) => x.trim()).filter(Boolean)
    if (!e) {
      mapa.set(k, { user: f.fan_user, nombre: f.fan_nombre || '', total: g, ppv: Number(f.ppv) || 0, tips: Number(f.tips) || 0, n: f.compras || 0, ultima: f.ultima_compra || '', modelos: new Set(mods), chatters: new Set(), origen: 'Inflow' })
    } else {
      e.origen = 'Reportes + Inflow'
      if (g > e.total) { e.total = g; e.ppv = Number(f.ppv) || e.ppv; e.tips = Number(f.tips) || e.tips }
      if (f.compras > e.n) e.n = f.compras
      if (f.ultima_compra && f.ultima_compra > e.ultima) e.ultima = f.ultima_compra
      e.modelos = new Set([...e.modelos, ...mods])
      if (!e.nombre && f.fan_nombre) e.nombre = f.fan_nombre
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}

export default function Recaptures() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])

  // ---- ranking de fans
  const [preset, setPreset] = useState(30)
  const [desde, setDesde] = useState(hace(30))
  const [hasta, setHasta] = useState(hoy())
  const [modelos, setModelos] = useState([])
  const [fModelo, setFModelo] = useState('todos')
  const [fChatter, setFChatter] = useState('todos')
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)

  // ---- asignación semanal
  const [semana, setSemana] = useState(lunesDe(hoy()))
  const [asign, setAsign] = useState([])
  const [chatters, setChatters] = useState([])
  const [selChat, setSelChat] = useState(null) // null = todos
  const [porChatter, setPorChatter] = useState(10)
  const [minGasto, setMinGasto] = useState('')
  const [noRepetir, setNoRepetir] = useState(true)
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [importados, setImportados] = useState([])
  const [incluirImp, setIncluirImp] = useState(true)
  const [pestana, setPestana] = useState('asignados')

  useEffect(() => {
    if (!esMgr) return
    supabase.from('models').select('id, stage_name').order('stage_name').then(({ data }) => setModelos(data || []))
    getProfilesByRoles(['chatter'], { onlyActive: true }).then((cs) => setChatters(cs || []))
  }, [esMgr])

  async function cargarImportados() {
    const { data } = await supabase.from('recapture_fans').select('*').limit(20000)
    setImportados(data || [])
  }
  useEffect(() => { if (esMgr) cargarImportados() }, [esMgr])

  function cambiarPreset(v) {
    const n = Number(v)
    setPreset(n)
    if (n > 0) { setDesde(hace(n)); setHasta(hoy()) }
  }

  async function cargarRanking() {
    setCargando(true)
    setFilas(await traerFilas(desde, hasta, fModelo))
    setCargando(false)
  }
  useEffect(() => { if (esMgr) cargarRanking() }, [esMgr, desde, hasta, fModelo])

  // El ranking se calcula en el momento con el chatter elegido, sin volver a pedir datos
  const base = useMemo(() => agregar(filas, fChatter), [filas, fChatter])
  const usaImp = incluirImp && fModelo === 'todos'
  const { sinMonto, chattersVenta } = base
  const ranking = useMemo(() => fusionar(base.ranking, usaImp && fChatter === 'todos' ? importados : []), [base, importados, usaImp, fChatter])
  // Fans que se pueden repartir: siempre los de todos los chatters (el filtro de chatter es solo para ver el ranking)
  const poolFans = useMemo(() => (fChatter === 'todos' ? ranking : fusionar(agregar(filas, 'todos').ranking, usaImp ? importados : [])), [ranking, filas, importados, usaImp, fChatter])

  // ---- asignaciones de la semana
  async function cargarAsign() {
    const { data, error } = await supabase.from('recapture_assignments').select('*').eq('semana', semana).order('gasto', { ascending: false })
    if (error) { setGenMsg('No se pudo cargar el reparto: ' + error.message); return [] }
    const filasA = data || []
    const ids = Array.from(new Set(filasA.map((a) => a.chatter_id)))
    let nombres = new Map()
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      nombres = new Map((ps || []).map((p) => [p.id, p.full_name]))
    }
    const conNombre = filasA.map((a) => ({ ...a, profiles: { full_name: nombres.get(a.chatter_id) || '' } }))
    setAsign(conNombre)
    return conNombre
  }
  useEffect(() => { cargarAsign() }, [semana])

  const chattersElegidos = selChat === null ? chatters.map((c) => c.id) : selChat
  function toggleChatter(id) {
    const actual = selChat === null ? chatters.map((c) => c.id) : selChat
    setSelChat(actual.includes(id) ? actual.filter((x) => x !== id) : actual.concat([id]))
  }

  // Reparto común: conserva lo ya marcado, borra lo pendiente de los chatters elegidos y guarda lo nuevo.
  // modo 'azar': k fans por chatter al azar. modo 'auto': reparte TODOS los fans del periodo a partes iguales.
  async function repartir(modo) {
    setGenMsg('')
    if (!chattersElegidos.length) { setGenMsg('Elige al menos un chatter.'); return }
    setGenBusy(true)
    const actuales = await cargarAsign()
    const elegidos = new Set(chattersElegidos)
    const mantener = actuales.filter((a) => a.hecho || !elegidos.has(a.chatter_id))
    const borrar = actuales.filter((a) => !a.hecho && elegidos.has(a.chatter_id))
    if (borrar.length) {
      const hechos = actuales.filter((a) => a.hecho).length
      const ok = confirm(`La recaptación anterior no se ha completado: quedan ${borrar.length} fans sin escribir (${hechos} ya escritos de ${actuales.length} asignados esta semana).\n\nSi continúas, esos ${borrar.length} fans pendientes se sustituyen por otros nuevos.\n\n¿Seguro que quieres hacer una nueva asignación?`)
      if (!ok) { setGenBusy(false); setGenMsg('Asignación cancelada, no se ha cambiado nada.'); return }
    }
    const excluir = new Set(mantener.map((a) => a.fan_user.toLowerCase()))
    if (noRepetir) {
      const { data: previas } = await supabase.from('recapture_assignments').select('fan_user').gte('semana', sumarDias(semana, -28)).lt('semana', semana)
      ;(previas || []).forEach((a) => excluir.add(a.fan_user.toLowerCase()))
    }
    const minimo = parseFloat(minGasto) || 0
    const disponibles = poolFans.filter((f) => f.total >= minimo && !excluir.has(f.user.toLowerCase()))
    const nuevas = []
    const fila = (id, f) => ({ semana, chatter_id: id, fan_user: f.user, fan_nombre: f.nombre, gasto: Math.round(f.total * 100) / 100, modelos: Array.from(f.modelos).join(', '), ultima_compra: f.ultima || null, asignado_por: profile.id })
    let faltan = 0
    if (modo === 'auto') {
      const n = chattersElegidos.length
      const M = disponibles.length
      const cupo = new Map(chattersElegidos.map((id, i) => [id, Math.floor(M / n) + (i < M % n ? 1 : 0)]))
      const suma = new Map(chattersElegidos.map((id) => [id, 0]))
      for (const f of disponibles) { // ya vienen de mayor a menor gasto: cada fan va al chatter con menos gasto acumulado
        const id = chattersElegidos.filter((x) => cupo.get(x) > 0).sort((x, y) => suma.get(x) - suma.get(y))[0]
        if (!id) break
        nuevas.push(fila(id, f))
        cupo.set(id, cupo.get(id) - 1)
        suma.set(id, suma.get(id) + f.total)
      }
    } else {
      const k = Math.max(1, parseInt(porChatter, 10) || 0)
      const pool = barajar(disponibles)
      const necesita = new Map(chattersElegidos.map((id) => [id, Math.max(0, k - mantener.filter((a) => a.chatter_id === id).length)]))
      let hayMas = true
      while (hayMas && pool.length) {
        hayMas = false
        for (const id of chattersElegidos) {
          if (!pool.length) break
          if ((necesita.get(id) || 0) > 0) {
            nuevas.push(fila(id, pool.pop()))
            necesita.set(id, necesita.get(id) - 1)
            hayMas = true
          }
        }
      }
      faltan = Array.from(necesita.values()).reduce((a, b) => a + b, 0)
    }
    let error = null
    if (borrar.length) ({ error } = await supabase.from('recapture_assignments').delete().in('id', borrar.map((a) => a.id)))
    if (!error && nuevas.length) ({ error } = await supabase.from('recapture_assignments').insert(nuevas))
    setGenBusy(false)
    if (error) { setGenMsg('No se pudo guardar la asignación: ' + error.message); await cargarAsign(); return }
    setGenMsg(nuevas.length
      ? `Asignados ${nuevas.length} fans.${faltan > 0 ? ` No había fans suficientes para completar ${faltan} puestos (prueba con un rango más amplio o quitando el mínimo).` : ''} Míralos en la pestaña "Fans asignados".`
      : 'No hay fans disponibles con estos criterios. Amplía el rango de fechas o baja el mínimo.')
    cargarAsign()
  }
  const generar = () => repartir('azar')
  const autoAsignar = () => repartir('auto')

  async function marcar(a, hecho) {
    setAsign((rs) => rs.map((x) => (x.id === a.id ? { ...x, hecho, hecho_en: hecho ? new Date().toISOString() : null } : x)))
    const { error } = await supabase.from('recapture_assignments').update({ hecho, hecho_en: hecho ? new Date().toISOString() : null, hecho_por: hecho ? profile.id : null }).eq('id', a.id)
    if (error) { alert('No se pudo guardar.'); cargarAsign() }
  }
  async function quitar(a) {
    if (!confirm(`¿Quitar a ${a.fan_user} de la lista de esta semana?`)) return
    await supabase.from('recapture_assignments').delete().eq('id', a.id)
    setAsign((rs) => rs.filter((x) => x.id !== a.id))
  }

  const grupos = useMemo(() => {
    const g = new Map()
    asign.forEach((a) => {
      const k = a.chatter_id
      if (!g.has(k)) g.set(k, { id: k, nombre: a.profiles?.full_name || 'Sin nombre', items: [] })
      g.get(k).items.push(a)
    })
    const arr = Array.from(g.values())
    arr.sort((a, b) => (a.id === profile.id ? -1 : b.id === profile.id ? 1 : a.nombre.localeCompare(b.nombre)))
    return arr
  }, [asign, profile])

  function exportar() {
    exportCSV('recaptaciones_ranking', ranking, [
      { label: '#', get: (r) => ranking.indexOf(r) + 1 },
      { label: 'Usuario', key: 'user' },
      { label: 'Nombre', key: 'nombre' },
      { label: 'Gasto total', get: (r) => r.total.toFixed(2) },
      { label: 'PPV', get: (r) => r.ppv.toFixed(2) },
      { label: 'Tips', get: (r) => r.tips.toFixed(2) },
      { label: 'Compras', key: 'n' },
      { label: 'Última compra', get: (r) => fmtF(r.ultima) },
      { label: 'Modelos', get: (r) => Array.from(r.modelos).join(', ') },
      { label: 'Chatter', get: (r) => Array.from(r.chatters).join(', ') },
      { label: 'Origen', key: 'origen' },
    ])
  }

  const esSemanaActual = semana === lunesDe(hoy())

  const barraPeriodo = (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Periodo de compras</label>
        <Select value={preset} onChange={(e) => cambiarPreset(e.target.value)}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.n}</option>)}
        </Select>
      </div>
      {preset === 0 && (
        <>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Desde</label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Hasta</label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </>
      )}
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Modelo</label>
        <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
          <option value="todos">Todas</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Recaptaciones"
        subtitle={esMgr ? 'Reparto semanal de fans a recuperar entre los chatters y ranking de fans por gasto.' : 'Los fans que te tocan esta semana. Marca cada uno cuando le hayas escrito.'}
      />

      {esMgr && (
        <div className="flex gap-2 mb-5">
          {[['asignados', 'Fans asignados'], ['reparto', 'Repartir fans'], ['ranking', 'Ranking de fans']].map(([id, n]) => (
            <button key={id} type="button" onClick={() => setPestana(id)} className="px-4 py-2 rounded-md text-sm"
              style={{ background: pestana === id ? 'var(--accent-soft)' : 'var(--panel)', border: `1px solid ${pestana === id ? 'var(--accent)' : 'var(--border)'}`, color: pestana === id ? 'var(--accent)' : 'var(--text)' }}>
              {n}
            </button>
          ))}
        </div>
      )}

      {/* ---------- Fans asignados (semana) ---------- */}
      {(!esMgr || pestana === 'asignados') && (
      <Panel className="p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="font-medium">Fans asignados · semana del {fmtF(semana)}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, -7))}>←</Button>
            <Button variant="ghost" onClick={() => setSemana(lunesDe(hoy()))} disabled={esSemanaActual}>Esta semana</Button>
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, 7))}>→</Button>
          </div>
        </div>

        {grupos.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {esMgr ? 'Aún no hay fans repartidos esta semana.' : 'Todavía no te han asignado fans esta semana.'}
          </p>
        ) : grupos.map((g) => {
          const hechos = g.items.filter((a) => a.hecho).length
          return (
            <div key={g.id} className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <strong>{g.id === profile.id ? 'Mis fans' : g.nombre}</strong>
                <span className="text-xs px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: hechos === g.items.length ? 'var(--success)22' : 'var(--accent-soft)', color: hechos === g.items.length ? 'var(--success)' : 'var(--accent)' }}>
                  {hechos}/{g.items.length} escritos
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div style={{ width: `${(100 * hechos) / g.items.length}%`, height: '100%', background: 'var(--success)' }} />
                </div>
              </div>
              <div className="space-y-1">
                {g.items.map((a) => {
                  const puedeMarcar = esMgr || a.chatter_id === profile.id
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm" style={{ background: a.hecho ? 'var(--success)11' : 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <input
                        type="checkbox"
                        checked={!!a.hecho}
                        disabled={!puedeMarcar}
                        onChange={(e) => marcar(a, e.target.checked)}
                        aria-label={`Ya he escrito a ${a.fan_user}`}
                        style={{ width: 22, height: 22, accentColor: 'var(--success)', flex: 'none' }}
                      />
                      <div className="min-w-0 flex-1" style={{ opacity: a.hecho ? 0.65 : 1 }}>
                        <div className="truncate"><strong>{a.fan_user}</strong> {a.fan_nombre && <span style={{ color: 'var(--text-muted)' }}>{a.fan_nombre}</span>}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Gastó {money(a.gasto)}{a.modelos ? ` · ${a.modelos}` : ''}{a.ultima_compra ? ` · última compra ${fmtF(a.ultima_compra)}` : ''}
                          {a.hecho && a.hecho_en ? ` · escrito el ${new Date(a.hecho_en).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}` : ''}
                        </div>
                      </div>
                      <CopyButton text={a.fan_user.replace(/^@+/, '')} label="Copiar usuario" />
                      {esMgr && <button onClick={() => quitar(a)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Quitar</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </Panel>
      )}

      {/* ---------- Reparto y ranking ---------- */}
      {esMgr && pestana === 'reparto' && (
      <Panel className="p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="font-medium">Reparto · semana del {fmtF(semana)}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, -7))}>←</Button>
            <Button variant="ghost" onClick={() => setSemana(lunesDe(hoy()))} disabled={esSemanaActual}>Esta semana</Button>
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, 7))}>→</Button>
          </div>
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Los fans a repartir salen de las compras de este periodo (el mismo que usa el ranking):</p>
        {barraPeriodo}
        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
          <input type="checkbox" checked={incluirImp} onChange={(e) => setIncluirImp(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
          Incluir los {importados.length} fans importados de Inflow {fModelo !== 'todos' ? '(se ignoran al filtrar por modelo)' : ''}
        </label>
        {esMgr && (
          <div className="p-4 rounded-md mb-5" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium mb-3">Repartir fans al azar</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Se sortean entre los fans del periodo elegido arriba. Si ya hay reparto esta semana, se sustituyen solo los fans que aún no se han marcado como escritos.
            </p>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Chatters que participan</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {chatters.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No hay chatters activos.</span>}
              {chatters.map((c) => {
                const on = chattersElegidos.includes(c.id)
                return (
                  <button key={c.id} type="button" onClick={() => toggleChatter(c.id)} className="px-3 py-1.5 rounded-full text-sm"
                    style={{ background: on ? 'var(--accent-soft)' : 'var(--panel)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}>
                    {c.full_name}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fans por chatter</label>
                <Input type="number" min="1" value={porChatter} onChange={(e) => setPorChatter(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Gasto mínimo del fan ($, opcional)</label>
                <Input type="number" min="0" step="0.01" placeholder="0" value={minGasto} onChange={(e) => setMinGasto(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer">
                <input type="checkbox" checked={noRepetir} onChange={(e) => setNoRepetir(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                No repetir fans de las últimas 4 semanas
              </label>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={generar} disabled={genBusy || cargando}>{genBusy ? 'Repartiendo…' : asign.length ? 'Volver a repartir' : 'Repartir fans'}</Button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fans disponibles en el periodo: {poolFans.length}</span>
            </div>
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-sm font-medium mb-1">Auto-asignación</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Reparte todos los fans del periodo elegido arriba a partes iguales entre los chatters marcados arriba, equilibrando también el gasto (respeta el gasto mínimo y la opción de no repetir).
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <Button onClick={autoAsignar} disabled={genBusy || cargando}>{genBusy ? 'Repartiendo…' : 'Auto-asignar'}</Button>
              </div>
            </div>
            {genMsg && <p className="text-sm mt-3">{genMsg}</p>}
          </div>
        )}

      </Panel>
      )}

      {/* ---------- Ranking de fans ---------- */}
      {esMgr && pestana === 'ranking' && (
      <>
      <ImportarInflow profileId={profile.id} cuantos={importados.length} onDone={cargarImportados} />
      <Panel className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <p className="font-medium">Ranking de fans por gasto</p>
            <Button variant="ghost" onClick={exportar} disabled={!ranking.length}>Exportar a Excel</Button>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Se calcula con las compras anotadas en los reportes de turno (nombre, @usuario, cantidad y tipo). Los reportes anteriores a que se anotaran las cantidades no cuentan.
          </p>
          {barraPeriodo}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Chatter que hizo la venta</label>
              <Select value={fChatter} onChange={(e) => setFChatter(e.target.value)}>
                <option value="todos">Todos</option>
                {chattersVenta.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer sm:col-span-2">
              <input type="checkbox" checked={incluirImp} onChange={(e) => setIncluirImp(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
              Incluir fans importados de Inflow
            </label>
          </div>

          {cargando ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Calculando…</p>
          ) : ranking.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay compras con usuario y cantidad en este periodo.</p>
          ) : (
            <>
              <p className="text-xs mb-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {ranking.length} fans · {money(ranking.reduce((a, r) => a + r.total, 0))} en total
                {sinMonto > 0 ? ` · ${sinMonto} compras ignoradas por falta de @usuario o cantidad` : ''}
              </p>
              <div className="overflow-x-auto" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Usuario', 'Nombre', 'Gasto', 'PPV', 'Tips', 'Compras', 'Última compra', 'Modelos', 'Chatter', 'Origen'].map((c) => (
                        <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--panel)' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.slice(0, 500).map((r, i) => (
                      <tr key={r.user} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap"><strong>{r.user}</strong> <button type="button" onClick={() => navigator.clipboard.writeText(r.user.replace(/^@+/, '')).catch(() => {})} className="text-xs ml-1 hover:underline" style={{ color: 'var(--accent)' }}>copiar</button></td>
                        <td className="px-3 py-2">{r.nombre}</td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--success)' }}><strong>{money(r.total)}</strong></td>
                        <td className="px-3 py-2 tabular-nums">{money(r.ppv)}</td>
                        <td className="px-3 py-2 tabular-nums">{money(r.tips)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.n}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtF(r.ultima)}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{Array.from(r.modelos).join(', ')}</td>
                        <td className="px-3 py-2">{Array.from(r.chatters).join(', ')}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{r.origen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ranking.length > 500 && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Se muestran los 500 primeros. El Excel incluye todos.</p>}
            </>
          )}
        </Panel>
      </>
      )}
    </div>
  )
}
