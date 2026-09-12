import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

const CAT_SCRIPTS = ['Situaciones', 'Objeciones', 'Ratas 🐀', 'Ventas', 'Suscripciones']

export default function Scripts() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('sales_scripts').select('*').order('categoria')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function borrar(s) {
    if (!confirm(`¿Eliminar el script "${s.titulo}"?`)) return
    await supabase.from('sales_scripts').delete().eq('id', s.id)
    load()
  }

  const filt = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? rows.filter((r) => (r.titulo + ' ' + r.texto).toLowerCase().includes(t)) : rows
  }, [rows, q])
  const porCat = useMemo(() => {
    const g = {}
    for (const r of filt) { (g[r.categoria] = g[r.categoria] || []).push(r) }
    return g
  }, [filt])
  const cats = Object.keys(porCat).sort((a, b) => CAT_SCRIPTS.indexOf(a) - CAT_SCRIPTS.indexOf(b))

  return (
    <div>
      <PageHeader
        title="Scripts"
        subtitle="Respuestas listas para situaciones, objeciones y ventas. Copia y adapta al tono de cada modelo."
        action={esMgr && <Button onClick={() => setEdit({ titulo: '', categoria: CAT_SCRIPTS[0], texto: '' })}>+ Nuevo script</Button>}
      />

      <Panel className="p-4 mb-6">
        <Input placeholder="Buscar script por palabra clave..." value={q} onChange={(e) => setQ(e.target.value)} />
      </Panel>

      {cats.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{q ? 'Ningún script coincide con la búsqueda' : 'Sin scripts todavía'}</p>
      ) : cats.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-sm font-medium mb-2">{cat} <span style={{ color: 'var(--text-muted)' }}>({porCat[cat].length})</span></p>
          <div className="grid grid-cols-3 gap-3">
            {porCat[cat].map((s) => (
              <Panel key={s.id} className="p-4">
                <p className="font-medium mb-2">{s.titulo}</p>
                <p className="text-sm whitespace-pre-wrap mb-3 p-2 rounded" style={{ background: 'var(--panel-alt)' }}>{s.texto}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={s.texto} />
                  {esMgr && <button onClick={() => setEdit(s)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>}
                  {esMgr && <button onClick={() => borrar(s)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      ))}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar script' : 'Nuevo script'}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input placeholder="Título / situación" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} />
            <Select value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })}>
              {CAT_SCRIPTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Texto del script</label>
          <textarea
            value={edit.texto}
            onChange={(e) => setEdit({ ...edit, texto: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.titulo.trim() || !edit.texto.trim()) return
                const payload = { titulo: edit.titulo, categoria: edit.categoria, texto: edit.texto }
                if (edit.id) await supabase.from('sales_scripts').update(payload).eq('id', edit.id)
                else await supabase.from('sales_scripts').insert([{ ...payload, creado_por: profile.id }])
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
