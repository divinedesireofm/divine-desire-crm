import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Input } from '../components/ui'

const SERIF = 'Georgia, "Times New Roman", serif'
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
// De más leve a más grave: del dorado al rojo
const GRAVEDAD = ['#d4af37', '#e0a032', '#e07a2f', '#d9482f', '#b3171f']

function Campo({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
const areaStyle = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function Rules() {
  const { hasRole, profile } = useAuth()
  const esAdmin = hasRole('admin')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null) // { id|null, tipo, titulo, contenido }
  const [gestion, setGestion] = useState(false)

  async function cargar() {
    const { data, error: e } = await supabase.from('company_rules').select('*').order('orden').order('created_at')
    if (e) setError('No se pudieron cargar las normas. ¿Se ha ejecutado la migración 57?')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const intro = rows.find((r) => r.tipo === 'intro')
  const normas = useMemo(() => rows.filter((r) => r.tipo === 'norma'), [rows])
  const escala = rows.find((r) => r.tipo === 'escala')
  const pasos = (escala?.contenido || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, ...b] = l.split('→')
    return b.length ? [a.trim(), b.join('→').trim()] : ['', l]
  })

  async function guardar() {
    setError('')
    const e = editando
    if (e.tipo !== 'intro' && !e.titulo.trim()) { setError('Pon un título.'); return }
    if (!e.contenido.trim()) { setError('Escribe el contenido.'); return }
    const datos = { tipo: e.tipo, titulo: e.titulo.trim(), contenido: e.contenido.trim(), updated_at: new Date().toISOString(), updated_by: profile?.id || null }
    let res
    if (e.id) res = await supabase.from('company_rules').update(datos).eq('id', e.id)
    else res = await supabase.from('company_rules').insert([{ ...datos, orden: (normas[normas.length - 1]?.orden || 0) + 1 }])
    if (res.error) { setError('No se pudo guardar: ' + res.error.message); return }
    setEditando(null)
    cargar()
  }
  async function quitar(r) {
    if (!confirm(`¿Quitar la norma «${r.titulo}»? Dejará de verla todo el equipo.`)) return
    const { error: e } = await supabase.from('company_rules').delete().eq('id', r.id)
    if (e) { setError('No se pudo quitar: ' + e.message); return }
    cargar()
  }
  async function mover(r, dir) {
    const i = normas.findIndex((x) => x.id === r.id)
    const otro = normas[i + dir]
    if (!otro) return
    // Reasigna todas las posiciones para que el orden sea siempre limpio
    const nuevo = normas.slice()
    nuevo[i] = otro; nuevo[i + dir] = r
    const res = await Promise.all(nuevo.map((x, k) => (x.orden === k + 1 ? null : supabase.from('company_rules').update({ orden: k + 1 }).eq('id', x.id))).filter(Boolean))
    if (res.some((x) => x.error)) setError('No se pudo reordenar.')
    cargar()
  }

  const formulario = editando && (
    <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--panel)', border: '1px solid var(--accent)' }}>
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--accent)' }}>
        {editando.id ? 'Modificar' : 'Nueva norma'}{editando.tipo === 'intro' ? ' · introducción' : editando.tipo === 'escala' ? ' · consecuencias' : ''}
      </p>
      <Campo label={editando.tipo === 'intro' ? 'Título principal' : 'Título'}>
        <Input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
      </Campo>
      <Campo label={editando.tipo === 'escala' ? 'Una consecuencia por línea, con el formato «Primera falta → Advertencia»' : 'Texto'}>
        <textarea
          value={editando.contenido} onChange={(e) => setEditando({ ...editando, contenido: e.target.value })}
          rows={editando.tipo === 'escala' ? 6 : 5}
          className="w-full px-3 py-2 rounded-md text-sm outline-none" style={areaStyle}
        />
      </Campo>
      <div className="flex gap-2">
        <Button onClick={guardar}>Guardar</Button>
        <Button variant="ghost" onClick={() => { setEditando(null); setError('') }}>Cancelar</Button>
      </div>
    </div>
  )

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>

  return (
    <div className="max-w-3xl mx-auto pb-10">
      {/* Cabecera */}
      <div className="text-center pt-4 pb-8">
        <p className="text-xs tracking-[0.5em] uppercase mb-3" style={{ color: 'var(--accent)' }}>Divine Desire</p>
        <h1 className="text-3xl sm:text-4xl uppercase" style={{ fontFamily: SERIF, letterSpacing: '0.18em', fontWeight: 700 }}>
          {intro?.titulo || 'Normas de la agencia'}
        </h1>
        <div className="flex items-center justify-center gap-3 mt-5">
          <span style={{ width: 70, height: 1, background: 'linear-gradient(to right, transparent, var(--accent))' }} />
          <span style={{ color: 'var(--accent)', fontSize: 10 }}>◆</span>
          <span style={{ width: 70, height: 1, background: 'linear-gradient(to left, transparent, var(--accent))' }} />
        </div>
      </div>

      {esAdmin && (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
          {gestion && <Button onClick={() => setEditando({ id: null, tipo: 'norma', titulo: '', contenido: '' })}>+ Añadir norma</Button>}
          <Button variant={gestion ? 'primary' : 'ghost'} onClick={() => { setGestion(!gestion); setEditando(null); setError('') }}>{gestion ? 'Terminar edición' : 'Editar normas'}</Button>
        </div>
      )}

      {error && <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{error}</p>}
      {editando && !editando.id && formulario}

      {/* Introducción */}
      {intro && (editando?.id === intro.id ? formulario : (
        <div className="relative rounded-lg px-6 py-5 mb-8" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)' }}>
          <p className="text-base leading-relaxed" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>{intro.contenido}</p>
          {gestion && <button onClick={() => setEditando({ id: intro.id, tipo: 'intro', titulo: intro.titulo, contenido: intro.contenido })} className="text-xs hover:underline mt-3" style={{ color: 'var(--accent)' }}>Modificar introducción</button>}
        </div>
      ))}

      {/* Normas */}
      <div className="space-y-4">
        {normas.map((r, i) => (editando?.id === r.id ? <div key={r.id}>{formulario}</div> : (
          <div key={r.id} className="flex gap-5 rounded-lg px-5 py-5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div className="shrink-0 text-center" style={{ width: 56 }}>
              <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, color: 'var(--accent)', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</div>
              <div className="mt-2 mx-auto" style={{ width: 22, height: 2, background: 'var(--accent)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="uppercase text-sm font-semibold mb-1.5" style={{ letterSpacing: '0.14em' }}>{r.titulo}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{r.contenido}</p>
              {gestion && (
                <div className="flex flex-wrap gap-4 text-xs mt-3">
                  <button onClick={() => setEditando({ id: r.id, tipo: 'norma', titulo: r.titulo, contenido: r.contenido })} className="hover:underline" style={{ color: 'var(--accent)' }}>Modificar</button>
                  <button onClick={() => mover(r, -1)} disabled={i === 0} className="hover:underline disabled:opacity-30" style={{ color: 'var(--text-muted)' }}>↑ Subir</button>
                  <button onClick={() => mover(r, 1)} disabled={i === normas.length - 1} className="hover:underline disabled:opacity-30" style={{ color: 'var(--text-muted)' }}>↓ Bajar</button>
                  <button onClick={() => quitar(r)} className="hover:underline" style={{ color: 'var(--danger)' }}>Quitar</button>
                </div>
              )}
            </div>
          </div>
        )))}
        {normas.length === 0 && <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay normas.</p>}
      </div>

      {/* Consecuencias */}
      {escala && (editando?.id === escala.id ? <div className="mt-10">{formulario}</div> : (
        <div className="mt-10 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--panel)' }}>
          <div className="px-6 py-4 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="uppercase text-sm font-semibold" style={{ letterSpacing: '0.3em', color: 'var(--danger)' }}>{escala.titulo || 'Consecuencias'}</p>
          </div>
          <div>
            {pasos.map(([falta, sancion], i) => {
              const c = GRAVEDAD[Math.min(i, GRAVEDAD.length - 1)]
              return (
                <div key={i} className="flex items-center gap-4 px-6 py-3.5" style={{ borderBottom: i === pasos.length - 1 ? 'none' : '1px solid var(--border)', borderLeft: `4px solid ${c}`, background: `${c}${i === pasos.length - 1 ? '22' : '0d'}` }}>
                  <span className="shrink-0 text-center" style={{ width: 34, fontFamily: SERIF, fontWeight: 700, color: c, fontSize: 18 }}>{ROMANOS[i] || i + 1}</span>
                  <div className="min-w-0 flex-1">
                    {falta && <p className="text-xs uppercase" style={{ letterSpacing: '0.12em', color: 'var(--text-muted)' }}>{falta}</p>}
                    <p className="text-sm font-semibold" style={{ color: i === pasos.length - 1 ? c : 'var(--text)' }}>{sancion}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {gestion && (
            <div className="px-6 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEditando({ id: escala.id, tipo: 'escala', titulo: escala.titulo, contenido: escala.contenido })} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Modificar consecuencias</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
