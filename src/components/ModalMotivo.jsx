import { useState } from 'react'
import { Button, Input, Select } from './ui'

export const hoyLocal = () => new Date().toLocaleDateString('sv') // AAAA-MM-DD en la hora de quien lo usa

// Ventana para pedir «motivo + fecha» (y opcionalmente un tipo): dar de baja una cuenta o rehabilitarla.
export default function ModalMotivo({ titulo, descripcion, tipos, etiquetaTipo = 'Tipo', etiquetaFecha = 'Fecha', etiquetaMotivo = 'Motivo', textoBoton, error, trabajando, onConfirmar, onCancelar }) {
  const [tipo, setTipo] = useState(tipos?.[0]?.v || '')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [falta, setFalta] = useState(false)
  function enviar(e) {
    e.preventDefault()
    if (!motivo.trim()) { setFalta(true); return }
    onConfirmar({ tipo, motivo: motivo.trim(), fecha: fecha || hoyLocal() })
  }
  return (
    <div onClick={onCancelar} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }} role="dialog" aria-modal="true" aria-label={titulo}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={enviar} className="rounded-lg p-5 w-full space-y-3" style={{ maxWidth: 480, background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <p className="font-medium">{titulo}</p>
        {descripcion && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{descripcion}</p>}
        {tipos && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{etiquetaTipo}</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>{tipos.map((t) => <option key={t.v} value={t.v}>{t.n}</option>)}</Select>
          </div>
        )}
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{etiquetaMotivo} (obligatorio)</label>
          <textarea autoFocus rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); setFalta(false) }} placeholder="Escribe el motivo…" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: 'var(--panel-alt)', border: `1px solid ${falta ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--text)', resize: 'vertical' }} />
          {falta && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Tienes que escribir el motivo.</p>}
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{etiquetaFecha} (por defecto hoy, puedes cambiarla)</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button type="submit" disabled={trabajando}>{trabajando ? 'Guardando…' : textoBoton}</Button>
        </div>
      </form>
    </div>
  )
}
