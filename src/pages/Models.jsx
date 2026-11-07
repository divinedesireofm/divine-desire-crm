import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Td, StatusBadge, PageHeader } from '../components/ui'
import Desplegable from '../components/Desplegable'
import FichaModelo from '../components/FichaModelo'
import { progresoFicha } from '../lib/fichaModelo'
import { ModelAvatar } from '../components/ModelAvatar'
import { reducirImagen, refrescarFotosModelos } from '../lib/modelPhotos'
import { readFunctionError } from '../lib/functions'

const STATUS_OPTIONS = ['en_preparacion', 'activa', 'pausada', 'baja']
const STATUS_LABELS = { en_preparacion: 'En preparación', activa: 'Activa', pausada: 'Pausada', en_negociacion: 'En negociación', baja: 'Baja' }
const EMPTY_FORM = { stage_name: '', status: 'en_preparacion', commission_percent: '', email: '', phone: '', notes: '', notas_privadas: '' }

export default function Models() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [subiendo, setSubiendo] = useState(null)
  const [privados, setPrivados] = useState({}) // { model_id: { email, phone, notas } } — solo lo ve el admin
  const [fichas, setFichas] = useState({})     // { model_id: datos } — ficha general, la ve todo el equipo
  const [fichaAbierta, setFichaAbierta] = useState(null)
  const [fichaCerrando, setFichaCerrando] = useState(false)
  const [accesoDe, setAccesoDe] = useState(null)   // modelo a la que se le está dando acceso
  const [accEmail, setAccEmail] = useState('')
  const [accPass, setAccPass] = useState('')
  const [accBusy, setAccBusy] = useState(false)
  const [accErr, setAccErr] = useState('')
  const [accRes, setAccRes] = useState(null)
  const [activos, setActivos] = useState({})      // { user_id: active } para saber si el acceso está suspendido
  const [editAcc, setEditAcc] = useState(null)    // modelo cuyo acceso se está editando
  const [eaEmail, setEaEmail] = useState('')
  const [eaEmailOrig, setEaEmailOrig] = useState('')
  const [eaPass, setEaPass] = useState('')
  const [eaBusy, setEaBusy] = useState(false)
  const [eaMsg, setEaMsg] = useState(null)        // { ok: bool, text }

  async function invocar(body) {
    const { data, error: er } = await supabase.functions.invoke('team-admin', { body })
    if (er) return { error: await readFunctionError(er) }
    if (data?.error) return { error: data.error }
    return { data }
  }
  async function abrirEditarAcceso(m) {
    setAccesoDe(null); setEditAcc(m); setEaPass(''); setEaMsg(null); setEaEmail(''); setEaEmailOrig('')
    const { data } = await invocar({ action: 'get_email', user_id: m.user_id })
    setEaEmail(data?.email || ''); setEaEmailOrig(data?.email || '')
  }
  async function accionAcceso(tipo) {
    const m = editAcc
    setEaBusy(true); setEaMsg(null)
    let res
    if (tipo === 'email') {
      const nuevo = eaEmail.trim()
      if (!/^\S+@\S+\.\S+$/.test(nuevo)) { setEaBusy(false); setEaMsg({ ok: false, text: 'Escribe un email válido.' }); return }
      // Se mantiene el rol Modelo y su enlace a la ficha; solo cambia el email de acceso
      res = await invocar({ action: 'update_roles', user_id: m.user_id, full_name: m.stage_name, roles: ['modelo'], email: nuevo })
      if (!res.error) { setEaEmailOrig(nuevo); setEaMsg({ ok: true, text: 'Email de acceso actualizado ✓' }) }
    } else if (tipo === 'password') {
      if (eaPass.length < 8) { setEaBusy(false); setEaMsg({ ok: false, text: 'La contraseña debe tener al menos 8 caracteres.' }); return }
      res = await invocar({ action: 'reset', user_id: m.user_id, password: eaPass })
      if (!res.error) { setEaMsg({ ok: true, text: `Contraseña cambiada ✓ Comunícale la nueva: ${eaPass}` }); setEaPass('') }
    } else if (tipo === 'correo') {
      res = await invocar({ action: 'send_reset_email', user_id: m.user_id, redirect_to: `${window.location.origin}/restablecer-contrasena` })
      if (!res.error) setEaMsg({ ok: true, text: `Email para crear nueva contraseña enviado a ${res.data.email || eaEmailOrig} ✓` })
    } else if (tipo === 'suspender') {
      if (!confirm(`¿Suspender el acceso de ${m.stage_name}? No podrá entrar, pero conserva todo (cuentas, ficha, planificaciones) y podrás reactivarla cuando quieras.`)) { setEaBusy(false); return }
      res = await invocar({ action: 'delete', user_id: m.user_id })
      if (!res.error) { setEaMsg({ ok: true, text: 'Acceso suspendido ✓' }); setActivos((a) => ({ ...a, [m.user_id]: false })) }
    } else if (tipo === 'reactivar') {
      res = await invocar({ action: 'reactivate', user_id: m.user_id })
      if (!res.error) { setEaMsg({ ok: true, text: 'Acceso reactivado ✓' }); setActivos((a) => ({ ...a, [m.user_id]: true })) }
    }
    setEaBusy(false)
    if (res?.error) setEaMsg({ ok: false, text: res.error })
  }

  function abrirAcceso(m) {
    setAccesoDe(m); setAccEmail(privados[m.id]?.email || ''); setAccPass(''); setAccErr(''); setAccRes(null)
  }
  // Crea el login y lo enlaza a ESTA modelo (no toca nada más de ella: cuentas, ficha, planificaciones…)
  async function darAcceso(e) {
    e.preventDefault()
    const email = accEmail.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) { setAccErr('Escribe un email válido.'); return }
    if (accPass && accPass.length < 8) { setAccErr('La contraseña debe tener al menos 8 caracteres (o déjala vacía para enviar invitación por email).'); return }
    setAccBusy(true); setAccErr('')
    const { data, error: er } = await supabase.functions.invoke('team-admin', {
      body: { action: 'create', email, full_name: accesoDe.stage_name, roles: ['modelo'], model_id: accesoDe.id, password: accPass || undefined, redirect_to: `${window.location.origin}/restablecer-contrasena` },
    })
    setAccBusy(false)
    if (er) { setAccErr(await readFunctionError(er)); return }
    if (data?.error) { setAccErr(data.error); return }
    setAccRes({ modo: data.modo, tempPassword: data.tempPassword, email })
    load()
  }

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('models').select('*').order('created_at', { ascending: false })
    if (!error) setModels(data)
    if (canEdit) {
      const { data: pv } = await supabase.from('model_private').select('*')
      setPrivados(Object.fromEntries((pv || []).map((r) => [r.model_id, r])))
    }
    if (canEdit) {
      const { data: pf } = await supabase.from('profiles').select('id, active')
      setActivos(Object.fromEntries((pf || []).map((x) => [x.id, x.active !== false])))
    }
    const { data: fg } = await supabase.from('model_general').select('model_id, datos')
    setFichas(Object.fromEntries((fg || []).map((r) => [r.model_id, r.datos || {}])))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function guardarFicha(modeloId, datos) {
    const { error: e } = await supabase.from('model_general').upsert({ model_id: modeloId, datos, updated_at: new Date().toISOString() }, { onConflict: 'model_id' })
    if (e) return { error: /model_general|relation/.test(e.message) ? 'Falta ejecutar la migración 95 en Supabase (ficha general de modelos).' : 'No se pudo guardar: ' + e.message }
    setFichas((f) => ({ ...f, [modeloId]: datos }))
    return {}
  }
  const alternarFicha = (id) => { if (fichaAbierta === id && !fichaCerrando) { setFichaCerrando(true) } else { setFichaCerrando(false); setFichaAbierta(id) } }

  async function subirFoto(m, file) {
    if (!file) return
    setError(null); setSubiendo(m.id)
    try {
      const blob = await reducirImagen(file)
      const ruta = `${m.id}-${Date.now()}.jpg`
      const { error: e1 } = await supabase.storage.from('model-photos').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true })
      if (e1) throw e1
      const { data } = supabase.storage.from('model-photos').getPublicUrl(ruta)
      const { error: e2 } = await supabase.from('models').update({ photo_url: data.publicUrl }).eq('id', m.id)
      if (e2) throw e2
      if (m.photo_url) { const vieja = m.photo_url.split('/model-photos/')[1]; if (vieja) supabase.storage.from('model-photos').remove([vieja]) }
      await load(); refrescarFotosModelos()
    } catch (err) {
      setError('No se pudo subir la foto: ' + (err.message || 'inténtalo de nuevo'))
    }
    setSubiendo(null)
  }

  async function quitarFoto(m) {
    if (!confirm(`¿Quitar la foto de ${m.stage_name}?`)) return
    await supabase.from('models').update({ photo_url: null }).eq('id', m.id)
    const vieja = (m.photo_url || '').split('/model-photos/')[1]
    if (vieja) supabase.storage.from('model-photos').remove([vieja])
    await load(); refrescarFotosModelos()
  }

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(m) {
    setEditingId(m.id)
    setForm({
      stage_name: m.stage_name || '',
      status: !m.status || m.status === 'en_negociacion' ? 'en_preparacion' : m.status,
      commission_percent: m.commission_percent ?? '',
      email: privados[m.id]?.email || '',
      phone: privados[m.id]?.phone || '',
      notes: m.notes || '',
      notas_privadas: privados[m.id]?.notas || '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = {
      stage_name: form.stage_name,
      status: form.status,
      commission_percent: form.commission_percent || null,
      notes: form.notes || null,
    }
    const res = editingId
      ? await supabase.from('models').update(payload).eq('id', editingId).select().single()
      : await supabase.from('models').insert([payload]).select().single()

    if (res.error) {
      setError('No se pudo guardar. Revisa los datos e inténtalo de nuevo.')
      return
    }
    // email, teléfono y notas privadas van aparte: solo el admin puede leerlos
    const { error: ePriv } = await supabase.from('model_private').upsert({
      model_id: editingId || res.data.id, email: form.email.trim() || null, phone: form.phone.trim() || null, notas: form.notas_privadas.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'model_id' })
    if (ePriv) {
      setError('La modelo se guardó, pero no se pudieron guardar sus datos privados. ¿Has ejecutado la migración 63? ' + ePriv.message)
      load()
      return
    }
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    load()
    refrescarFotosModelos()
  }

  return (
    <div>
      <PageHeader
        title="Modelos"
        subtitle="Ficha de creadoras activas, en negociación o de baja."
        action={canEdit && !editingId && (
          <Button onClick={showForm ? () => setShowForm(false) : startCreate}>
            {showForm ? 'Cancelar' : 'Añadir modelo'}
          </Button>
        )}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4 font-medium">{editingId ? 'Editar modelo' : 'Nuevo modelo'}</p>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Nombre artístico"
              value={form.stage_name}
              onChange={(e) => setForm({ ...form, stage_name: e.target.value })}
              required
            />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
            <Input
              type="number"
              step="0.01"
              placeholder="% comisión agencia"
              value={form.commission_percent}
              onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
            />
            <Input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Teléfono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              placeholder="Notas"
              className="sm:col-span-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="sm:col-span-2">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>🔒 Información de la modelo (solo la ves tú: email, teléfono y estas notas no los ve nadie más del equipo)</label>
              <textarea
                rows={5}
                placeholder="Datos personales, acuerdos, preferencias, límites, horarios, cualquier cosa que quieras tener a mano de ella…"
                value={form.notas_privadas}
                onChange={(e) => setForm({ ...form, notas_privadas: e.target.value })}
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y"
                style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar modelo'}</Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Panel>
      )}

      {editAcc && (
        <Panel className="p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">⚙️ Acceso de {editAcc.stage_name}</p>
            <button onClick={() => setEditAcc(null)} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>Cerrar</button>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Aquí cambias cómo entra ella al CRM. Nada de lo suyo (cuentas, ficha, planificaciones) se toca.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Email de acceso</label>
              <div className="flex gap-2">
                <Input type="email" value={eaEmail} onChange={(e) => setEaEmail(e.target.value)} />
                <Button type="button" disabled={eaBusy || !eaEmail.trim() || eaEmail.trim() === eaEmailOrig} onClick={() => accionAcceso('email')}>Guardar</Button>
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Nueva contraseña (mín. 8)</label>
              <div className="flex gap-2">
                <Input type="text" value={eaPass} onChange={(e) => setEaPass(e.target.value)} />
                <Button type="button" disabled={eaBusy || !eaPass} onClick={() => accionAcceso('password')}>Cambiar</Button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="ghost" disabled={eaBusy} onClick={() => accionAcceso('correo')}>✉️ Enviarle email para crear contraseña</Button>
            {activos[editAcc.user_id] === false
              ? <Button type="button" disabled={eaBusy} onClick={() => accionAcceso('reactivar')}>✅ Reactivar acceso</Button>
              : <Button type="button" variant="ghost" disabled={eaBusy} onClick={() => accionAcceso('suspender')}>⛔ Suspender acceso</Button>}
          </div>
          {eaMsg && <p className="text-sm mt-3" style={{ color: eaMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{eaMsg.text}</p>}
        </Panel>
      )}

      {accesoDe && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-1">🔑 Dar acceso a {accesoDe.stage_name}</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Se crea su usuario con el rol Modelo y se enlaza a esta ficha. Conserva todo lo que ya tiene (cuentas, ficha, planificaciones). Ella solo verá sus planificaciones y su perfil.</p>
          {accRes ? (
            <div>
              <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>
                {accRes.modo === 'invitacion'
                  ? <>Acceso creado ✓. Le hemos enviado un email a <strong>{accRes.email}</strong> para que cree su contraseña y entre.</>
                  : <>Acceso creado ✓. Comunícale a {accesoDe.stage_name} su email <strong>{accRes.email}</strong> y esta contraseña: <strong>{accRes.tempPassword || accPass}</strong></>}
              </p>
              <Button onClick={() => setAccesoDe(null)}>Listo</Button>
            </div>
          ) : (
            <form onSubmit={darAcceso}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input type="email" placeholder="Email con el que entrará" value={accEmail} onChange={(e) => setAccEmail(e.target.value)} />
                <Input type="text" placeholder="Contraseña (opcional: vacío = invitación por email)" value={accPass} onChange={(e) => setAccPass(e.target.value)} />
              </div>
              {accErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{accErr}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={accBusy}>{accBusy ? 'Creando…' : 'Dar acceso'}</Button>
                <Button type="button" variant="ghost" onClick={() => setAccesoDe(null)}>Cancelar</Button>
              </div>
            </form>
          )}
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {(canEdit ? ['Nombre', 'Estado', 'Comisión', 'Email', 'Teléfono', 'Notas', 'Información privada', 'Ficha general', 'Acceso', ''] : ['Nombre', 'Estado', 'Comisión', 'Notas', 'Ficha general', '']).map((col, i) => (
                    <th key={col + i} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.length === 0 ? (
                  <tr><td colSpan={canEdit ? 10 : 6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay datos aquí.</td></tr>
                ) : models.map((m) => {
                  const pr = progresoFicha(fichas[m.id])
                  const abierta = fichaAbierta === m.id
                  return (
                    <Fragment key={m.id}>
                      <tr style={{ borderBottom: abierta ? 'none' : '1px solid var(--border)' }}>

                <Td>
                  <div className="flex items-center gap-3">
                    {canEdit ? (
                      <label className="cursor-pointer relative group" title={m.photo_url ? 'Cambiar foto' : 'Subir foto'} style={{ opacity: subiendo === m.id ? 0.5 : 1 }}>
                        <ModelAvatar name={m.stage_name} url={m.photo_url || null} size={56} />
                        <input type="file" accept="image/*" className="hidden" disabled={subiendo === m.id} onChange={(e) => { subirFoto(m, e.target.files[0]); e.target.value = '' }} />
                        <span className="absolute -bottom-1 -right-1 text-[10px] leading-none rounded-full px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--accent)', color: '#000' }}>✎</span>
                      </label>
                    ) : <ModelAvatar name={m.stage_name} url={m.photo_url || null} size={56} />}
                    <div>
                      <p>{m.stage_name}</p>
                      {canEdit && (m.photo_url
                        ? <button onClick={() => quitarFoto(m)} className="text-[11px] hover:underline" style={{ color: 'var(--text-muted)' }}>Quitar foto</button>
                        : <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{subiendo === m.id ? 'Subiendo…' : 'Clic en el círculo para añadir foto'}</span>)}
                    </div>
                  </div>
                </Td>
                <Td><StatusBadge status={m.status} /></Td>
                <Td>{m.commission_percent ? `${m.commission_percent}%` : '—'}</Td>
                {canEdit && <Td style={{ color: 'var(--text-muted)' }}>{privados[m.id]?.email || '—'}</Td>}
                {canEdit && <Td style={{ color: 'var(--text-muted)' }}>{privados[m.id]?.phone || '—'}</Td>}
                <Td style={{ color: 'var(--text-muted)' }}>{m.notes || '—'}</Td>
                {canEdit && <Td style={{ color: 'var(--text-muted)', maxWidth: 280 }}><span className="block whitespace-pre-wrap text-xs" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{privados[m.id]?.notas || '—'}</span></Td>}
                <Td>
                  <button onClick={() => alternarFicha(m.id)} className="text-xs px-3 py-1.5 rounded-md whitespace-nowrap" style={{ background: abierta && !fichaCerrando ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${abierta && !fichaCerrando ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--accent)' }}>
                    {abierta && !fichaCerrando ? '▲ Ocultar ficha' : '▼ Ver ficha'}{pr.hechos ? ` · ${pr.hechos}/${pr.total}` : ' · vacía'}
                  </button>
                </Td>
                {canEdit && (
                  <Td>
                    {m.user_id
                      ? <div className="flex items-center gap-2 whitespace-nowrap">
                          {activos[m.user_id] === false
                            ? <span className="text-xs" style={{ color: 'var(--danger)' }}>⛔ Suspendido</span>
                            : <span className="text-xs" style={{ color: 'var(--success)' }}>✅ Con acceso</span>}
                          <button onClick={() => abrirEditarAcceso(m)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar acceso</button>
                        </div>
                      : <button onClick={() => abrirAcceso(m)} className="text-xs px-3 py-1.5 rounded-md whitespace-nowrap" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--accent)' }}>🔑 Dar acceso</button>}
                  </Td>
                )}
                <Td>
                  {canEdit && (
                    <button onClick={() => startEdit(m)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                      Editar
                    </button>
                  )}
                </Td>
                      </tr>
                      {abierta && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={canEdit ? 10 : 6} style={{ padding: 0 }}>
                            <Desplegable abierto={!fichaCerrando} onCerrado={() => { setFichaAbierta(null); setFichaCerrando(false) }}>
                              <FichaModelo modelo={m} datos={fichas[m.id]} canEdit={canEdit} onGuardar={(d) => guardarFicha(m.id, d)} onCerrar={() => setFichaCerrando(true)} />
                            </Desplegable>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
