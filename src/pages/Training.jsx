import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { iaCall, iaJson, getVoiceGuide, withVoiceGuide } from '../lib/ai'

function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const EMPTY = {
  numero: '', fecha_publicacion: fechaHoyISO(), concepto: '', titulo: '', contenido: '',
  pregunta: '', opcion_a: '', opcion_b: '', opcion_c: '', opcion_d: '', respuesta_correcta: 'A', explicacion_correcta: '',
}

export default function Training() {
  const { profile } = useAuth()
  const [pils, setPils] = useState([])
  const [resp, setResp] = useState([])
  const [equipo, setEquipo] = useState([])
  const [sel, setSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErr, setIaErr] = useState('')

  async function load() {
    const [{ data: ps }, us] = await Promise.all([
      supabase.from('training_pills').select('*').order('numero', { ascending: false }).limit(120),
      getProfilesByRoles(['admin', 'manager', 'chatter'], { onlyActive: true }),
    ])
    setPils(ps || [])
    setEquipo(us)
    const activa = (ps || []).find((p) => p.activa) || ps?.[0]
    setSel(activa || null)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    async function loadResp() {
      if (!sel) { setResp([]); return }
      const { data } = await supabase.from('training_answers').select('*').eq('pildora_id', sel.id)
      setResp(data || [])
    }
    loadResp()
  }, [sel])

  async function activar(p) {
    const prev = pils.find((x) => x.activa)
    if (prev && prev.id !== p.id) await supabase.from('training_pills').update({ activa: false }).eq('id', prev.id)
    await supabase.from('training_pills').update({ activa: true }).eq('id', p.id)
    load()
  }

  async function generarConIA() {
    setIaBusy(true); setIaErr('')
    try {
      const anteriores = pils.slice(0, 8).map((p) => `#${p.numero} [${p.concepto}] ${p.titulo}: ${p.pregunta}`).join('\n')
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(`Eres experto en formación de equipos de chat/ventas para OnlyFans en la agencia Divine Desire. Genera UNA "píldora de valor" diaria: un concepto breve y práctico (técnica de venta, psicología del fan, gestión de objeciones, etc.) seguido de una pregunta tipo test de una sola respuesta correcta para comprobar que se ha entendido.\n\nPíldoras anteriores ya usadas (no repitas el mismo concepto):\n${anteriores}\n\nDevuelve SOLO un JSON válido (sin markdown) con esta forma exacta: {"concepto":"nombre corto del concepto","titulo":"título llamativo","contenido":"explicación práctica de 3-5 frases","pregunta":"la pregunta del test","opcion_a":"...","opcion_b":"...","opcion_c":"...","opcion_d":"...","respuesta_correcta":"A|B|C|D","explicacion_correcta":"por qué es la correcta, 1-2 frases"}`, guia)
      const txt = await iaCall(system, [{ role: 'user', content: 'Genera la píldora de hoy.' }], 900)
      const obj = iaJson(txt)
      setForm({
        ...EMPTY,
        numero: Math.max(0, ...pils.map((p) => p.numero || 0)) + 1,
        concepto: obj.concepto || '', titulo: obj.titulo || '', contenido: obj.contenido || '',
        pregunta: obj.pregunta || '', opcion_a: obj.opcion_a || '', opcion_b: obj.opcion_b || '',
        opcion_c: obj.opcion_c || '', opcion_d: obj.opcion_d || '',
        respuesta_correcta: obj.respuesta_correcta || 'A', explicacion_correcta: obj.explicacion_correcta || '',
      })
      setShowForm(true)
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  async function crear() {
    setError('')
    if (!form.titulo.trim() || !form.pregunta.trim()) { setError('Completa al menos el título y la pregunta.'); return }
    const numero = form.numero || (Math.max(0, ...pils.map((p) => p.numero || 0)) + 1)
    const { data: nueva, error } = await supabase.from('training_pills').insert([{
      numero, fecha_publicacion: form.fecha_publicacion, concepto: form.concepto, titulo: form.titulo,
      contenido: form.contenido, pregunta: form.pregunta, opcion_a: form.opcion_a, opcion_b: form.opcion_b,
      opcion_c: form.opcion_c, opcion_d: form.opcion_d, respuesta_correcta: form.respuesta_correcta,
      explicacion_correcta: form.explicacion_correcta, activa: false, creado_por: profile.id,
    }]).select().single()
    if (error) { setError('No se pudo guardar.'); return }
    setShowForm(false); setForm(EMPTY)
    await load()
    if (nueva) activar(nueva)
  }

  const mapResp = useMemo(() => {
    const m = {}
    resp.forEach((r) => { m[r.usuario_id] = r })
    return m
  }, [resp])
  const total = equipo.length
  const respondieron = resp.length
  const aciertos = resp.filter((r) => r.es_correcta).length
  const tasa = respondieron ? Math.round((aciertos / respondieron) * 100) : 0

  return (
    <div>
      <PageHeader
        title="Formación · Píldoras de valor"
        subtitle="Seguimiento de la píldora diaria del equipo. Cada miembro debe completarla al entrar al CRM."
        action={
          <div className="flex gap-2 items-center">
            {iaErr && <span className="text-xs" style={{ color: 'var(--danger)' }}>{iaErr}</span>}
            <Button variant="ghost" onClick={generarConIA} disabled={iaBusy}>{iaBusy ? 'Generando…' : '✨ Generar con IA'}</Button>
            <Button onClick={() => { setForm({ ...EMPTY, numero: Math.max(0, ...pils.map((p) => p.numero || 0)) + 1 }); setShowForm(!showForm) }}>{showForm ? 'Cancelar' : '+ Nueva píldora'}</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Panel className="p-4">
          <p className="text-2xl font-display font-semibold gold-text">{sel ? `#${sel.numero}` : '—'}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Píldora · {sel?.fecha_publicacion}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-2xl font-display font-semibold">{respondieron} / {total}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Han respondido {sel?.activa ? '(activa hoy)' : '(pasada)'}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-2xl font-display font-semibold" style={{ color: 'var(--success)' }}>{tasa}%</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Acierto · {aciertos} ok · {respondieron - aciertos} fallos</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-2xl font-display font-semibold" style={{ color: 'var(--gold)' }}>{Math.max(0, total - respondieron)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pendientes de hacerla</p>
        </Panel>
      </div>

      {showForm && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">Nueva píldora</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Input type="number" placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            <Input type="date" value={form.fecha_publicacion} onChange={(e) => setForm({ ...form, fecha_publicacion: e.target.value })} />
            <Input placeholder="Concepto (ej: Activación)" className="col-span-2" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </div>
          <Input placeholder="Título" className="mb-3" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <textarea
            value={form.contenido}
            onChange={(e) => setForm({ ...form, contenido: e.target.value })}
            rows={4}
            placeholder="Contenido de la píldora (puedes usar saltos de línea y emojis ✅ ❌ 🧠)"
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <Input placeholder="Pregunta del test" className="mb-3" value={form.pregunta} onChange={(e) => setForm({ ...form, pregunta: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {['a', 'b', 'c', 'd'].map((l) => (
              <Input key={l} placeholder={`Opción ${l.toUpperCase()}`} value={form[`opcion_${l}`]} onChange={(e) => setForm({ ...form, [`opcion_${l}`]: e.target.value })} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Select value={form.respuesta_correcta} onChange={(e) => setForm({ ...form, respuesta_correcta: e.target.value })}>
              {['A', 'B', 'C', 'D'].map((l) => <option key={l} value={l}>Correcta: {l}</option>)}
            </Select>
            <Input placeholder="Explicación de la respuesta correcta" value={form.explicacion_correcta} onChange={(e) => setForm({ ...form, explicacion_correcta: e.target.value })} />
          </div>
          {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button onClick={crear}>Crear y activar hoy</Button>
        </Panel>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Panel className="p-4">
          <p className="text-sm font-medium mb-3">Píldoras</p>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {pils.map((p) => (
              <button
                key={p.id}
                onClick={() => setSel(p)}
                className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2"
                style={{ background: sel?.id === p.id ? 'var(--accent-soft)' : 'transparent', color: sel?.id === p.id ? 'var(--accent)' : 'var(--text)' }}
              >
                <span className="font-medium">#{p.numero}</span>
                <span className="flex-1 truncate">{p.titulo}</span>
                {p.activa && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--success)22', color: 'var(--success)' }}>HOY</span>}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-4 col-span-2">
          {!sel ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Selecciona una píldora.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium">{sel.titulo} <span className="text-xs px-2 py-0.5 rounded-full ml-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{sel.concepto}</span></p>
                {!sel.activa && <Button variant="ghost" onClick={() => activar(sel)}>Marcar como la de hoy</Button>}
              </div>
              <div className="p-3 rounded mb-4 text-sm" style={{ background: 'var(--panel-alt)' }}>
                <p className="mb-2"><strong>Pregunta:</strong> {sel.pregunta}</p>
                <p style={{ color: 'var(--success)' }}>
                  <strong>Correcta ({sel.respuesta_correcta}):</strong> {[sel.opcion_a, sel.opcion_b, sel.opcion_c, sel.opcion_d][['A', 'B', 'C', 'D'].indexOf(sel.respuesta_correcta)]}
                </p>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Miembro', 'Rol', 'Estado', 'Resp.'].map((c) => (
                      <th key={c} className="text-left px-2 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipo.map((u) => {
                    const r = mapResp[u.id]
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-2 py-2">{u.full_name}</td>
                        <td className="px-2 py-2">{u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager de Chatting' : 'Chatter'}</td>
                        <td className="px-2 py-2">
                          {!r ? (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--gold)22', color: 'var(--gold)' }}>Pendiente</span>
                          ) : r.es_correcta ? (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--success)22', color: 'var(--success)' }}>Correcta</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--danger)22', color: 'var(--danger)' }}>Fallada</span>
                          )}
                        </td>
                        <td className="px-2 py-2">{r ? r.respuesta_dada : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}
