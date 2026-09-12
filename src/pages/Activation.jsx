import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { iaCall, iaJson } from '../lib/ai'

const CAT_ACT = ['Urgencia', 'Curiosidad', 'Fecha especial', 'Festivo / día mundial']

export default function Activation() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [iaCat, setIaCat] = useState(CAT_ACT[0])
  const [iaPrompt, setIaPrompt] = useState('')
  const [iaBusy, setIaBusy] = useState(false)
  const [iaOut, setIaOut] = useState([])
  const [iaErr, setIaErr] = useState('')

  async function load() {
    const { data } = await supabase.from('activation_messages').select('*').order('categoria')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function votar(m, campo) {
    setBusyId(m.id)
    const patch = { [campo]: (m[campo] || 0) + 1 }
    await supabase.from('activation_messages').update(patch).eq('id', m.id)
    setRows((rs) => rs.map((x) => x.id === m.id ? { ...x, ...patch } : x))
    setBusyId(null)
  }

  async function borrar(m) {
    if (!confirm('¿Eliminar este mensaje de activación?')) return
    await supabase.from('activation_messages').delete().eq('id', m.id)
    load()
  }

  async function generar() {
    setIaBusy(true); setIaErr(''); setIaOut([])
    try {
      const buenos = rows.filter((r) => (r.funciono || 0) > (r.no_funciono || 0)).map((r) => r.texto)
      const refs = rows.filter((r) => r.categoria === iaCat).slice(0, 10).map((r) => r.texto)
      const pool = buenos.length ? buenos.slice(0, 12) : refs
      const system = `Eres experto en mensajes masivos de activación para OnlyFans en la agencia Divine Desire. Objetivo: reactivar fans inactivos y abrir conversación. Reglas: combinar curiosidad, sorpresa o urgencia; NUNCA empezar con 'hola qué tal'; mensajes creíbles y NO sexuales; en español, tono natural y femenino, con algún emoji. Categoría pedida: ${iaCat}.\n\nMensajes que han funcionado bien al equipo (úsalos como referencia de estilo, NO los copies literal):\n${pool.map((t) => `• ${t}`).join('\n')}\n\nDevuelve SOLO un array JSON de 4 strings (sin markdown), cada string un mensaje listo para enviar.`
      const txt = await iaCall(system, [{ role: 'user', content: iaPrompt.trim() || `Genera 4 mensajes nuevos de la categoría ${iaCat}` }], 900)
      const arr = iaJson(txt)
      setIaOut(Array.isArray(arr) ? arr : [])
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  async function guardarGen(texto) {
    await supabase.from('activation_messages').insert([{
      titulo: '', texto, categoria: iaCat, es_referencia: false, generado_ia: true,
      funciono: 0, no_funciono: 0, creado_por: profile.id,
    }])
    setIaOut((o) => o.filter((t) => t !== texto))
    load()
  }

  const porCat = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.categoria] = g[r.categoria] || []).push(r) }
    return g
  }, [rows])
  const cats = Object.keys(porCat).sort((a, b) => CAT_ACT.indexOf(a) - CAT_ACT.indexOf(b))

  return (
    <div>
      <PageHeader
        title="Mensajes de activación"
        subtitle="Biblioteca de masivos. Marca si funcionaron o no."
        action={esMgr && <Button onClick={() => setEdit({ texto: '', categoria: CAT_ACT[0] })}>+ Añadir mensaje</Button>}
      />

      <Panel className="p-5 mb-6">
        <p className="font-medium mb-3">✨ Generar masivos con IA</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Select value={iaCat} onChange={(e) => setIaCat(e.target.value)}>
            {CAT_ACT.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <input
            className="col-span-2 px-3 py-2 rounded-md text-sm outline-none"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            placeholder="Ej: para San Valentín, fans que llevan días sin escribir"
            value={iaPrompt}
            onChange={(e) => setIaPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generar() }}
          />
        </div>
        {iaErr && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{iaErr}</p>}
        <Button onClick={generar} disabled={iaBusy}>{iaBusy ? 'Generando…' : 'Generar 4 mensajes'}</Button>
        {iaOut.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            {iaOut.map((t, i) => (
              <Panel key={i} className="p-3 flex items-center gap-3">
                <p className="flex-1 text-sm whitespace-pre-wrap">{t}</p>
                <CopyButton text={t} />
                {esMgr && <Button onClick={() => guardarGen(t)}>Guardar</Button>}
              </Panel>
            ))}
          </div>
        )}
      </Panel>

      {cats.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin mensajes todavía</p>
      ) : cats.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-sm font-medium mb-2">{cat} <span style={{ color: 'var(--text-muted)' }}>({porCat[cat].length})</span></p>
          <div className="grid grid-cols-2 gap-3">
            {porCat[cat].map((m) => (
              <Panel key={m.id} className="p-4">
                <p className="text-sm whitespace-pre-wrap mb-3 p-2 rounded" style={{ background: 'var(--panel-alt)' }}>{m.texto}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <CopyButton text={m.texto} />
                  <button disabled={busyId === m.id} onClick={() => votar(m, 'funciono')} className="text-xs px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--success)' }}>
                    ✓ {m.funciono || 0}
                  </button>
                  <button disabled={busyId === m.id} onClick={() => votar(m, 'no_funciono')} className="text-xs px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}>
                    ✕ {m.no_funciono || 0}
                  </button>
                  {m.generado_ia ? <span className="text-xs" style={{ color: 'var(--accent)' }}>IA</span> : m.es_referencia ? <span className="text-xs" style={{ color: 'var(--gold)' }}>★</span> : null}
                  {esMgr && <button onClick={() => borrar(m)} className="text-xs hover:underline ml-auto" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      ))}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">Añadir mensaje de activación</p>
          <Select value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} className="mb-3">
            {CAT_ACT.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <textarea
            value={edit.texto}
            onChange={(e) => setEdit({ ...edit, texto: e.target.value })}
            rows={3}
            placeholder="Escribe el mensaje..."
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.texto.trim()) return
                await supabase.from('activation_messages').insert([{
                  titulo: '', texto: edit.texto.trim(), categoria: edit.categoria,
                  es_referencia: false, generado_ia: false, funciono: 0, no_funciono: 0, creado_por: profile.id,
                }])
                setEdit(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
