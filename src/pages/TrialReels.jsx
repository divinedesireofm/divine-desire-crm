import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { getProfilesByRoles } from '../lib/roles'
import { iaCallJSON, getVoiceGuide, withVoiceGuide } from '../lib/ai'

const EMPTY = {
  cuenta: '', responsable_id: '', seguidores: '', duracion_seg: '', visualizaciones: '',
  cuentas_alcanzadas: '', tiempo_promedio_seg: '', omisiones_pct: '', pct_guardado: '',
  pct_compartido: '', pct_reposts: '', nuevos_seguidores: '',
}

const VEREDICTO_LABEL = { aprobado: 'Aprobado', revisar: 'A revisar', no_aprobado: 'No aprobado' }
const VEREDICTO_COLOR = { aprobado: 'var(--success)', revisar: 'var(--gold)', no_aprobado: 'var(--danger)' }

function num(v) { return v === '' || v === null || v === undefined ? null : parseFloat(v) }

export default function TrialReels() {
  const { profile, hasAnyRole } = useAuth()
  const puedeDecidir = hasAnyRole(['admin', 'ig_manager'])
  const [hist, setHist] = useState([])
  const [responsables, setResponsables] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [evaluando, setEvaluando] = useState(false)
  const [resultado, setResultado] = useState(null) // {base, score, veredicto_formula, ia, id}

  const [showImportador, setShowImportador] = useState(false)
  const [importText, setImportText] = useState('')
  const [importImage, setImportImage] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importErr, setImportErr] = useState('')

  function handlePasteImagen(e) {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    const reader = new FileReader()
    reader.onload = () => setImportImage({ mediaType: file.type, base64: reader.result.split(',')[1] })
    reader.readAsDataURL(file)
  }

  async function extraerConIA() {
    if (!importText.trim() && !importImage) { setImportErr('Pega el texto o la captura con los datos del reel.'); return }
    setImportBusy(true); setImportErr('')
    try {
      const contenido = []
      if (importImage) contenido.push({ type: 'image', source: { type: 'base64', media_type: importImage.mediaType, data: importImage.base64 } })
      contenido.push({ type: 'text', text: importText.trim() || 'Extrae los datos de la captura.' })
      const system = `Eres experto en leer estadísticas de un reel de Instagram (pantalla de "Insights" del propio reel). Extrae los valores EXACTOS que veas. Si un dato no aparece, devuélvelo como null, nunca como 0.`
      const schema = {
        type: 'object',
        properties: {
          seguidores: { type: ['number', 'null'] }, duracion_seg: { type: ['number', 'null'] },
          visualizaciones: { type: ['number', 'null'] }, cuentas_alcanzadas: { type: ['number', 'null'] },
          tiempo_promedio_seg: { type: ['number', 'null'] }, omisiones_pct: { type: ['number', 'null'] },
          pct_guardado: { type: ['number', 'null'] }, pct_compartido: { type: ['number', 'null'] },
          pct_reposts: { type: ['number', 'null'] }, nuevos_seguidores: { type: ['number', 'null'] },
        },
        required: ['seguidores', 'duracion_seg', 'visualizaciones', 'cuentas_alcanzadas', 'tiempo_promedio_seg', 'omisiones_pct', 'pct_guardado', 'pct_compartido', 'pct_reposts', 'nuevos_seguidores'],
      }
      const extraido = await iaCallJSON(system, [{ role: 'user', content: contenido }], { tool_name: 'entregar_metricas_reel', tool_description: 'Entrega las métricas extraídas.', schema }, 900)
      setForm((f) => {
        const n = { ...f }
        Object.entries(extraido).forEach(([k, v]) => { if (v !== null && v !== undefined) n[k] = String(v) })
        return n
      })
      setShowImportador(false)
      setShowForm(true)
      setImportText(''); setImportImage(null)
    } catch (e) { setImportErr(e.message) }
    setImportBusy(false)
  }

  async function load() {
    setLoading(true)
    const [{ data: h }, r] = await Promise.all([
      supabase.from('trial_reels').select('*, profiles(full_name)').order('created_at', { ascending: false }),
      getProfilesByRoles(['ig_manager', 'ig_assistant']),
    ])
    setHist(h || [])
    setResponsables(r)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function evaluar(e) {
    e.preventDefault()
    setError(''); setResultado(null)
    if (!form.cuenta.trim()) { setError('Indica la cuenta.'); return }
    setEvaluando(true)
    try {
      // 1) Base histórica: mediana de "seguidores por cada 1.000 de alcance" de los reels ya registrados
      const { data: reelsHist } = await supabase.from('reels').select('seguidores_ganados, alcance').not('alcance', 'is', null).not('seguidores_ganados', 'is', null)
      const ratios = (reelsHist || [])
        .map((r) => (r.alcance > 0 ? (r.seguidores_ganados / r.alcance) * 1000 : null))
        .filter((v) => v !== null)
        .sort((a, b) => a - b)
      const base = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 15 // 15 como referencia por defecto si no hay histórico aún

      // 2) Fórmula determinista (oculta a la IA para no condicionar su juicio)
      const alcance = num(form.cuentas_alcanzadas)
      const nuevosSeg = num(form.nuevos_seguidores)
      const score = alcance ? (nuevosSeg / alcance) * 1000 : 0
      let veredicto_formula = 'no_aprobado'
      if (score >= base * 0.8) veredicto_formula = 'aprobado'
      else if (score >= base * 0.5) veredicto_formula = 'revisar'

      // 3) Veredicto independiente de la IA, con los datos crudos (sin enseñarle el resultado de la fórmula)
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(`Eres el evaluador de "Trial Reels" de la agencia Divine Desire: decides si una modelo nueva pasa su periodo de prueba según cómo ha rendido su primer reel. La métrica clave es cuántos seguidores nuevos consigue por cada 1.000 cuentas alcanzadas — las reproducciones totales NO importan tanto como esto. Evalúa con criterio propio, sin conocer ningún resultado previo de otra fórmula.`, guia)
      const ia = await iaCallJSON(system, [{ role: 'user', content: JSON.stringify({
        seguidores_actuales: num(form.seguidores), duracion_seg: num(form.duracion_seg),
        visualizaciones: num(form.visualizaciones), cuentas_alcanzadas: alcance,
        tiempo_promedio_visualizacion_seg: num(form.tiempo_promedio_seg), omisiones_pct: num(form.omisiones_pct),
        pct_guardado: num(form.pct_guardado), pct_compartido: num(form.pct_compartido),
        pct_reposts: num(form.pct_reposts), nuevos_seguidores: nuevosSeg,
      }) }], {
        tool_name: 'entregar_veredicto',
        tool_description: 'Entrega el veredicto del trial reel.',
        schema: {
          type: 'object',
          properties: {
            veredicto: { type: 'string', enum: ['aprobado', 'revisar', 'no_aprobado'] },
            razonamiento: { type: 'string', description: '2-4 frases explicando el veredicto' },
          },
          required: ['veredicto', 'razonamiento'],
        },
      }, 800)

      const { data: guardado } = await supabase.from('trial_reels').insert([{
        cuenta: form.cuenta.trim(), responsable_id: form.responsable_id || null,
        seguidores: num(form.seguidores), duracion_seg: num(form.duracion_seg),
        visualizaciones: num(form.visualizaciones), cuentas_alcanzadas: alcance,
        tiempo_promedio_seg: num(form.tiempo_promedio_seg), omisiones_pct: num(form.omisiones_pct),
        pct_guardado: num(form.pct_guardado), pct_compartido: num(form.pct_compartido),
        pct_reposts: num(form.pct_reposts), nuevos_seguidores: nuevosSeg,
        base_mediana: base, score_formula: score, veredicto_formula,
        veredicto_ia: ia.veredicto, ia_razonamiento: ia.razonamiento,
        creado_por: profile.id,
      }]).select().single()

      setResultado({ base, score, veredicto_formula, ia, row: guardado })
      setForm(EMPTY)
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
    setEvaluando(false)
  }

  async function decidir(row, decision) {
    const motivo = prompt(`Motivo de la decisión "${VEREDICTO_LABEL[decision] || decision}" (opcional):`) || null
    await supabase.from('trial_reels').update({ decision_final: decision, motivo_manual: motivo }).eq('id', row.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Trial Reels"
        subtitle="Evalúa si una modelo nueva pasa su periodo de prueba, según el rendimiento real de su reel."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setShowImportador(!showImportador); setShowForm(false) }}>{showImportador ? 'Cancelar' : '✨ Importar con IA'}</Button>
            <Button onClick={() => { setShowForm(!showForm); setShowImportador(false) }}>{showForm ? 'Cancelar' : '+ Nueva evaluación'}</Button>
          </div>
        }
      />

      {showImportador && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">✨ Importar datos del reel con IA</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Pega una captura de pantalla (Ctrl+V) de los "Insights" del reel, o escribe/pega el texto con los datos.
          </p>
          <textarea
            value={importText} onChange={(e) => setImportText(e.target.value)} onPaste={handlePasteImagen}
            placeholder="Pega aquí una captura (Ctrl+V) o el texto..." rows={4}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          {importImage && (
            <div className="mb-3 flex items-center gap-3">
              <img src={`data:${importImage.mediaType};base64,${importImage.base64}`} alt="Captura pegada" className="h-24 rounded-md border" style={{ borderColor: 'var(--border)' }} />
              <button onClick={() => setImportImage(null)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Quitar imagen</button>
            </div>
          )}
          {importErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{importErr}</p>}
          <Button onClick={extraerConIA} disabled={importBusy}>{importBusy ? 'Extrayendo…' : 'Extraer datos'}</Button>
        </Panel>
      )}

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={evaluar} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder="Cuenta (usuario de Instagram)" value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value })} />
            <Select value={form.responsable_id} onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}>
              <option value="">Responsable…</option>
              {responsables.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </Select>
            <Input type="number" placeholder="Seguidores actuales" value={form.seguidores} onChange={(e) => setForm({ ...form, seguidores: e.target.value })} />
            <Input type="number" placeholder="Duración del reel (seg)" value={form.duracion_seg} onChange={(e) => setForm({ ...form, duracion_seg: e.target.value })} />
            <Input type="number" placeholder="Visualizaciones" value={form.visualizaciones} onChange={(e) => setForm({ ...form, visualizaciones: e.target.value })} />
            <Input type="number" placeholder="Cuentas alcanzadas" value={form.cuentas_alcanzadas} onChange={(e) => setForm({ ...form, cuentas_alcanzadas: e.target.value })} />
            <Input type="number" placeholder="Tiempo prom. de visualización (seg)" value={form.tiempo_promedio_seg} onChange={(e) => setForm({ ...form, tiempo_promedio_seg: e.target.value })} />
            <Input type="number" placeholder="% Omisiones" value={form.omisiones_pct} onChange={(e) => setForm({ ...form, omisiones_pct: e.target.value })} />
            <Input type="number" placeholder="% Guardado" value={form.pct_guardado} onChange={(e) => setForm({ ...form, pct_guardado: e.target.value })} />
            <Input type="number" placeholder="% Compartido" value={form.pct_compartido} onChange={(e) => setForm({ ...form, pct_compartido: e.target.value })} />
            <Input type="number" placeholder="% Reposts" value={form.pct_reposts} onChange={(e) => setForm({ ...form, pct_reposts: e.target.value })} />
            <Input type="number" placeholder="Nuevos seguidores (de este reel)" value={form.nuevos_seguidores} onChange={(e) => setForm({ ...form, nuevos_seguidores: e.target.value })} />
            {error && <p className="sm:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="sm:col-span-3" disabled={evaluando}>{evaluando ? 'Evaluando…' : 'Evaluar'}</Button>
          </form>
        </Panel>
      )}

      {resultado && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">Resultado de la evaluación</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-md" style={{ background: 'var(--panel-alt)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Fórmula (seguidores/1000 alcance vs. mediana histórica de {resultado.base.toFixed(1)})</p>
              <p className="text-lg font-display font-semibold" style={{ color: VEREDICTO_COLOR[resultado.veredicto_formula] }}>
                {resultado.score.toFixed(1)} → {VEREDICTO_LABEL[resultado.veredicto_formula]}
              </p>
            </div>
            <div className="p-3 rounded-md" style={{ background: 'var(--panel-alt)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Veredicto independiente de la IA</p>
              <p className="text-lg font-display font-semibold" style={{ color: VEREDICTO_COLOR[resultado.ia.veredicto] }}>
                {VEREDICTO_LABEL[resultado.ia.veredicto]}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{resultado.ia.razonamiento}</p>
            </div>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>La decisión final es tuya — usa esto como apoyo, no como veredicto automático.</p>
          <div className="flex gap-2">
            <Button onClick={() => decidir(resultado.row, 'aprobado')}>Aprobar</Button>
            <Button variant="ghost" onClick={() => decidir(resultado.row, 'no_aprobado')}>No aprobar</Button>
          </div>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : hist.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin evaluaciones todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {hist.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <strong className="text-sm">{r.cuenta}</strong>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${VEREDICTO_COLOR[r.decision_final] || 'var(--text-muted)'}22`, color: VEREDICTO_COLOR[r.decision_final] || 'var(--text-muted)' }}>
                    {r.decision_final === 'pendiente' ? 'Pendiente de decisión' : VEREDICTO_LABEL[r.decision_final]}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Fórmula: {r.score_formula?.toFixed(1)} ({VEREDICTO_LABEL[r.veredicto_formula]}) · IA: {VEREDICTO_LABEL[r.veredicto_ia]} · Responsable: {r.profiles?.full_name || '—'}
                </p>
                {r.ia_razonamiento && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{r.ia_razonamiento}</p>}
                {r.motivo_manual && <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Motivo: {r.motivo_manual}</p>}
                {puedeDecidir && r.decision_final === 'pendiente' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => decidir(r, 'aprobado')} className="text-xs hover:underline" style={{ color: 'var(--success)' }}>Aprobar</button>
                    <button onClick={() => decidir(r, 'no_aprobado')} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>No aprobar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
