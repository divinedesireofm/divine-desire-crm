import { useState } from 'react'
import { FICHA, SINO, progresoFicha, valorTexto, textoFicha } from '../lib/fichaModelo'
import { Button, Input } from './ui'

const lbl = { color: 'var(--text-muted)' }
const areaStyle = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }

// Ficha general de una modelo: se ve en lectura para todo el equipo y el admin la edita aquí mismo.
export default function FichaModelo({ modelo, datos, canEdit, onGuardar, onCerrar, propia = false }) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const { hechos, total } = progresoFicha(datos)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  function empezar() { setF({ ...(datos || {}) }); setErr(''); setEditando(true) }
  async function guardar(e) {
    e.preventDefault(); setGuardando(true); setErr('')
    const limpio = {}
    Object.entries(f).forEach(([k, v]) => { const t = typeof v === 'string' ? v.trim() : v; if (t !== '' && t !== null && t !== undefined) limpio[k] = t })
    const r = await onGuardar(limpio)
    setGuardando(false)
    if (r?.error) { setErr(r.error); return }
    setEditando(false)
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(textoFicha(modelo.stage_name, datos)) } catch { /* sin portapapeles */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 1500)
  }

  return (
    <div className="p-5" style={{ background: 'var(--panel-alt)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <p className="font-medium">Ficha general · {modelo.stage_name}</p>
          <p className="text-xs" style={lbl}>Información que no importa que sepan los usuarios · {hechos} de {total} campos rellenados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editando && <Button variant="ghost" type="button" onClick={copiar}>{copiado ? '✓ Copiada' : 'Copiar ficha'}</Button>}
          {!editando && canEdit && <Button type="button" onClick={empezar}>{hechos ? 'Editar ficha' : 'Rellenar ficha'}</Button>}
          {onCerrar && <Button variant="ghost" type="button" onClick={onCerrar}>Cerrar</Button>}
        </div>
      </div>

      {!editando ? (
        hechos === 0 ? (
          <p className="text-sm py-4" style={lbl}>{canEdit ? (propia ? 'Todavía no has rellenado tu ficha. Pulsa «Rellenar ficha».' : 'Todavía no hay información general de esta modelo. Pulsa «Rellenar ficha».') : 'Todavía no hay información general de esta modelo.'}</p>
        ) : (
          <div className="space-y-5">
            {FICHA.map((s) => {
              const filas = s.campos.filter((c) => valorTexto(c, datos))
              if (!filas.length) return null
              return (
                <div key={s.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>{s.titulo}</p>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                    {filas.map((c) => (
                      <div key={c.k} className={c.largo ? 'md:col-span-2' : ''}>
                        <dt className="text-xs" style={lbl}>{c.n}</dt>
                        <dd className="text-sm whitespace-pre-wrap break-words">{valorTexto(c, datos)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
          </div>
        )
      ) : (
        <form onSubmit={guardar} className="space-y-6">
          {FICHA.map((s) => (
            <div key={s.id}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>{s.titulo}</p>
              {s.intro && <p className="text-xs mb-3" style={lbl}>{s.intro}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {s.campos.map((c) => (
                  <div key={c.k} className={c.largo || c.detalle ? 'md:col-span-2' : ''}>
                    <label className="text-xs mb-1 block" style={lbl}>{c.n}{c.ayuda ? <span className="italic"> · {c.ayuda}</span> : null}</label>
                    {c.tipo === 'sino' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {[['si', SINO.si], ['no', SINO.no], ['', 'Sin indicar']].map(([v, t]) => (
                          <button key={v || 'x'} type="button" onClick={() => set(c.k, v)} className="px-3 py-1.5 rounded-md text-sm"
                            style={{ background: (f[c.k] || '') === v ? 'var(--accent-soft)' : 'var(--panel)', border: `1px solid ${(f[c.k] || '') === v ? 'var(--accent)' : 'var(--border)'}`, color: (f[c.k] || '') === v ? 'var(--accent)' : 'var(--text)' }}>{t}</button>
                        ))}
                        {c.detalle && f[c.k] === 'si' && <div className="grow basis-64"><Input placeholder="Virtual / presencial / zona o ciudad…" value={f[c.detalle] || ''} onChange={(e) => set(c.detalle, e.target.value)} /></div>}
                      </div>
                    ) : c.largo ? (
                      <textarea rows={3} value={f[c.k] || ''} onChange={(e) => set(c.k, e.target.value)} className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y" style={areaStyle} />
                    ) : (
                      <Input value={f[c.k] || ''} onChange={(e) => set(c.k, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {err && <p className="text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ficha'}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </div>
  )
}
