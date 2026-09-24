import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const AMBITO_LABEL = { general: 'General (ambos equipos)', chatting: 'Chatting', instagram: 'Instagram' }
const SCOPE_ROLES = {
  general: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'],
  chatting: ['admin', 'manager', 'chatter'],
  instagram: ['admin', 'ig_manager', 'ig_assistant'],
}

function canCreate(roles) {
  const s = new Set()
  if (roles.includes('admin')) { s.add('general'); s.add('chatting'); s.add('instagram') }
  if (roles.includes('manager')) s.add('chatting')
  if (roles.includes('ig_manager') || roles.includes('ig_assistant')) s.add('instagram')
  return Array.from(s)
}
function canSee(roles) {
  const s = new Set(['general'])
  if (roles.includes('admin') || roles.includes('manager') || roles.includes('chatter')) s.add('chatting')
  if (roles.includes('admin') || roles.includes('ig_manager') || roles.includes('ig_assistant')) s.add('instagram')
  return Array.from(s)
}
function fmtFecha(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Announcements() {
  const { profile, roles, hasAnyRole } = useAuth()
  const scopesCrear = canCreate(roles)
  const scopesVer = canSee(roles)
  const [rows, setRows] = useState([])
  const [reads, setReads] = useState({})
  const [totalUsers, setTotalUsers] = useState({})
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('announcements').select('*').in('ambito', scopesVer).order('fijado', { ascending: false }).order('created_at', { ascending: false })
    setRows(data || [])
    if (data?.length && hasAnyRole(['admin', 'manager', 'ig_manager'])) {
      const { data: r } = await supabase.from('announcement_reads').select('announcement_id').in('announcement_id', data.map((a) => a.id))
      const counts = {}
      ;(r || []).forEach((x) => { counts[x.announcement_id] = (counts[x.announcement_id] || 0) + 1 })
      setReads(counts)
      const { data: urows } = await supabase.from('user_roles').select('user_id, role')
      const tot = {}
      for (const scope of ['general', 'chatting', 'instagram']) {
        const ids = new Set((urows || []).filter((p) => SCOPE_ROLES[scope].includes(p.role)).map((p) => p.user_id))
        tot[scope] = ids.size
      }
      setTotalUsers(tot)
    }
  }
  useEffect(() => { load() }, [])

  async function borrar(a) {
    if (!confirm(`¿Eliminar el anuncio "${a.titulo}"?`)) return
    await supabase.from('announcements').delete().eq('id', a.id)
    load()
  }
  async function togglePin(a) {
    await supabase.from('announcements').update({ fijado: !a.fijado }).eq('id', a.id)
    load()
  }

  const porAmbito = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.ambito] = g[r.ambito] || []).push(r) }
    return g
  }, [rows])

  return (
    <div>
      <PageHeader
        title="Anuncios"
        subtitle="Tablón general y por equipo. El equipo debe marcarlos como vistos antes de trabajar."
        action={scopesCrear.length > 0 && (
          <Button onClick={() => setEdit({ titulo: '', texto: '', ambito: scopesCrear[0] })}>+ Nuevo anuncio</Button>
        )}
      />

      {edit && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">Nuevo anuncio</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input placeholder="Título" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} />
            <Select value={edit.ambito} onChange={(e) => setEdit({ ...edit, ambito: e.target.value })}>
              {scopesCrear.map((s) => <option key={s} value={s}>{AMBITO_LABEL[s]}</option>)}
            </Select>
          </div>
          <textarea
            value={edit.texto}
            onChange={(e) => setEdit({ ...edit, texto: e.target.value })}
            rows={3}
            placeholder="Escribe el anuncio..."
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.titulo.trim() || !edit.texto.trim()) return
                await supabase.from('announcements').insert([{ titulo: edit.titulo, texto: edit.texto, ambito: edit.ambito, fijado: false, creado_por: profile.id }])
                setEdit(null); load()
              }}
            >
              Publicar
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}

      {scopesVer.map((scope) => (
        <div key={scope} className="mb-6">
          <p className="text-sm font-medium mb-2">{AMBITO_LABEL[scope]}</p>
          {(porAmbito[scope] || []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin anuncios en este tablón.</p>
          ) : (
            <div className="space-y-3">
              {porAmbito[scope].map((a) => (
                <Panel key={a.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    {a.fijado && <span style={{ color: 'var(--gold)' }}>📌</span>}
                    <p className="font-medium">{a.titulo}</p>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{fmtFecha(a.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'var(--text-muted)' }}>{a.texto}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {hasAnyRole(['admin', 'manager', 'ig_manager']) && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Visto por {reads[a.id] || 0}/{totalUsers[scope] || '—'}
                      </span>
                    )}
                    {(a.creado_por === profile.id || hasAnyRole(['admin'])) && (
                      <>
                        <button onClick={() => togglePin(a)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                          {a.fijado ? 'Desfijar' : 'Fijar'}
                        </button>
                        <button onClick={() => borrar(a)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                      </>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
