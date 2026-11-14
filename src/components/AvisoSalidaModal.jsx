import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Panel, Button } from './ui'

// Ventana emergente que sale justo al marcar la salida del turno: recuerda que hay que hacer el reporte y que no hacerlo se penaliza.
export default function AvisoSalidaModal() {
  const [abierto, setAbierto] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const alCambiar = (e) => { if (e.detail?.tipo === 'salida') setAbierto(true) }
    window.addEventListener('attendance-changed', alCambiar)
    return () => window.removeEventListener('attendance-changed', alCambiar)
  }, [])

  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} role="dialog" aria-modal="true" data-aviso-salida>
      <Panel className="p-7 max-w-md w-full text-center" style={{ border: '1px solid var(--danger)' }}>
        <p className="text-4xl mb-3">📝</p>
        <p className="font-display text-xl font-semibold mb-2">Has marcado tu salida</p>
        <p className="text-sm mb-3">Ahora tienes que <strong>hacer el reporte de tu turno</strong>. Hasta que lo envíes no podrás usar ni cerrar el CRM.</p>
        <p className="text-sm font-medium mb-5" style={{ color: 'var(--danger)' }}>⚠️ No hacer el reporte conllevará una penalización.</p>
        <Button onClick={() => { setAbierto(false); navigate('/reportes-turno') }}>Hacer el reporte ahora</Button>
      </Panel>
    </div>
  )
}
