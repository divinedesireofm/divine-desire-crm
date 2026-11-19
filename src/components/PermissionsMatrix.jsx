import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { SECTIONS, ROLES_EDITABLES, PERMISOS_EXTRA } from '../lib/navigation'
import { Panel, Button } from './ui'

// Tabla de permisos: cada fila es un apartado del CRM y cada columna un rol.
// Solo la ve el admin. Los cambios se acumulan y se aplican al pulsar «Guardar cambios».
export default function PermissionsMatrix() {
  const { perms, refreshPermissions } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [borrador, setBorrador] = useState({}) // { 'rol|ruta': { rol, item, valor } } cambios aún sin guardar

  const efectivo = (rol, item) => {
    const k = rol + '|' + item.to
    if (k in borrador) return borrador[k].valor
    return k in perms ? perms[k] : item.roles.includes(rol)
  }
  const personalizado = (rol, item) => {
    const k = rol + '|' + item.to
    if (k in borrador) return borrador[k].valor !== item.roles.includes(rol)
    return k in perms && perms[k] !== item.roles.includes(rol)
  }

  // Marca el cambio en el borrador; si vuelve a coincidir con lo ya guardado, se quita del borrador
  function cambiar(rol, item, valor) {
    setMsg('')
    const k = rol + '|' + item.to
    const guardado = k in perms ? perms[k] : item.roles.includes(rol)
    setBorrador((b) => {
      const n = { ...b }
      if (valor === guardado) delete n[k]; else n[k] = { rol, item, valor }
      return n
    })
  }

  async function guardar() {
    setBusy(true); setMsg('')
    const cambios = Object.values(borrador)
    const subir = cambios.filter((c) => c.valor !== c.item.roles.includes(c.rol)).map((c) => ({ role: c.rol, ruta: c.item.to, permitido: c.valor }))
    const borrar = cambios.filter((c) => c.valor === c.item.roles.includes(c.rol)) // vuelven al valor por defecto: se borra la excepción
    let error = null
    if (subir.length) ({ error } = await supabase.from('role_permissions').upsert(subir, { onConflict: 'role,ruta' }))
    for (const c of borrar) {
      if (error) break
      ;({ error } = await supabase.from('role_permissions').delete().eq('role', c.rol).eq('ruta', c.item.to))
    }
    setBusy(false)
    if (error) { setMsg('No se pudieron guardar los cambios. ¿Has ejecutado la migración 38?'); return }
    await refreshPermissions()
    setBorrador({})
    setMsg(`✓ ${cambios.length} ${cambios.length === 1 ? 'cambio guardado' : 'cambios guardados'}.`)
  }

  async function restablecer() {
    if (!confirm('¿Volver a los permisos por defecto de todos los roles? Se borran todos tus cambios.')) return
    setBorrador({})
    setBusy(true)
    const { error } = await supabase.from('role_permissions').delete().neq('ruta', '')
    setBusy(false)
    if (error) { setMsg('No se pudo restablecer.'); return }
    await refreshPermissions()
    setMsg('Permisos restablecidos.')
  }

  const hayCambios = Object.keys(perms).length > 0
  const nBorrador = Object.keys(borrador).length

  return (
    <div>
      <Panel className="p-4 mb-4">
        <p className="text-sm mb-1"><strong>Qué apartados ve cada rol.</strong> Marca o desmarca y pulsa «Guardar cambios» para aplicarlo. El admin siempre lo ve todo.</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Esto decide qué aparece en el menú y a qué apartados se puede entrar. Los datos de cada apartado siguen protegidos por la base de datos: si das acceso a un apartado cuyos datos ese rol no puede leer, lo verá vacío.
        </p>
      </Panel>

      <Panel className="p-4 mb-4">
        <p className="text-sm"><strong>Permisos adicionales</strong> (al final de la tabla): <em>Ver contraseñas en Cuentas de Instagram</em>. Quien no lo tenga verá un candado 🔒 con «No tienes permiso» en lugar de las contraseñas. Solo afecta a quien pueda entrar a esas pestañas (admin y Manager de Instagram); el admin siempre las ve.</p>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Apartado</th>
                {ROLES_EDITABLES.map((r) => (
                  <th key={r.id} className="px-3 py-3 font-medium text-center" style={{ color: 'var(--text-muted)', minWidth: 90 }}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...SECTIONS, ...PERMISOS_EXTRA].map((sec) => (
                <SeccionFilas key={sec.id} sec={sec} efectivo={efectivo} personalizado={personalizado} cambiar={cambiar} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {nBorrador > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-3 flex-wrap rounded-lg px-4 py-3" data-barra-guardar style={{ background: 'var(--panel)', border: '1px solid var(--accent)', boxShadow: '0 4px 16px rgba(0,0,0,.35)' }}>
          <span className="text-sm">Tienes <strong>{nBorrador}</strong> {nBorrador === 1 ? 'cambio' : 'cambios'} sin guardar.</span>
          <Button onClick={guardar} disabled={busy} data-guardar-permisos>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
          <Button variant="ghost" onClick={() => { setBorrador({}); setMsg('') }} disabled={busy} data-descartar-permisos>Descartar</Button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        {hayCambios && <Button variant="ghost" onClick={restablecer} disabled={busy}>Restablecer valores por defecto</Button>}
        {msg && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{msg}</span>}
      </div>
    </div>
  )
}

function SeccionFilas({ sec, efectivo, personalizado, cambiar }) {
  return (
    <>
      <tr style={{ background: 'var(--panel-alt)' }}>
        <td colSpan={ROLES_EDITABLES.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {sec.label || 'General'}
        </td>
      </tr>
      {sec.items.map((item) => {
        const fijo = item.to === '/'
        return (
          <tr key={item.to} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="px-4 py-2">{item.label}</td>
            {ROLES_EDITABLES.map((r) => {
              const on = fijo ? true : efectivo(r.id, item)
              return (
                <td key={r.id} className="px-3 py-2 text-center">
                  <label className="inline-flex items-center gap-1 cursor-pointer" title={fijo ? 'El panel general lo ven todos' : ''}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={fijo}
                      onChange={(e) => cambiar(r.id, item, e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                      aria-label={`${item.label} para ${r.label}`}
                    />
                  </label>
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}
