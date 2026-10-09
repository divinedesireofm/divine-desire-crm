import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Select, PageHeader } from '../components/ui'
import ModelName from '../components/ModelAvatar'

function fmtTS(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function UnifiedReportsInbox() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: chat }, { data: ig }] = await Promise.all([
      supabase.from('shift_reports').select('id, fecha, turno, created_at, profiles(full_name), shift_report_details(texto, trafico, facturacion, tips, models(stage_name))'),
      supabase.from('ig_reports').select('id, fecha, created_at, texto, posts_publicados, historias_publicadas, incidencias, profiles(full_name), instagram_accounts(username)'),
    ])

    const normChat = (chat || []).map((r) => ({
      _key: `chat-${r.id}`,
      equipo: 'Chatting',
      persona: r.profiles?.full_name,
      fecha: r.fecha,
      created_at: r.created_at,
      resumen: `Turno ${r.turno} · ${r.shift_report_details?.length || 0} modelo(s)`,
      detalle: r.shift_report_details,
      tipo: 'chat',
    }))
    const normIG = (ig || []).map((r) => ({
      _key: `ig-${r.id}`,
      equipo: 'Instagram',
      persona: r.profiles?.full_name,
      fecha: r.fecha,
      created_at: r.created_at,
      resumen: `${r.instagram_accounts?.username || ''} · ${r.texto.slice(0, 80)}${r.texto.length > 80 ? '…' : ''}`,
      detalle: r,
      tipo: 'ig',
    }))

    const combinado = [...normChat, ...normIG].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setItems(combinado)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visibles = items.filter((i) => filtro === 'todos' || i.tipo === filtro)

  return (
    <div>
      <PageHeader title="Bandeja de reportes" subtitle="Todos los reportes del equipo (Chatting e Instagram) en un mismo sitio." />

      <div className="mb-6 max-w-xs">
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos los equipos</option>
          <option value="chat">Solo Chatting</option>
          <option value="ig">Solo Instagram</option>
        </Select>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin reportes todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visibles.map((i) => (
              <div key={i._key}>
                <div
                  onClick={() => setAbierto(abierto === i._key ? null : i._key)}
                  className="p-4 flex items-center gap-3 cursor-pointer hover:opacity-80"
                >
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: i.tipo === 'chat' ? 'var(--accent-soft)' : 'var(--gold)22', color: i.tipo === 'chat' ? 'var(--accent)' : 'var(--gold)' }}
                  >
                    {i.equipo}
                  </span>
                  <strong className="text-sm w-32 truncate">{i.persona}</strong>
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{i.resumen}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{fmtTS(i.created_at)}</span>
                </div>
                {abierto === i._key && (
                  <div className="px-4 pb-4 text-sm" style={{ background: 'var(--panel-alt)' }}>
                    {i.tipo === 'chat' ? (
                      <div className="space-y-2 pt-3">
                        {(i.detalle || []).map((d, idx) => (
                          <div key={idx}>
                            <p className="font-medium"><ModelName name={d.models?.stage_name} /> {d.facturacion ? `· $${d.facturacion}` : ''} {d.tips ? `· $${d.tips} tips` : ''}</p>
                            <p style={{ color: 'var(--text-muted)' }}>{d.texto}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="pt-3">
                        <p style={{ color: 'var(--text-muted)' }}>{i.detalle.texto}</p>
                        {i.detalle.incidencias && <p className="mt-1" style={{ color: 'var(--danger)' }}>⚠️ {i.detalle.incidencias}</p>}
                      </div>
                    )}
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
