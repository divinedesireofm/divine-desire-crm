import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

export default function Prices() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('price_list').select('*').order('seccion').order('orden')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function borrar(p) {
    if (!confirm(`¿Eliminar "${p.concepto}"?`)) return
    await supabase.from('price_list').delete().eq('id', p.id)
    load()
  }

  const porSec = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.seccion] = g[r.seccion] || []).push(r) }
    return g
  }, [rows])
  const secs = Object.keys(porSec)

  return (
    <div>
      <PageHeader
        title="Precios"
        subtitle="Tarifas de referencia del equipo. Son mínimos: si el fan paga bien, se sube sin límite."
        action={esMgr && <Button onClick={() => setEdit({ seccion: secs[0] || 'Packs en secuencia (mínimos)', concepto: '', precio: '', notas: '', orden: 0 })}>+ Nuevo precio</Button>}
      />

      {secs.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin precios todavía</p>
      ) : secs.map((sec) => (
        <Panel key={sec} className="p-5 mb-4">
          <p className="font-medium mb-3">{sec}</p>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Concepto', 'Precio', 'Notas', ''].map((c) => (
                  <th key={c} className="text-left px-2 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porSec[sec].map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-2 py-2"><strong>{p.concepto}</strong></td>
                  <td className="px-2 py-2">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{p.precio}</span>
                  </td>
                  <td className="px-2 py-2" style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{p.notas}</td>
                  {esMgr && (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEdit(p)} className="text-xs hover:underline mr-2" style={{ color: 'var(--accent)' }}>Editar</button>
                      <button onClick={() => borrar(p)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar precio' : 'Nuevo precio'}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input
              placeholder="Sección"
              list="secciones"
              value={edit.seccion}
              onChange={(e) => setEdit({ ...edit, seccion: e.target.value })}
              className="col-span-2"
            />
            <datalist id="secciones">{secs.map((s) => <option key={s} value={s} />)}</datalist>
            <Input placeholder="Concepto" value={edit.concepto} onChange={(e) => setEdit({ ...edit, concepto: e.target.value })} />
            <Input placeholder="Precio ($25)" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} />
          </div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Notas</label>
          <textarea
            value={edit.notas || ''}
            onChange={(e) => setEdit({ ...edit, notas: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.concepto.trim() || !edit.seccion.trim()) return
                const payload = { seccion: edit.seccion, concepto: edit.concepto, precio: edit.precio, notas: edit.notas, orden: edit.orden || 0 }
                if (edit.id) await supabase.from('price_list').update(payload).eq('id', edit.id)
                else await supabase.from('price_list').insert([{ ...payload, creado_por: profile.id }])
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
