import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

function proximaOcurrencia(fechaISO, recurrente) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const f = new Date(fechaISO + 'T00:00:00')
  if (!recurrente) return f
  const candidata = new Date(hoy.getFullYear(), f.getMonth(), f.getDate())
  if (candidata < hoy) candidata.setFullYear(candidata.getFullYear() + 1)
  return candidata
}
function diasHasta(d) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((d - hoy) / (1000 * 60 * 60 * 24))
}
function fmtFecha(d) { return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }) }

// ---------- Festividades importantes ----------
// Fijas (se repiten cada año) y móviles (se calculan para cada año). Se añaden con el botón «Añadir festividades».
const FIJAS = [
  ['01-01', 'Año Nuevo', 'Global'],
  ['01-06', 'Día de Reyes', 'España'],
  ['02-14', 'San Valentín', 'Global · fecha clave para promociones y masivos temáticos'],
  ['03-08', 'Día Internacional de la Mujer', 'Global'],
  ['03-17', 'San Patricio', 'EE. UU.'],
  ['03-19', 'Día del Padre', 'España'],
  ['04-19', 'Declaración de la Independencia de Venezuela', 'Venezuela · festivo, revisar turnos del equipo'],
  ['05-01', 'Día del Trabajo', 'España y Venezuela · festivo, revisar turnos'],
  ['05-05', 'Cinco de Mayo', 'EE. UU. y México'],
  ['06-24', 'Batalla de Carabobo', 'Venezuela · festivo, revisar turnos'],
  ['07-04', 'Día de la Independencia de EE. UU.', 'EE. UU.'],
  ['07-05', 'Día de la Independencia de Venezuela', 'Venezuela · festivo, revisar turnos'],
  ['07-24', 'Natalicio de Simón Bolívar', 'Venezuela · festivo, revisar turnos'],
  ['08-15', 'Asunción de la Virgen', 'España · festivo'],
  ['10-12', 'Fiesta Nacional de España / Día de la Resistencia Indígena', 'España y Venezuela · festivo, revisar turnos'],
  ['10-31', 'Halloween', 'Global · fecha fuerte para contenido temático'],
  ['11-01', 'Todos los Santos', 'España · festivo'],
  ['11-11', 'Día del Soltero', 'Global'],
  ['12-08', 'Inmaculada Concepción', 'España · festivo'],
  ['12-24', 'Nochebuena', 'Global · revisar turnos'],
  ['12-25', 'Navidad', 'Global · revisar turnos'],
  ['12-31', 'Nochevieja', 'Global · revisar turnos'],
]
const isoF = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
// n-ésimo día de la semana (0=dom…6=sáb) de un mes; n=-1 → el último
function nEsimo(y, m, dow, n) {
  if (n > 0) { const d = new Date(y, m, 1); d.setDate(1 + ((dow - d.getDay() + 7) % 7) + (n - 1) * 7); return d }
  const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7)); return d
}
// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mes - 1, dia)
}
const sumar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function moviles(y) {
  const p = pascua(y)
  const accion = nEsimo(y, 10, 4, 4) // 4.º jueves de noviembre
  return [
    [isoF(sumar(p, -2)), 'Viernes Santo', 'España · festivo'],
    [isoF(p), 'Domingo de Pascua', 'Global'],
    [isoF(nEsimo(y, 4, 0, 1)), 'Día de la Madre (España)', 'España · primer domingo de mayo'],
    [isoF(nEsimo(y, 4, 0, 2)), 'Día de la Madre (EE. UU. y Venezuela)', 'Segundo domingo de mayo · fecha fuerte'],
    [isoF(nEsimo(y, 4, 1, -1)), 'Memorial Day', 'EE. UU.'],
    [isoF(nEsimo(y, 5, 0, 3)), 'Día del Padre (EE. UU.)', 'EE. UU. · tercer domingo de junio'],
    [isoF(nEsimo(y, 8, 1, 1)), 'Labor Day', 'EE. UU.'],
    [isoF(accion), 'Acción de Gracias', 'EE. UU.'],
    [isoF(sumar(accion, 1)), 'Black Friday', 'Global · fecha fuerte para promos'],
    [isoF(sumar(accion, 4)), 'Cyber Monday', 'Global · fecha fuerte para promos'],
  ]
}
// Lista de festividades que faltan por añadir (solo futuras): fijas una vez (recurrentes) y móviles de este año y el siguiente
function festividadesPendientes(existentes) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const hoyISO = isoF(hoy)
  const ya = new Set(existentes.map((r) => r.titulo.trim().toLowerCase()))
  const yaFecha = new Set(existentes.map((r) => r.titulo.trim().toLowerCase() + '|' + r.fecha))
  const out = []
  FIJAS.forEach(([md, titulo, notas]) => {
    if (ya.has(titulo.toLowerCase())) return
    let y = hoy.getFullYear()
    if (`${y}-${md}` < hoyISO) y += 1
    out.push({ titulo, fecha: `${y}-${md}`, recurrente: true, notas })
  })
  ;[hoy.getFullYear(), hoy.getFullYear() + 1].forEach((y) => {
    moviles(y).forEach(([fecha, titulo, notas]) => {
      if (fecha < hoyISO || yaFecha.has(titulo.toLowerCase() + '|' + fecha)) return
      out.push({ titulo, fecha, recurrente: false, notas })
    })
  })
  return out
}

