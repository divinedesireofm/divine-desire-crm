import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, PageHeader, DeltaBadge } from '../components/ui'
import logo from '../assets/logo.png'
import { ModelAvatar } from '../components/ModelAvatar'
import { reducirImagen, refrescarFotosModelos } from '../lib/modelPhotos'

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) }
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const TIPO_PEDIDO = { personalizado: 'Personalizado', videollamada: 'Videollamada', video: 'Vídeo', foto: 'Foto', audio: 'Audio', otro: 'Otro' }
const ESTADO_PEDIDO = { pendiente: ['Pendiente', 'var(--gold)'], entregada: ['Entregado', 'var(--success)'], cancelada: ['Cancelado', 'var(--danger)'] }
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
  const [factu, setFactu] = useState([])      // facturación por turno de SU modelo (fecha, ppv, tips…)
  const [pedidos, setPedidos] = useState([])  // personalizados y contenido pedido
  const [masivos, setMasivos] = useState([])  // fechas de masivos PPV
  const [subiendo, setSubiendo] = useState(false)
  const [errFoto, setErrFoto] = useState('')

  async function load() {
    setLoading(true)
    const { data: m } = await supabase.from('models').select('*').limit(1).single()
    setModelo(m || null)
    if (m) {
      const [{ data: mets }, { data: cont }, { data: anun }, { data: sol }, { data: fa }, { data: pe }, { data: ma }] = await Promise.all([
        supabase.from('weekly_metrics').select('*').eq('model_id', m.id).order('week_start', { ascending: true }),
        supabase.from('content_assignments').select('*').eq('model_id', m.id).order('enviado_en', { ascending: false }),
        supabase.from('announcements').select('*').in('ambito', ['general', 'modelos']).order('fijado', { ascending: false }).order('created_at', { ascending: false }).limit(10),
        supabase.from('model_requests').select('*').eq('model_id', m.id).order('created_at', { ascending: false }),
        supabase.rpc('mi_facturacion'),
        supabase.from('requests').select('*').eq('modelo', m.stage_name).order('created_at', { ascending: false }).limit(100),
        supabase.rpc('mis_masivos'),
      ])
      setFactu(fa || []); setPedidos(pe || []); setMasivos(ma || [])
      setMetrics(mets || [])
      setContenido(cont || [])
      setAnuncios(anun || [])
      setSolicitudes(sol || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function cambiarFoto(file) {
    if (!file || !modelo) return
    setErrFoto(''); setSubiendo(true)
    try {
      const blob = await reducirImagen(file)
      const ruta = `${modelo.id}-${Date.now()}.jpg`
      const { error: e1 } = await supabase.storage.from('model-photos').upload(ruta, blob, { contentType: 'image/jpeg' })
      if (e1) throw e1
      const { data } = supabase.storage.from('model-photos').getPublicUrl(ruta)
      const { error: e2 } = await supabase.rpc('cambiar_mi_foto', { url: data.publicUrl })
      if (e2) throw e2
      const vieja = (modelo.photo_url || '').split('/model-photos/')[1]
      if (vieja) supabase.storage.from('model-photos').remove([vieja])
      await load(); refrescarFotosModelos()
    } catch (err) {
      setErrFoto('No se pudo cambiar la foto: ' + (err.message || 'inténtalo de nuevo'))
    }
    setSubiendo(false)
  }

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
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <label className="relative cursor-pointer group shrink-0" title="Cambiar mi foto" style={{ opacity: subiendo ? 0.5 : 1 }}>
          <ModelAvatar name={modelo.stage_name} url={modelo.photo_url || null} size={76} />
          <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={(e) => { cambiarFoto(e.target.files[0]); e.target.value = '' }} />
          <span className="absolute -bottom-1 -right-1 text-xs leading-none rounded-full px-1.5 py-1" style={{ background: 'var(--accent)', color: '#000' }}>✎</span>
        </label>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold font-display">Hola, {modelo.stage_name}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Tu facturación, tu contenido y todo lo que se trabaja contigo.</p>
          <p className="text-xs mt-1" style={{ color: errFoto ? 'var(--danger)' : 'var(--text-muted)' }}>{errFoto || (subiendo ? 'Subiendo foto…' : 'Pulsa tu foto para cambiarla.')}</p>
        </div>
      </div>

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


      {(() => {
        const hoyD = new Date()
        const mesAct = hoyD.getFullYear() + '-' + String(hoyD.getMonth() + 1).padStart(2, '0')
        const ant = new Date(hoyD.getFullYear(), hoyD.getMonth() - 1, 1)
        const mesAnt = ant.getFullYear() + '-' + String(ant.getMonth() + 1).padStart(2, '0')
        const tot = (f) => factu.filter(f).reduce((t, x) => t + Number(x.ppv || 0) + Number(x.tips || 0), 0)
        const porDia = {}
        factu.forEach((x) => { const d = (porDia[x.fecha] = porDia[x.fecha] || { ppv: 0, tips: 0 }); d.ppv += Number(x.ppv || 0); d.tips += Number(x.tips || 0) })
        const dias = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
        return (
          <Panel className="p-5 mb-6">
            <p className="text-sm font-medium mb-4">💰 Lo que se ha facturado contigo</p>
            {factu.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay facturación registrada por el equipo de chat.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[['Este mes', tot((x) => x.fecha.startsWith(mesAct))], ['Mes anterior', tot((x) => x.fecha.startsWith(mesAnt))], ['Total', tot(() => true)]].map(([t, v]) => (
                    <div key={t} className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t}</p>
                      <p className="text-lg font-display font-semibold gold-text tabular-nums">{money(v)}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Día', 'PPV', 'Tips', 'Total'].map((h) => <th key={h} className="text-left py-2 pr-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {dias.map(([d, v]) => (
                        <tr key={d} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-2 pr-3">{fmtD(d)}</td>
                          <td className="py-2 pr-3 tabular-nums">{money(v.ppv)}</td>
                          <td className="py-2 pr-3 tabular-nums">{money(v.tips)}</td>
                          <td className="py-2 pr-3 tabular-nums font-medium">{money(v.ppv + v.tips)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Últimos 14 días con facturación. Importes brutos registrados por el equipo de chat en sus turnos.</p>
              </>
            )}
          </Panel>
        )
      })()}

      {pedidos.length > 0 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-4">🎬 Personalizados y contenido que se te ha pedido</p>
          <div className="space-y-2">
            {pedidos.map((p) => {
              const [en, ec] = ESTADO_PEDIDO[p.estado] || ESTADO_PEDIDO.pendiente
              return (
                <div key={p.id} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-medium">{TIPO_PEDIDO[p.tipo] || p.tipo}{p.fan ? ` · ${p.fan}` : ''}{p.precio ? ` · ${p.precio}` : ''}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ec}22`, color: ec }}>{en}</span>
                  </div>
                  {p.descripcion && <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{p.descripcion}</p>}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Pedido el {fmtFecha(p.created_at)}{p.fecha_entrega ? ` · entrega estimada ${fmtD(p.fecha_entrega)}` : ''}</p>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {masivos.length > 0 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">📣 Masivos PPV programados contigo</p>
          <div className="flex flex-wrap gap-2">
            {masivos.map((d, i) => <span key={i} className="px-2.5 py-1 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{fmtD(d)}</span>)}
          </div>
        </Panel>
      )}

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
