import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { iaCallJSON, getVoiceGuide, withVoiceGuide } from '../lib/ai'
import ReelsModelo from './ReelsModelo'

const EMPTY = { titulo: '', categoria: '', fecha_publicacion: '', reproducciones: '', alcance: '', visitas_perfil: '', seguidores_ganados: '', riesgo_restriccion: false, notas: '' }
const CATEGORIAS = ['rol', 'pregunta_fan', 'chiste_texto', 'cuerpo_estetica', 'romantico', 'humor_remate', 'otro']
const CATEGORIA_LABEL = { rol: 'Rol / personaje', pregunta_fan: 'Responde pregunta de fan', chiste_texto: 'Chiste de texto', cuerpo_estetica: 'Cuerpo y estética', romantico: 'Conexión romántica', humor_remate: 'Humor con remate', otro: 'Otro' }

const REGLAS_REELS = `Eres el analista de reels de Instagram de la agencia Divine Desire. Sigues estas reglas aprendidas, son innegociables:
1. Las reproducciones (views) ENGAÑAN — la métrica clave es "seguidores ganados por cada 1.000 de alcance". Referencia de un buen reel: 12-20 seguidores por cada 1.000 de alcance. Un reel con millones de reproducciones pero pocos seguidores/1.000 es un fracaso disfrazado de éxito.
2. Lo que se comparte no es lo que hace seguir. Un reel muy compartido (humor, remate gracioso) puede traer alcance sin traer seguidores; un reel de conexión personal (responde a un fan, habla a cámara con cercanía) suele convertir mejor en seguidores aunque llegue a menos gente.
3. Marca como riesgo cualquier reel con texto de solicitación explícita ("sácatela", frases sexuales directas a cámara) — esto arriesga restricciones de la cuenta, independientemente de lo bien que funcione.
4. Sé directo y concreto. Compara reels entre sí, no los evalúes aislados.`

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 }) }
function ratio(n, d, mult = 1) { if (!n || !d) return null; return (Number(n) / Number(d)) * mult }

// La cuenta solo-modelo ve las planificaciones que le han enviado; el equipo ve el registro de reels.
export default function Reels() {
  const { hasRole, hasAnyRole } = useAuth()
  const soloModelo = hasRole('modelo') && !hasAnyRole(['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'])
  return soloModelo ? <ReelsModelo /> : <ReelsEquipo />
}

