import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Table, Td, PageHeader } from '../components/ui'
import { ModelAvatar } from '../components/ModelAvatar'

const TURNOS = [
  { id: 'madrugada', n: 'Madrugada' },
  { id: 'mañana', n: 'Mañana' },
  { id: 'tarde', n: 'Tarde' },
]

function TurnoChips({ selected, onChange }) {
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.concat([id]))
  }
  return (
    <div className="flex gap-1.5">
      {TURNOS.map((t) => {
        const on = selected.includes(t.id)
        return (
          <button
            key={t.id} type="button" onClick={() => toggle(t.id)}
            className="px-2.5 py-1 rounded-full text-xs"
            style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
          >
            {t.n}
          </button>
        )
      })}
    </div>
  )
}

function ModeloChips({ modelos, selected, onChange }) {
  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.concat([id]))
  }
  if (!modelos.length) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No hay modelos en el CRM.</span>
  return (
    <div className="flex flex-wrap gap-1.5 max-w-[420px]">
      {modelos.map((m) => {
        const on = selected.includes(m.id)
        return (
          <button
            key={m.id} type="button" onClick={() => toggle(m.id)}
            className="inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs"
            style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
          >
            <ModelAvatar name={m.stage_name} size={22} />{on ? '✓ ' : ''}{m.stage_name}
          </button>
        )
      })}
    </div>
  )
}

export default function Chatters() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [chatters, setChatters] = useState([])
  const [rolesPorUsuario, setRolesPorUsuario] = useState({})
  const [unlinkedProfiles, setUnlinkedProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [shiftDrafts, setShiftDrafts] = useState({})
  const [editando, setEditando] = useState(null) // id del chatter que se está editando
  const [editTurnos, setEditTurnos] = useState([])
  const [editModelos, setEditModelos] = useState([])
  const [modelos, setModelos] = useState([])
  const [errorGuardar, setErrorGuardar] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: existing }, allChatterProfiles, { data: md }] = await Promise.all([
      supabase.from('chatters').select('*, profiles(full_name)'),
      getProfilesByRoles(['chatter', 'manager']),
      supabase.from('models').select('id, stage_name, status').order('stage_name'),
    ])
    setChatters(existing || [])
    setModelos((md || []).filter((m) => m.status !== 'baja'))
    const existingIds = new Set((existing || []).map((c) => c.id))
    setUnlinkedProfiles(allChatterProfiles.filter((p) => !existingIds.has(p.id)))

    if (existing?.length) {
      const { data: ur } = await supabase.from('user_roles').select('user_id, role').in('user_id', existing.map((c) => c.id))
      const byUser = {}
      ;(ur || []).forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r.role) })
      setRolesPorUsuario(byUser)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function activateChatter(profileId) {
    const shift = (shiftDrafts[profileId] || []).join(',')
    await supabase.from('chatters').insert([{ id: profileId, shift, active: true }])
    load()
  }

  function startEdit(c) {
    setEditando(c.id)
    setEditTurnos((c.shift || '').split(',').map((s) => s.trim()).filter(Boolean))
    setEditModelos(c.models_assigned || [])
    setErrorGuardar('')
  }

  async function guardarEdicion(id) {
    const { error } = await supabase.from('chatters').update({ shift: editTurnos.join(','), models_assigned: editModelos }).eq('id', id)
    if (error) { setErrorGuardar('No se pudo guardar: ' + error.message); return }
    setEditando(null)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Chatters"
        subtitle="Equipo de chat activo, turno y modelos asignados. Pulsa «Editar» para cambiar el turno y las modelos de cada chatter."
      />

      {errorGuardar && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{errorGuardar}</p>}
      <Panel className="mb-6">
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Nombre', 'Turno', 'Estado', 'Modelos asignados', '']}
            rows={chatters}
            renderRow={(c) => {
              const esManager = (rolesPorUsuario[c.id] || []).includes('manager')
              return (
                <>
                  <Td>
                    {c.profiles?.full_name}
                    {esManager && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--gold)22', color: 'var(--gold)' }}>
                        ★ Manager
                      </span>
                    )}
                  </Td>
                  <Td>
                    {editando === c.id ? (
                      <TurnoChips selected={editTurnos} onChange={setEditTurnos} />
                    ) : (
                      (c.shift || '').split(',').filter(Boolean).map((s) => TURNOS.find((t) => t.id === s)?.n || s).join(', ') || '—'
                    )}
                  </Td>
                  <Td>{c.active ? 'Activo' : 'Inactivo'}</Td>
                  <Td>
                    {editando === c.id ? (
                      <ModeloChips modelos={modelos} selected={editModelos} onChange={setEditModelos} />
                    ) : (c.models_assigned?.length ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {c.models_assigned.map((id) => modelos.find((m) => m.id === id)).filter(Boolean).map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1.5 text-xs"><ModelAvatar name={m.stage_name} size={22} />{m.stage_name}</span>
                        ))}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>)}
                  </Td>
                  <Td>
                    {canEdit && (
                      editando === c.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => guardarEdicion(c.id)} className="text-xs hover:underline" style={{ color: 'var(--success)' }}>Guardar</button>
                          <button onClick={() => setEditando(null)} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(c)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
                      )
                    )}
                  </Td>
                </>
              )
            }}
          />
        )}
      </Panel>

      {canEdit && unlinkedProfiles.length > 0 && (
        <Panel className="p-5">
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Estas personas ya tienen cuenta creada (chatter o manager) pero aún no están activadas en el equipo:
          </p>
          <div className="space-y-3">
            {unlinkedProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{p.full_name}</span>
                <TurnoChips
                  selected={shiftDrafts[p.id] || []}
                  onChange={(v) => setShiftDrafts({ ...shiftDrafts, [p.id]: v })}
                />
                <Button onClick={() => activateChatter(p.id)}>Activar</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {canEdit && (
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          Para dar de alta a un chatter nuevo, hazlo desde "Equipo".
        </p>
      )}
    </div>
  )
}
