import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useQr, claveQr, urlQr, guardarQr, quitarQr } from '../lib/qr2fa'

function Img({ path, style }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let vivo = true; urlQr(path).then((u) => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [path])
  if (!url) return <span style={{ ...style, background: 'var(--panel-alt)', display: 'inline-block' }} />
  return <img src={url} alt="QR del 2FA" style={style} />
}

// Foto del QR del 2FA de una cuenta (compartida por usuario entre General, Cuentas propias y Eliminadas).
// Con foto: miniatura que se amplía. Sin foto: botón «＋ QR» para subirla (solo quien puede editar).
export default function QrCelda({ usuario, canEdit = false }) {
  const { profile } = useAuth()
  const { path } = useQr()
  const clave = claveQr(usuario)
  const p = path(usuario)
  const ref = useRef(null)
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [err, setErr] = useState('')

  async function elegir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setErr(''); setSubiendo(true)
    try { await guardarQr(usuario, f, profile?.id) } catch (ex) { setErr(ex.message); setAbierto(true) }
    setSubiendo(false)
  }
  async function quitar() {
    if (!confirm('¿Quitar la foto del QR? Se quitará también en las demás pestañas donde aparece esta cuenta.')) return
    setErr('')
    try { await quitarQr(usuario); setAbierto(false) } catch (ex) { setErr(ex.message) }
  }
  if (!clave) return null
  if (!p && !canEdit) return null
  const input = <input ref={ref} type="file" accept="image/*" className="hidden" onChange={elegir} />
  return (
    <>
      {input}
      {p ? (
        <button type="button" onClick={() => setAbierto(true)} title="Ver el QR del 2FA" data-qr-ver style={{ lineHeight: 0, flexShrink: 0 }}>
          <Img path={p} style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
        </button>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} title="Añadir la foto del QR del 2FA" data-qr-add className="text-xs underline whitespace-nowrap" style={{ color: 'var(--accent)', flexShrink: 0 }}>
          {subiendo ? 'Subiendo…' : '＋ QR'}
        </button>
      )}
      {abierto && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 950, background: 'rgba(0,0,0,0.7)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="rounded-xl p-4" style={{ background: 'var(--panel)', border: '1px solid var(--border)', maxWidth: 420, width: '100%' }}>
            <p className="text-sm font-medium mb-3">QR del 2FA · @{clave}</p>
            {p ? <div className="flex justify-center mb-3"><Img path={p} style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8, background: '#fff' }} /></div> : <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Sin foto.</p>}
            {err && <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>{err}</p>}
            <div className="flex flex-wrap gap-2">
              {canEdit && <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} className="text-sm px-3 py-1.5 rounded-md" style={{ border: '1px solid var(--border)' }}>{subiendo ? 'Subiendo…' : p ? 'Reemplazar' : 'Subir foto'}</button>}
              {canEdit && p && <button type="button" onClick={quitar} className="text-sm px-3 py-1.5 rounded-md" style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}>Quitar</button>}
              <button type="button" onClick={() => setAbierto(false)} className="text-sm px-3 py-1.5 rounded-md" style={{ border: '1px solid var(--border)' }}>Cerrar</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  )
}