function ReelsEquipo() {
  const { hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'ig_manager', 'ig_assistant'])
  const [cuentas, setCuentas] = useState([])
  const [cuentaId, setCuentaId] = useState('')
  const [reels, setReels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const [analisis, setAnalisis] = useState(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErr, setIaErr] = useState('')

  async function loadCuentas() {
    const { data } = await supabase.from('instagram_accounts').select('id, username, models(stage_name)').order('username')
    setCuentas(data || [])
    if (data?.length && !cuentaId) setCuentaId(data[0].id)
  }
  async function loadReels(id) {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('reels').select('*').eq('account_id', id).order('fecha_publicacion', { ascending: false })
    setReels(data || [])
    setLoading(false)
    setAnalisis(null)
  }
  useEffect(() => { loadCuentas() }, [])
  useEffect(() => { loadReels(cuentaId) }, [cuentaId])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!form.titulo.trim()) { setError('Ponle un título al reel.'); return }
    const payload = {
      account_id: cuentaId,
      titulo: form.titulo.trim(),
      categoria: form.categoria || null,
      fecha_publicacion: form.fecha_publicacion || new Date().toISOString().slice(0, 10),
      reproducciones: form.reproducciones ? parseInt(form.reproducciones) : null,
      alcance: form.alcance ? parseInt(form.alcance) : null,
      visitas_perfil: form.visitas_perfil ? parseInt(form.visitas_perfil) : null,
      seguidores_ganados: form.seguidores_ganados ? parseInt(form.seguidores_ganados) : null,
      riesgo_restriccion: form.riesgo_restriccion,
      notas: form.notas || null,
    }
    const { error } = await supabase.from('reels').insert([payload])
    if (error) { setError('No se pudo guardar.'); return }
    setForm(EMPTY)
    setShowForm(false)
    loadReels(cuentaId)
  }

  async function borrar(r) {
    if (!confirm(`¿Eliminar el reel "${r.titulo}"?`)) return
    await supabase.from('reels').delete().eq('id', r.id)
    loadReels(cuentaId)
  }

  async function generarDiagnostico() {
    setIaBusy(true); setIaErr(''); setAnalisis(null)
    try {
      const cuenta = cuentas.find((c) => c.id === cuentaId)
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(REGLAS_REELS, guia)
      const datos = reels.map((r) => ({
        titulo: r.titulo, categoria: r.categoria, fecha: r.fecha_publicacion,
        reproducciones: r.reproducciones, alcance: r.alcance, visitas_perfil: r.visitas_perfil,
        seguidores_ganados: r.seguidores_ganados,
        seguidores_por_1000: ratio(r.seguidores_ganados, r.alcance, 1000)?.toFixed(2),
        riesgo_restriccion: r.riesgo_restriccion,
      }))
      const resultado = await iaCallJSON(system, [{ role: 'user', content: `Cuenta: ${cuenta?.username}\n\nReels:\n${JSON.stringify(datos, null, 0)}` }], {
        tool_name: 'entregar_diagnostico',
        tool_description: 'Entrega el diagnóstico de los reels.',
        schema: {
          type: 'object',
          properties: {
            resumen: { type: 'string', description: '2-4 frases' },
            mejores_formatos: { type: 'array', items: { type: 'string' }, description: 'Qué formatos están funcionando mejor y por qué' },
            evitar: { type: 'array', items: { type: 'string' }, description: 'Qué formatos o elementos evitar' },
            plan_accion: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, detalle: { type: 'string' } }, required: ['titulo', 'detalle'] } },
          },
          required: ['resumen', 'mejores_formatos', 'evitar', 'plan_accion'],
        },
      }, 1500)
      setAnalisis(resultado)
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  const conRatios = reels.map((r) => ({
    ...r,
    _por1000: ratio(r.seguidores_ganados, r.alcance, 1000),
    _pctVisitasAlcance: ratio(r.visitas_perfil, r.alcance, 100),
    _pctSegVisitas: ratio(r.seguidores_ganados, r.visitas_perfil, 100),
  })).sort((a, b) => (b._por1000 ?? -1) - (a._por1000 ?? -1))

  return (
    <div>
      <PageHeader
        title="Envío de reels"
        subtitle="Qué se ha publicado en cada cuenta y cómo ha rendido de verdad — los seguidores por cada 1.000 de alcance, no las reproducciones."
        action={puedeGestionar && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={generarDiagnostico} disabled={iaBusy || reels.length === 0}>{iaBusy ? 'Analizando…' : '✨ Diagnóstico con IA'}</Button>
            <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir reel'}</Button>
          </div>
        )}
      />

      <div className="mb-6 max-w-xs">
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username} {c.models?.stage_name ? `(${c.models.stage_name})` : ''}</option>)}
        </Select>
      </div>

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input className="sm:col-span-2" placeholder="Título del reel" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Input type="date" value={form.fecha_publicacion} onChange={(e) => setForm({ ...form, fecha_publicacion: e.target.value })} />
            <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="">Formato…</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </Select>
            <Input type="number" placeholder="Reproducciones" value={form.reproducciones} onChange={(e) => setForm({ ...form, reproducciones: e.target.value })} />
            <Input type="number" placeholder="Alcance" value={form.alcance} onChange={(e) => setForm({ ...form, alcance: e.target.value })} />
            <Input type="number" placeholder="Visitas al perfil" value={form.visitas_perfil} onChange={(e) => setForm({ ...form, visitas_perfil: e.target.value })} />
            <Input type="number" placeholder="Seguidores ganados" value={form.seguidores_ganados} onChange={(e) => setForm({ ...form, seguidores_ganados: e.target.value })} />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.riesgo_restriccion} onChange={(e) => setForm({ ...form, riesgo_restriccion: e.target.checked })} />
              Contiene texto/frases de riesgo de restricción
            </label>
            <textarea
              value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas (opcional)" rows={2}
              className="sm:col-span-3 w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {error && <p className="sm:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="sm:col-span-3">Guardar</Button>
          </form>
        </Panel>
      )}

      {iaErr && <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{iaErr}</p>}

      {analisis && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">📋 Resumen</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{analisis.resumen}</p>
          {analisis.mejores_formatos?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">✅ Lo que funciona</p>
              <ul className="text-sm mb-4 list-disc pl-5" style={{ color: 'var(--text-muted)' }}>
                {analisis.mejores_formatos.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </>
          )}
          {analisis.evitar?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">⚠️ Evitar</p>
              <ul className="text-sm mb-4 list-disc pl-5" style={{ color: 'var(--danger)' }}>
                {analisis.evitar.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </>
          )}
          {analisis.plan_accion?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">🎯 Plan de acción</p>
              <div className="space-y-2">
                {analisis.plan_accion.map((a, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                    <span className="font-display font-semibold gold-text">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{a.detalle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : conRatios.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin reels registrados para esta cuenta todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Reel', 'Formato', 'Fecha', 'Reproducciones', 'Alcance', 'Seg./1000 alcance', '% visitas/alcance', '% seg./visitas', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conRatios.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: r.riesgo_restriccion ? 'var(--danger)11' : 'transparent' }}>
                    <td className="px-3 py-2">
                      {r.titulo}
                      {r.riesgo_restriccion && <span className="ml-1" title="Riesgo de restricción">⚠️</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{CATEGORIA_LABEL[r.categoria] || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{r.fecha_publicacion}</td>
                    <td className="px-3 py-2">{fmtEs(r.reproducciones)}</td>
                    <td className="px-3 py-2">{fmtEs(r.alcance)}</td>
                    <td className="px-3 py-2">
                      <strong style={{ color: r._por1000 >= 12 ? 'var(--success)' : r._por1000 !== null ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {r._por1000 !== null ? r._por1000.toFixed(1) : '—'}
                      </strong>
                    </td>
                    <td className="px-3 py-2">{r._pctVisitasAlcance !== null ? `${r._pctVisitasAlcance.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-2">{r._pctSegVisitas !== null ? `${r._pctSegVisitas.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-2">
                      {puedeGestionar && (
                        <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                      )}
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
