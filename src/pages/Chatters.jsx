import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Table, Td, PageHeader } from '../components/ui'

export default function Chatters() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [chatters, setChatters] = useState([])
  const [unlinkedProfiles, setUnlinkedProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [shiftDrafts, setShiftDrafts] = useState({})

  async function load() {
    setLoading(true)
    const [{ data: existing }, allChatterProfiles] = await Promise.all([
      supabase.from('chatters').select('*, profiles(full_name)'),
      getProfilesByRoles(['chatter', 'manager']),
    ])
    setChatters(existing || [])
    const existingIds = new Set((existing || []).map((c) => c.id))
    setUnlinkedProfiles(allChatterProfiles.filter((p) => !existingIds.has(p.id)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function activateChatter(profileId) {
    const shift = shiftDrafts[profileId] || ''
    await supabase.from('chatters').insert([{ id: profileId, shift, active: true }])
    load()
  }

  return (
    <div>
      <PageHeader
        title="Chatters"
        subtitle="Equipo de chat activo, turno y modelos asignados."
      />

      <Panel className="mb-6">
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Nombre', 'Turno', 'Estado', 'Modelos asignados']}
            rows={chatters}
            renderRow={(c) => (
              <>
                <Td>{c.profiles?.full_name}</Td>
                <Td>{c.shift || '—'}</Td>
                <Td>{c.active ? 'Activo' : 'Inactivo'}</Td>
                <Td>{c.models_assigned?.length || 0}</Td>
              </>
            )}
          />
        )}
      </Panel>

      {canEdit && unlinkedProfiles.length > 0 && (
        <Panel className="p-5">
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Estas personas ya tienen cuenta creada (chatter o manager) pero aún no están activadas en el equipo:
          </p>
          <div className="space-y-2">
            {unlinkedProfiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{p.full_name}</span>
                <Input
                  placeholder="Turno (madrugada/mañana/tarde)"
                  className="max-w-xs"
                  value={shiftDrafts[p.id] || ''}
                  onChange={(e) => setShiftDrafts({ ...shiftDrafts, [p.id]: e.target.value })}
                />
                <Button onClick={() => activateChatter(p.id)}>Activar</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {canEdit && (
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          Para dar de alta a un chatter nuevo: invítalo desde Supabase → Authentication → Users → Invite user.
          Al aceptar la invitación aparecerá aquí automáticamente con rol "chatter".
        </p>
      )}
    </div>
  )
}
