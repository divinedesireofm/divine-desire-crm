import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, PageHeader, DeltaBadge } from '../components/ui'
import logo from '../assets/logo.png'

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) }
function fmtFecha(ts) { return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) }

export default function ModelPortal() {
  const [modelo, setModelo] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [contenido, setContenido] = useState([])
  const [anuncios, setAnuncios] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [nuevaSolicitud, setNuevaSolicitud] = useState('')
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: m } = await supabase.from('models').select('*').limit(1).single()
    setModelo(m || null)
    if (m) {
      const [{ data: mets }, { data: cont }, { data: anun }, { data: sol }] = await Promise.all([
        supabase.from('weekly_metrics').select('*').eq('model_id', m.id).order('week_start', { ascending: true }),
        supabase.from('content_assignments').select('*').eq('model_id', m.id).order('enviado_en', { ascending: false }),
        supabase.from('announcements').select('*').in('ambito', ['general', 'modelos']).order('fijado', { ascending: false }).order('created_at', { ascending: false }).limit(10),
        supabase.from('model_requests').select('*').eq('model_id', m.id).order('created_at', { ascending: false }),
      ])
      setMetrics(mets || [])
      setContenido(cont || [])
      setAnuncios(anun || [])
      setSolicitudes(sol || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function marcarHecho(id) {
    await supabase.from('content_assignments').update({ hecho_en: new Date().toISOString().slice(0, 10) }).eq('id', id)
    load()
  }

  async function enviarSolicitud(e) {
    e.preventDefault()
    if (!nuevaSolicitud.trim() || !modelo) return
    setEnviandoSolicitud(true)
    await supabase.from('model_requests').insert([{ model_id: modelo.id, mensaje: nuevaSolicitud.trim() }])
    setNuevaSolicitud('')
    setEnviandoSolicitud(false)
    load()
  }

  const pendientes = contenido.filter((c) => !c.hecho_en)
  const hechos = contenido.filter((c) => c.hecho_en)
  const ultima = metrics[metrics.length - 1]
  const anterior = metrics[metrics.length - 2]

  const chartData = metrics.map((m) => ({ week: m.week_start, Facturación: Number(m.billing_total ?? m.of_net_sales) || 0 }))

  if (loading) {
    return <p className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
  }

  if (!modelo) {
    return (
      <div className="p-8 text-center">
        <img src={logo} alt="Divine Desire" className="h-16 object-contain mx-auto mb-4" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Tu cuenta todavía no está enlazada a ninguna ficha. Avisa al equipo para que lo revisen.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={`Hola, ${modelo.stage_name}`} subtitle="Tu contenido pendiente y tus estadísticas." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Panel className="p-5">
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Facturación última semana</p>
          <p className="text-2xl font-display font-semibold gold-text">${fmtEs(ultima?.billing_total ?? ultima?.of_net_sales)}</p>
          <DeltaBadge actual={ultima?.billing_total ?? ultima?.of_net_sales} anterior={anterior?.billing_total ?? anterior?.of_net_sales} />
        </Panel>
        <Panel className="p-5">
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Subs nuevas última semana</p>
          <p className="text-2xl font-display font-semibold gold-text">{fmtEs(ultima?.of_subs_new)}</p>
          <DeltaBadge actual={ultima?.of_subs_new} anterior={anterior?.of_subs_new} />
        </Panel>
        <Panel className="p-5">
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Contenido pendiente</p>
          <p className="text-2xl font-display font-semibold gold-text">{pendientes.length}</p>
        </Panel>
      </div>

      {chartData.length > 1 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Evolución de facturación ($)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="Facturación" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">📤 Contenido que te han pedido</p>
        {pendientes.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No tienes nada pendiente ahora mismo.</p>
        ) : (
          <div className="space-y-3">
            {pendientes.map((c) => (
              <div key={c.id} className="p-3 rounded-md flex items-center justify-between gap-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <div>
                  <p className="text-sm font-medium">{c.titulo}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pedido el {c.enviado_en}</p>
                </div>
                <Button onClick={() => marcarHecho(c.id)}>Ya lo he subido</Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {hechos.length > 0 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-4">✅ Ya entregado</p>
          <div className="space-y-2">
            {hechos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span>{c.titulo}</span>
                <span style={{ color: 'var(--success)' }}>{c.hecho_en}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {anuncios.length > 0 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-4">📣 Comunicados</p>
          <div className="space-y-3">
            {anuncios.map((a) => (
              <div key={a.id} className="pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{a.texto}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{fmtFecha(a.created_at)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <p className="text-sm font-medium mb-3">💬 Pide algo al equipo</p>
        <form onSubmit={enviarSolicitud} className="flex gap-2 mb-4">
          <Input
            className="flex-1"
            placeholder="Ej: necesito ideas de contenido nuevo, quiero cambiar mi horario de fotos..."
            value={nuevaSolicitud}
            onChange={(e) => setNuevaSolicitud(e.target.value)}
          />
          <Button type="submit" disabled={enviandoSolicitud}>{enviandoSolicitud ? 'Enviando…' : 'Enviar'}</Button>
        </form>
        {solicitudes.length > 0 && (
          <div className="space-y-2">
            {solicitudes.map((s) => (
              <div key={s.id} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm">{s.mensaje}</p>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full shrink-0 ml-2"
                    style={{ background: s.estado === 'atendida' ? 'var(--success)22' : 'var(--gold)22', color: s.estado === 'atendida' ? 'var(--success)' : 'var(--gold)' }}
                  >
                    {s.estado === 'atendida' ? 'Atendida' : 'Pendiente'}
                  </span>
                </div>
                {s.respuesta && <p className="text-sm mt-1" style={{ color: 'var(--accent)' }}>↳ {s.respuesta}</p>}
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{fmtFecha(s.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
