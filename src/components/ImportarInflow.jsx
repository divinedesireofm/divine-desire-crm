import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Select } from './ui'

const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Campos del CRM y las palabras que suelen usar los Excel de Inflow para cada uno
const CAMPOS = [
  { id: 'user', n: 'Usuario (@)', re: /(user ?name|usuario|handle|nick|^user$|^@)/ },
  { id: 'nombre', n: 'Nombre del fan', re: /^(name|nombre|display ?name|fan|nombre del fan|full ?name)$/ },
  { id: 'total', n: 'Gasto total ($)', re: /(total ?spen|spent|gasto|lifetime|total|revenue|ingres|amount|importe|net|gross)/ },
  { id: 'ppv', n: 'PPV ($)', re: /(ppv|mensaje|message)/ },
  { id: 'tips', n: 'Tips ($)', re: /(tip|propina)/ },
  { id: 'compras', n: 'Nº de compras', re: /^(?!.*(last|ultim|recent|date|fecha)).*(purchas|compras|orders|pedidos|transactions|transacc)/ },
  { id: 'ultima', n: 'Última compra', re: /(last|ultim|ultima|recent|fecha|date)/ },
  { id: 'modelos', n: 'Modelo', re: /(model|modelo|creator|perfil|profile)/ },
]

function parseMonto(v) {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/[^0-9.,-]/g, '')
  if (!s) return 0
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.')
  if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (c > -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
function parseFecha(v) {
  if (v == null || v === '') return null
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  if (typeof v === 'number') { // serie de Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  const d = new Date(s)
  return isNaN(d) ? null : iso(d)
}
const normUser = (v) => '@' + String(v || '').replace(/[@\s]/g, '')

export default function ImportarInflow({ profileId, cuantos, onDone }) {
  const [abierto, setAbierto] = useState(false)
  const [cab, setCab] = useState([])
  const [filas, setFilas] = useState([])
  const [mapa, setMapa] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function leer(file) {
    setMsg('')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      let mejor = null
      for (const nombre of wb.SheetNames) {
        const hoja = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false })
        // fila de cabecera = la de las 15 primeras con más columnas reconocidas
        for (let r = 0; r < Math.min(15, hoja.length); r++) {
          const puntos = (hoja[r] || []).filter((c) => c != null && CAMPOS.some((f) => f.re.test(norm(c)))).length
          if (!mejor || puntos > mejor.puntos) mejor = { puntos, r, hoja }
        }
      }
      if (!mejor || !mejor.hoja.length) { setMsg('El archivo está vacío.'); return }
      const heads = (mejor.hoja[mejor.r] || []).map((c, i) => (c == null || c === '' ? `Columna ${i + 1}` : String(c)))
      const datos = mejor.hoja.slice(mejor.r + 1).filter((f) => f && f.some((c) => c != null && c !== ''))
      const m = {}
      const usadas = new Set()
      CAMPOS.forEach((f) => {
        const i = heads.findIndex((h, idx) => !usadas.has(idx) && f.re.test(norm(h)))
        if (i > -1) { m[f.id] = String(i); usadas.add(i) }
      })
      setCab(heads); setFilas(datos); setMapa(m); setAbierto(true)
    } catch (e) {
      setMsg('No se pudo leer el archivo: ' + e.message)
    }
  }

  function construir() {
    const get = (f, id) => (mapa[id] === undefined || mapa[id] === '' ? null : f[Number(mapa[id])])
    const vistos = new Map()
    for (const f of filas) {
      const crudo = get(f, 'user') ?? get(f, 'nombre')
      const user = normUser(crudo)
      if (user.length < 2) continue
      const total = parseMonto(get(f, 'total')) || parseMonto(get(f, 'ppv')) + parseMonto(get(f, 'tips'))
      const key = user.slice(1).toLowerCase()
      const prev = vistos.get(key)
      const fila = {
        fan_key: key,
        fan_user: user,
        fan_nombre: get(f, 'nombre') != null ? String(get(f, 'nombre')).trim() : null,
        gasto: Math.round(total * 100) / 100,
        ppv: Math.round(parseMonto(get(f, 'ppv')) * 100) / 100,
        tips: Math.round(parseMonto(get(f, 'tips')) * 100) / 100,
        compras: Math.min(1000000, Math.max(0, Math.round(parseMonto(get(f, 'compras'))))),
        ultima_compra: parseFecha(get(f, 'ultima')),
        modelos: get(f, 'modelos') != null ? String(get(f, 'modelos')).trim() : null,
        importado_por: profileId,
        importado_en: new Date().toISOString(),
      }
      if (!prev || fila.gasto > prev.gasto) vistos.set(key, fila)
    }
    return Array.from(vistos.values()).filter((f) => f.gasto > 0)
  }

  async function importar() {
    const lista = construir()
    if (!lista.length) { setMsg('No hay fans con usuario y gasto mayor que 0. Revisa las columnas elegidas.'); return }
    setBusy(true)
    for (let i = 0; i < lista.length; i += 500) {
      const { error } = await supabase.from('recapture_fans').upsert(lista.slice(i, i + 500), { onConflict: 'fan_key' })
      if (error) { setBusy(false); setMsg('No se pudo importar: ' + error.message); return }
    }
    setBusy(false)
    setAbierto(false); setFilas([]); setCab([])
    setMsg(`Importados ${lista.length} fans de Inflow. Si ya existían, se han actualizado.`)
    onDone && onDone()
  }

  async function borrarTodos() {
    if (!confirm('¿Borrar todos los fans importados de Inflow? Los del ranking de reportes no se tocan.')) return
    const { error } = await supabase.from('recapture_fans').delete().neq('fan_key', '')
    if (error) { setMsg('No se pudo borrar: ' + error.message); return }
    setMsg('Fans importados borrados.')
    onDone && onDone()
  }

  const previa = abierto ? construir() : []

  return (
    <Panel className="p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="font-medium">Importar fans desde Inflow</p>
        <div className="flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { if (e.target.files[0]) leer(e.target.files[0]); e.target.value = '' }} />
            <span className="px-3 py-2 rounded-md text-sm cursor-pointer" style={{ background: 'var(--accent)', color: '#000' }}>Elegir Excel</span>
          </label>
          {cuantos > 0 && <Button variant="danger" onClick={borrarTodos}>Borrar importados</Button>}
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Sube el Excel o CSV que exportas de Inflow. El CRM detecta las columnas y las adapta a su formato; puedes corregirlas antes de importar.
        Ahora hay {cuantos} fans importados. Si un fan está en los reportes y en Inflow, se usa el gasto mayor de los dos (no se suman, para no duplicar).
      </p>
      {msg && <p className="text-sm mt-3">{msg}</p>}

      {abierto && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Columnas detectadas ({filas.length} filas en el archivo)</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            {CAMPOS.map((f) => (
              <div key={f.id}>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{f.n}</label>
                <Select value={mapa[f.id] ?? ''} onChange={(e) => setMapa({ ...mapa, [f.id]: e.target.value })}>
                  <option value="">— no usar —</option>
                  {cab.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Vista previa · se importarán {previa.length} fans (sin usuario o sin gasto se descartan)</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Usuario', 'Nombre', 'Gasto', 'PPV', 'Tips', 'Compras', 'Última compra', 'Modelo'].map((c) => <th key={c} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
              </tr></thead>
              <tbody>
                {previa.slice(0, 5).map((f) => (
                  <tr key={f.fan_key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2">{f.fan_user}</td><td className="px-3 py-2">{f.fan_nombre}</td>
                    <td className="px-3 py-2 tabular-nums">${f.gasto.toFixed(2)}</td><td className="px-3 py-2 tabular-nums">${f.ppv.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums">${f.tips.toFixed(2)}</td><td className="px-3 py-2">{f.compras}</td>
                    <td className="px-3 py-2">{f.ultima_compra || ''}</td><td className="px-3 py-2">{f.modelos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={importar} disabled={busy || !previa.length}>{busy ? 'Importando…' : `Importar ${previa.length} fans`}</Button>
            <Button variant="ghost" onClick={() => { setAbierto(false); setFilas([]) }}>Cancelar</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
