import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { SECTIONS, ROLES_EDITABLES } from '../lib/navigation'
import { Panel, Button } from './ui'

// Tabla de permisos: cada fila es un apartado del CRM y cada columna un rol.
// Solo la ve el admin. Cada casilla guarda el cambio al instante.
export default function PermissionsMatrix() {
  const { perms, refreshPermissions } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const efectivo = (rol, item) => {
    const k = rol + '|' + item.to
    return k in perms ? perms[k] : item.roles.includes(rol)
  }
  const personalizado = (rol, item) => {
    const k = rol + '|' + item.to
    return k in perms && perms[k] !== item.roles.includes(rol)
  }

  async function cambiar(rol, item, valor) {
    setMsg('')
    const porDefecto = item.roles.includes(rol)
    // Si vuelve a coincidir con el valor por defecto, borramos la fila para no acumular excepciones
    const { error } = valor === porDefecto
      ? await supabase.from('role_permissions').delete().eq('role', rol).eq('ruta', item.to)
      : await supabase.from('role_permissions').upsert({ role: rol, ruta: item.to, permitido: valor }, { onConflict: 'role,ruta' })
    if (error) { setMsg('No se pudo guardar el cambio. ¿Has ejecutado la migración 38?'); return }
    await refreshPermissions()
  }

  async function restablecer() {
    if (!confirm('¿Volver a los permisos por defecto de todos los roles? Se borran todos tus cambios.')) return
    setBusy(true)
    const { error } = await supabase.from('role_permissions').delete().neq('ruta', '')
    setBusy(false)
    if (error) { setMsg('No se pudo restablecer.'); return }
    await refreshPermissions()
    setMsg('Permisos restablecidos.')
  }

  const hayCambios = Object.keys(perms).length > 0

  return (
    <div>
      <Panel className="p-4 mb-4">
        <p className="text-sm mb-1"><strong>Qué apartados ve cada rol.</strong> Marca o desmarca y se guarda al momento. El admin siempre lo ve todo.</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Esto decide qué aparece en el menú y a qué apartados se puede entrar. Los datos de cada apartado siguen protegidos por la base de datos: si das acceso a un apartado cuyos datos ese rol no puede leer, lo verá vacío. Las casillas con punto dorado son cambios tuyos respecto al valor por defecto.
        </p>
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
              {SECTIONS.map((sec) => (
                <SeccionFilas key={sec.id} sec={sec} efectivo={efectivo} personalizado={personalizado} cambiar={cambiar} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

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
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: !fijo && personalizado(r.id, item) ? 'var(--gold)' : 'transparent' }} />
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
