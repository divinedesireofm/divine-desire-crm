import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from './ui'

// Pantalla que sustituye al resto del CRM mientras el reporte del turno está pendiente
export function BloqueoReporte({ marcarEnviado }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function ya() {
    if (!window.confirm('¿Seguro que ya enviaste el reporte de este turno?\n\nQuedará marcado como enviado.')) return
    setBusy(true); setErr('')
    const e = await marcarEnviado(); if (e) setErr(e)
    setBusy(false)
  }
  return (
    <Panel className="p-8 max-w-xl mx-auto text-center">
      <p className="text-4xl mb-3">📝</p>
      <p className="font-display text-xl font-semibold mb-2">Falta tu reporte de turno</p>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Has finalizado tu turno. Hasta que no envíes el reporte no puedes usar ni cerrar el CRM.</p>
      <Link to="/reportes-turno" className="inline-block px-5 py-2.5 rounded-md font-medium text-sm" style={{ background: 'var(--accent)', color: '#000' }}>Hacer el reporte ahora</Link>
      <div className="mt-5">
        <button onClick={ya} disabled={busy} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{busy ? 'Guardando…' : 'Ya lo envié (marcar como enviado)'}</button>
      </div>
      {err && <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>{err}</p>}
    </Panel>
  )
}

// Aviso fijo encima de la página de reportes mientras esté pendiente
export function BannerReporte({ marcarEnviado }) {
  const [busy, setBusy] = useState(false)
  async function ya() {
    if (!window.confirm('¿Seguro que ya enviaste el reporte de este turno?\n\nQuedará marcado como enviado.')) return
    setBusy(true); await marcarEnviado(); setBusy(false)
  }
  return (
    <div className="rounded-md px-4 py-3 mb-4 flex items-center gap-3 flex-wrap text-sm" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
      <span className="flex-1">📝 Envía el reporte de tu turno para poder cerrar el CRM.</span>
      <button onClick={ya} disabled={busy} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>Ya lo envié (marcar como enviado)</button>
    </div>
  )
}
