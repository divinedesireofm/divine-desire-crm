import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, PageHeader } from '../components/ui'
import { ModelAvatar } from '../components/ModelAvatar'
import FichaModelo from '../components/FichaModelo'
import { reducirImagen, refrescarFotosModelos } from '../lib/modelPhotos'

const lbl = { color: 'var(--text-muted)' }

// «Mi perfil» de la modelo: foto, datos de contacto y su ficha general. Solo ve y edita lo SUYO (lo garantiza la base de datos).
export default function MiPerfilModelo() {
  const [modelo, setModelo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [priv, setPriv] = useState({ email: '', phone: '', notas: '' })
  const [ficha, setFicha] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [errFoto, setErrFoto] = useState('')

  async function cargar() {
    const { data: m } = await supabase.from('models').select('id, stage_name, photo_url').limit(1).maybeSingle()
    setModelo(m || null)
    if (m) {
      const [{ data: p }, { data: g }] = await Promise.all([
        supabase.from('model_private').select('email, phone, notas').eq('model_id', m.id).maybeSingle(),
        supabase.from('model_general').select('datos').eq('model_id', m.id).maybeSingle(),
      ])
      setPriv({ email: p?.email || '', phone: p?.phone || '', notas: p?.notas || '' })
      setFicha(g?.datos || {})
    }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  async function guardarContacto(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setGuardando(true)
    const { error } = await supabase.from('model_private').upsert({
      model_id: modelo.id, email: priv.email.trim() || null, phone: priv.phone.trim() || null, notas: priv.notas.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'model_id' })
    setGuardando(false)
    if (error) { setErr('No se pudo guardar: ' + error.message); return }
    setMsg('Guardado ✓')
    setTimeout(() => setMsg(''), 2500)
  }

  async function guardarFicha(datos) {
    const { error } = await supabase.from('model_general').upsert({ model_id: modelo.id, datos, updated_at: new Date().toISOString() }, { onConflict: 'model_id' })
    if (error) return { error: 'No se pudo guardar: ' + error.message }
    setFicha(datos)
    return {}
  }

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
      setModelo((m) => ({ ...m, photo_url: data.publicUrl }))
      refrescarFotosModelos()
    } catch (ex) {
      setErrFoto('No se pudo cambiar la foto: ' + (ex.message || 'inténtalo de nuevo'))
    }
    setSubiendo(false)
  }

  if (cargando) return <p className="p-8 text-sm" style={lbl}>Cargando…</p>
  if (!modelo) {
    return <p className="p-8 text-sm text-center" style={lbl}>Tu cuenta todavía no está enlazada a ninguna ficha. Avisa al equipo para que lo revisen.</p>
  }

  return (
    <div>
      <PageHeader title="Mi perfil" subtitle="Tu foto, tus datos de contacto y tu ficha general. Puedes cambiarlos cuando quieras." />

      <Panel className="p-5 mb-5">
        <div className="flex items-center gap-5 flex-wrap">
          <label className="relative cursor-pointer shrink-0" title="Cambiar mi foto" style={{ opacity: subiendo ? 0.5 : 1 }}>
            <ModelAvatar name={modelo.stage_name} url={modelo.photo_url || null} size={96} />
            <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={(e) => { cambiarFoto(e.target.files[0]); e.target.value = '' }} />
            <span className="absolute -bottom-1 -right-1 text-xs leading-none rounded-full px-2 py-1.5" style={{ background: 'var(--accent)', color: '#000' }}>✎</span>
          </label>
          <div>
            <p className="font-display text-2xl font-semibold">{modelo.stage_name}</p>
            <p className="text-xs mt-1" style={lbl}>{subiendo ? 'Subiendo foto…' : 'Pulsa sobre tu foto para cambiarla.'}</p>
            {errFoto && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{errFoto}</p>}
          </div>
        </div>
      </Panel>

      <Panel className="p-5 mb-5">
        <p className="font-medium mb-1">Mis datos de contacto</p>
        <p className="text-xs mb-4" style={lbl}>Solo los ve el administrador; el resto del equipo no tiene acceso a esta información.</p>
        <form onSubmit={guardarContacto} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={lbl}>Email</label>
            <Input type="email" value={priv.email} onChange={(e) => setPriv({ ...priv, email: e.target.value })} placeholder="tu@email.com" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={lbl}>Teléfono</label>
            <Input value={priv.phone} onChange={(e) => setPriv({ ...priv, phone: e.target.value })} placeholder="+34 …" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={lbl}>Notas</label>
            <textarea rows={4} value={priv.notas} onChange={(e) => setPriv({ ...priv, notas: e.target.value })} placeholder="Cualquier cosa que quieras que sepamos…"
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          {err && <p className="md:col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="md:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar mis datos'}</Button>
            {msg && <span className="text-sm" style={{ color: 'var(--success)' }}>{msg}</span>}
          </div>
        </form>
      </Panel>

      <Panel className="overflow-hidden">
        <FichaModelo modelo={modelo} datos={ficha} canEdit onGuardar={guardarFicha} propia />
      </Panel>
    </div>
  )
}