const EMPTY = { titulo: '', fecha: '', recurrente: true, notas: '' }

export default function ImportantDates() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [sembrando, setSembrando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('important_dates').select('*')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.fecha) return
    await supabase.from('important_dates').insert([{ ...form, titulo: form.titulo.trim(), creado_por: profile.id }])
    setForm(EMPTY)
    setShowForm(false)
    load()
  }

  async function anadirFestividades() {
    const nuevas = festividadesPendientes(rows)
    if (!nuevas.length) { setAviso('Ya tienes todas las festividades añadidas.'); return }
    setSembrando(true)
    const { error } = await supabase.from('important_dates').insert(nuevas.map((n) => ({ ...n, creado_por: profile.id })))
    setSembrando(false)
    setAviso(error ? 'No se pudieron añadir: ' + error.message : `Se han añadido ${nuevas.length} festividades.`)
    load()
  }

  async function borrar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"?`)) return
    await supabase.from('important_dates').delete().eq('id', r.id)
    load()
  }

  const conProxima = rows
    .map((r) => ({ ...r, _proxima: proximaOcurrencia(r.fecha, r.recurrente), _dias: diasHasta(proximaOcurrencia(r.fecha, r.recurrente)) }))
    .sort((a, b) => ((a._dias < 0) - (b._dias < 0)) || (a._proxima - b._proxima))

  return (
    <div>
      <PageHeader
        title="Fechas importantes"
        subtitle="Cumpleaños, festividades y fechas especiales del equipo o de las modelos."
        action={puedeGestionar && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={anadirFestividades} disabled={sembrando}>{sembrando ? 'Añadiendo…' : '+ Festividades importantes'}</Button>
            <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir fecha'}</Button>
          </div>
        )}
      />

      {aviso && <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{aviso}</p>}
      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Título (ej: Cumpleaños de Lily)" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.recurrente} onChange={(e) => setForm({ ...form, recurrente: e.target.checked })} />
              Se repite cada año (cumpleaños, aniversario...)
            </label>
            <Input className="sm:col-span-2" placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            <Button type="submit" className="sm:col-span-2">Guardar</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : conProxima.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin fechas guardadas todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {conProxima.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtFecha(r._proxima)}{r._proxima.getFullYear() !== new Date().getFullYear() ? ' ' + r._proxima.getFullYear() : ''}{r.notas ? ` · ${r.notas}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: r._dias <= 7 ? 'var(--danger)22' : 'var(--panel-alt)', color: r._dias <= 7 ? 'var(--danger)' : 'var(--text-muted)' }}
                  >
                    {r._dias < 0 ? 'pasada' : r._dias === 0 ? '¡Hoy!' : r._dias === 1 ? 'Mañana' : `en ${r._dias} días`}
                  </span>
                  {puedeGestionar && (
                    <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
