import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { iaCall, iaJson } from '../lib/ai'

const CAT_PACKS = ['Ticket bajo', 'Medium-Spender', 'Premium', 'Lanzamiento', 'Upsell', 'Estratégico 🐀']

export default function Packs() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)
  const [iaPrompt, setIaPrompt] = useState('')
  const [iaCat, setIaCat] = useState('Medium-Spender')
  const [iaBusy, setIaBusy] = useState(false)
  const [iaOut, setIaOut] = useState(null)
  const [iaErr, setIaErr] = useState('')

  async function load() {
    const { data } = await supabase.from('sales_packs').select('*').order('es_referencia', { ascending: false }).order('categoria')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function borrar(p) {
    if (!confirm(`¿Eliminar el pack "${p.titulo}"?`)) return
    await supabase.from('sales_packs').delete().eq('id', p.id)
    load()
  }

  async function generar() {
    if (!iaPrompt.trim()) { setIaErr('Describe qué pack quieres generar (modelo, tipo de fan, objetivo...)'); return }
    setIaBusy(true); setIaErr(''); setIaOut(null)
    try {
      const refs = rows.filter((r) => r.es_referencia).slice(0, 14)
        .map((r) => `[${r.categoria}] ${r.titulo}${r.precio ? ` (${r.precio})` : ''}\nContenido: ${r.contenido || ''}\nCopy: ${r.copy || ''}`).join('\n---\n')
      const system = `Eres un copywriter experto en venta de packs para OnlyFans dentro de la agencia Divine Desire. Escribes en español, tono coqueto, natural y creíble, nunca explícito ni vulgar. Los packs son ESTRATÉGICOS: deben parecer mucho contenido y dejar al fan con ganas de más. Sigues el estilo de estas referencias del equipo:\n\n${refs}\n\nDevuelve SOLO un JSON válido (sin markdown) con esta forma exacta: {"titulo":"...","precio":"$..","contenido":"lista breve de lo que incluye","copy":"el mensaje listo para enviar al fan","notas":"nota estratégica corta para el chatter"}`
      const txt = await iaCall(system, [{ role: 'user', content: `Categoría: ${iaCat}\nPetición: ${iaPrompt}` }], 1300)
      setIaOut(iaJson(txt))
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  async function guardarGenerado() {
    await supabase.from('sales_packs').insert([{
      titulo: iaOut.titulo || 'Pack generado', categoria: iaCat, contenido: iaOut.contenido || '',
      copy: iaOut.copy || '', precio: iaOut.precio || '', notas: iaOut.notas || '',
      es_referencia: false, generado_ia: true, creado_por: profile.id,
    }])
    setIaOut(null); setIaPrompt(''); load()
  }

  const porCat = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.categoria] = g[r.categoria] || []).push(r) }
    return g
  }, [rows])
  const cats = Object.keys(porCat).sort((a, b) => CAT_PACKS.indexOf(a) - CAT_PACKS.indexOf(b))

  return (
    <div>
      <PageHeader
        title="Packs"
        subtitle="Packs generales del equipo (ajustables a cada modelo). Copia el mensaje listo."
        action={esMgr && <Button onClick={() => setEdit({ titulo: '', categoria: CAT_PACKS[1], contenido: '', copy: '', precio: '', notas: '' })}>+ Nuevo pack</Button>}
      />

      <Panel className="p-5 mb-6" style={{ borderColor: 'var(--accent)' }}>
        <p className="font-medium mb-3">✨ Generador de packs con IA</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Select value={iaCat} onChange={(e) => setIaCat(e.target.value)}>
            {CAT_PACKS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input
            className="col-span-2"
            placeholder="Ej: pack para fan medium-spender de Valen, que ya compró previews"
            value={iaPrompt}
            onChange={(e) => setIaPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generar() }}
          />
        </div>
        {iaErr && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{iaErr}</p>}
        <Button onClick={generar} disabled={iaBusy}>{iaBusy ? 'Generando…' : 'Generar pack'}</Button>
        {iaOut && (
          <Panel className="p-4 mt-4">
            <p className="font-medium mb-1">{iaOut.titulo} {iaOut.precio && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{iaOut.precio}</span>}</p>
            {iaOut.contenido && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}><strong>Incluye:</strong> {iaOut.contenido}</p>}
            <p className="text-sm whitespace-pre-wrap mb-2 p-2 rounded" style={{ background: 'var(--panel-alt)' }}>{iaOut.copy}</p>
            {iaOut.notas && <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{iaOut.notas}</p>}
            <div className="flex gap-2 flex-wrap">
              <CopyButton text={iaOut.copy} />
              {esMgr && <Button onClick={guardarGenerado}>Guardar en la biblioteca</Button>}
              <Button variant="ghost" onClick={() => setIaOut(null)}>Descartar</Button>
            </div>
          </Panel>
        )}
      </Panel>

      {cats.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin packs todavía</p>
      ) : cats.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-sm font-medium mb-2">{cat} <span style={{ color: 'var(--text-muted)' }}>({porCat[cat].length})</span></p>
          <div className="grid grid-cols-3 gap-3">
            {porCat[cat].map((p) => (
              <Panel key={p.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{p.titulo} {p.precio && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{p.precio}</span>}</p>
                  {p.es_referencia ? <span className="text-xs" style={{ color: 'var(--gold)' }}>★ ref</span> : p.generado_ia ? <span className="text-xs" style={{ color: 'var(--accent)' }}>IA</span> : null}
                </div>
                {p.contenido && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{p.contenido}</p>}
                {p.copy && <p className="text-sm whitespace-pre-wrap mb-3 p-2 rounded" style={{ background: 'var(--panel-alt)' }}>{p.copy}</p>}
                {p.notas && <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{p.notas}</p>}
                <div className="flex flex-wrap gap-2">
                  {p.copy && <CopyButton text={p.copy} />}
                  {esMgr && <button onClick={() => setEdit(p)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>}
                  {esMgr && <button onClick={() => borrar(p)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      ))}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar pack' : 'Nuevo pack'}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input placeholder="Título" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} />
            <Input placeholder="Precio ($45)" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} />
            <Select value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} className="col-span-2">
              {CAT_PACKS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          {[['contenido', 'Contenido (qué incluye)'], ['copy', 'Copy (mensaje para el fan)'], ['notas', 'Notas estratégicas']].map(([key, label]) => (
            <div key={key} className="mb-3">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
              <textarea
                value={edit[key] || ''}
                onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                rows={key === 'notas' ? 2 : 3}
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.titulo.trim()) return
                const payload = { titulo: edit.titulo, categoria: edit.categoria, contenido: edit.contenido, copy: edit.copy, precio: edit.precio, notas: edit.notas }
                if (edit.id) await supabase.from('sales_packs').update(payload).eq('id', edit.id)
                else await supabase.from('sales_packs').insert([{ ...payload, es_referencia: false, generado_ia: false, creado_por: profile.id }])
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
