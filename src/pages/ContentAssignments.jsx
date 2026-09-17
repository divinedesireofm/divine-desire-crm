import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const DIAS_ALERTA = 14

function diasDesde(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00')
  const hoy = new Date()
  return Math.floor((hoy - d) / (1000 * 60 * 60 * 24))
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

function Tarjeta({ r, alerta, desde, onRecordar, onBorrar }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
      className="p-3 rounded-md cursor-grab active:cursor-grabbing select-none"
      style={{ background: alerta ? 'var(--danger)11' : 'var(--panel-alt)', border: `1px solid ${alerta ? 'var(--danger)' : 'var(--border)'}` }}
    >
      <p className="text-sm font-medium mb-1">{r.titulo}</p>
      <p className="text-xs mb-2" style={{ color: r.hecho_en ? 'var(--success)' : 'var(--text-muted)' }}>
        {r.hecho_en ? `Hecho el ${r.hecho_en}` : r.enviado_en ? `Enviado ${r.enviado_en}` : 'Sin enviar todavía'}
        {!r.hecho_en && r.recordado_en && <> · recordado {r.recordado_en}</>}
      </p>
      {alerta && (
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--danger)' }}>⚠️ {desde} días sin hacerse</p>
      )}
      <div className="flex gap-3 flex-wrap">
        {alerta && (
          <button onClick={() => onRecordar(r)} className="text-xs hover:underline" style={{ color: 'var(--gold)' }}>
            Ya se lo he recordado
          </button>
        )}
        <button onClick={() => onBorrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>
          Borrar
        </button>
      </div>
    </div>
  )
}

function Columna({ id, titulo, contador, vacio, children, dragOver, setDragOver, onSoltar, colorBorde }) {
  return (
    <Panel
      className="p-5"
      style={{ outline: dragOver === id ? `2px dashed ${colorBorde}` : 'none', outlineOffset: -2 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(id) }}
      onDragLeave={() => setDragOver((d) => (d === id ? null : d))}
      onDrop={(e) => { e.preventDefault(); setDragOver(null); onSoltar(id, e) }}
    >
      <p className="text-sm font-medium mb-4">{titulo} ({contador})</p>
      {contador === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{vacio}</p> : <div className="space-y-3">{children}</div>}
    </Panel>
  )
}

export default function ContentAssignments() {
  const { profile } = useAuth()
  const [modelos, setModelos] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(null)

  async function loadModelos() {
    const { data } = await supabase.from('models').select('id, stage_name').order('stage_name')
    setModelos(data || [])
    if (data?.length && !selectedModel) setSelectedModel(data[0].id)
  }

  async function loadRows(modelId) {
    if (!modelId) return
    setLoading(true)
    const { data } = await supabase
      .from('content_assignments')
      .select('*')
      .eq('model_id', modelId)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadModelos() }, [])
  useEffect(() => { loadRows(selectedModel) }, [selectedModel])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!nuevoTitulo.trim()) { setError('Describe qué contenido le has pedido.'); return }
    await supabase.from('content_assignments').insert([{
      model_id: selectedModel, titulo: nuevoTitulo.trim(), creado_por: profile.id,
    }])
    setNuevoTitulo('')
    loadRows(selectedModel)
  }

  async function recordar(row) {
    await supabase.from('content_assignments').update({ recordado_en: hoyISO() }).eq('id', row.id)
    loadRows(selectedModel)
  }
  async function borrar(row) {
    if (!confirm('¿Eliminar este contenido de la lista? (por ejemplo, si al final se cancela)')) return
    await supabase.from('content_assignments').delete().eq('id', row.id)
    loadRows(selectedModel)
  }

  async function soltarEn(columna, e) {
    const id = e.dataTransfer.getData('text/plain')
    const row = rows.find((r) => r.id === id)
    if (!row) return
    let update = null
    if (columna === 'pendiente') update = { enviado_en: null, hecho_en: null, recordado_en: null }
    if (columna === 'enviado') update = { enviado_en: row.enviado_en || hoyISO(), hecho_en: null }
    if (columna === 'hecho') update = { enviado_en: row.enviado_en || hoyISO(), hecho_en: hoyISO() }
    if (!update) return
    await supabase.from('content_assignments').update(update).eq('id', id)
    loadRows(selectedModel)
  }

  const pendientesDeEnviar = rows.filter((r) => !r.enviado_en && !r.hecho_en)
  const enviados = rows.filter((r) => r.enviado_en && !r.hecho_en)
  const hechos = rows.filter((r) => r.hecho_en)

  return (
    <div>
      <PageHeader
        title="Contenido pedido a las modelos"
        subtitle="Elige la modelo y arrastra las tarjetas entre columnas para moverlas."
      />

      <div className="mb-6 max-w-xs">
        <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
      </div>

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-3">Pedir contenido nuevo a esta modelo</p>
        <form onSubmit={crear} className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="Qué contenido le has pedido (ej: set lencería roja, 10 fotos)"
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
          />
          <Button type="submit">Añadir a pendientes</Button>
        </form>
        {error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      </Panel>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <Columna id="pendiente" titulo="🕒 Pendiente" contador={pendientesDeEnviar.length}
            vacio="Nada pendiente de enviar. Aquí caen los contenidos recién añadidos." colorBorde="var(--text-muted)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {pendientesDeEnviar.map((r) => (
              <Tarjeta key={r.id} r={r} alerta={false} desde={0} onRecordar={recordar} onBorrar={borrar} />
            ))}
          </Columna>

          <Columna id="enviado" titulo="📤 Enviado" contador={enviados.length}
            vacio="Arrastra aquí un pendiente cuando se lo mandes a la modelo." colorBorde="var(--accent)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {enviados.map((r) => {
              const desde = diasDesde(r.recordado_en || r.enviado_en)
              return <Tarjeta key={r.id} r={r} alerta={desde >= DIAS_ALERTA} desde={desde} onRecordar={recordar} onBorrar={borrar} />
            })}
          </Columna>

          <Columna id="hecho" titulo="✅ Hecho" contador={hechos.length}
            vacio="Arrastra aquí cuando la modelo entregue el contenido." colorBorde="var(--success)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {hechos.map((r) => (
              <Tarjeta key={r.id} r={r} alerta={false} desde={0} onRecordar={recordar} onBorrar={borrar} />
            ))}
          </Columna>
        </div>
      )}
    </div>
  )
}
