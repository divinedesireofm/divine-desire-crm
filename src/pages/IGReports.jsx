import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

function fmtTS(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function IGReports() {
  const { profile, hasAnyRole } = useAuth()
  const esManager = hasAnyRole(['admin', 'ig_manager'])
  const [cuentas, setCuentas] = useState([])
  const [reportes, setReportes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ account_id: '', texto: '', posts_publicados: '', historias_publicadas: '', incidencias: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username').order('username'),
      supabase.from('ig_reports').select('*, instagram_accounts(username), profiles(full_name)').order('created_at', { ascending: false }).limit(200),
    ])
    setCuentas(c || [])
    setReportes(r || [])
    if (c?.length && !form.account_id) setForm((f) => ({ ...f, account_id: c[0].id }))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function enviar(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (!form.texto.trim()) { setError('Escribe el reporte.'); return }
    setBusy(true)
    const { error } = await supabase.from('ig_reports').insert([{
      account_id: form.account_id,
      assistant_id: profile.id,
      texto: form.texto.trim(),
      posts_publicados: form.posts_publicados ? parseInt(form.posts_publicados) : null,
      historias_publicadas: form.historias_publicadas ? parseInt(form.historias_publicadas) : null,
      incidencias: form.incidencias || null,
    }])
    setBusy(false)
    if (error) { setError('No se pudo enviar. ¿Tienes esa cuenta asignada?'); return }
    setForm((f) => ({ ...f, texto: '', posts_publicados: '', historias_publicadas: '', incidencias: '' }))
    setOk('Reporte enviado ✓')
    load()
  }

  return (
    <div>
      <PageHeader title="Reportes de Instagram" subtitle="Reporta el trabajo del día en cada cuenta." />

      <Panel className="p-5 mb-6">
        <form onSubmit={enviar}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
            </Select>
            <Input type="number" placeholder="Posts publicados" value={form.posts_publicados} onChange={(e) => setForm({ ...form, posts_publicados: e.target.value })} />
            <Input type="number" placeholder="Historias publicadas" value={form.historias_publicadas} onChange={(e) => setForm({ ...form, historias_publicadas: e.target.value })} />
          </div>
          <textarea
            value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })}
            placeholder="Qué se ha hecho hoy en esta cuenta..." rows={3}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <Input placeholder="Incidencias (opcional): restricción, bloqueo, etc." value={form.incidencias} onChange={(e) => setForm({ ...form, incidencias: e.target.value })} className="mb-3" />
          {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
          {ok && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{ok}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar reporte'}</Button>
        </form>
      </Panel>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : reportes.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin reportes todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {reportes.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center gap-2 mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{r.profiles?.full_name}</strong>
                  <span>· {r.instagram_accounts?.username}</span>
                  <span>· {fmtTS(r.created_at)}</span>
                  {(r.posts_publicados || r.historias_publicadas) && (
                    <span>· {r.posts_publicados || 0} posts, {r.historias_publicadas || 0} historias</span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.texto}</p>
                {r.incidencias && <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>⚠️ {r.incidencias}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
