import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, PageHeader } from '../components/ui'

const SUGERENCIAS = [
  '¿Cuánto se facturó en los reportes de esta semana?',
  '¿Quién está en turno ahora mismo?',
  '¿Qué modelos están en preparación?',
  '¿Hay alguna sanción reciente?',
]

export default function Assistant() {
  const [mensajes, setMensajes] = useState([]) // [{rol:'user'|'asistente', texto}]
  const [historialAPI, setHistorialAPI] = useState([]) // formato Anthropic, se manda de vuelta cada turno
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])

  async function enviar(preguntaTxt) {
    const pregunta = (preguntaTxt ?? input).trim()
    if (!pregunta || busy) return
    setError('')
    setMensajes((m) => m.concat([{ rol: 'user', texto: pregunta }]))
    setInput('')
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('crm-assistant', {
      body: { pregunta, historial: historialAPI },
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    if (data?.error) { setError(data.error); return }
    setMensajes((m) => m.concat([{ rol: 'asistente', texto: data.respuesta }]))
    setHistorialAPI(data.historial || [])
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      <PageHeader title="Asistente del CRM" subtitle="Pregúntale por datos en vivo: reportes, modelos, sanciones, pagos, equipo..." />

      <Panel className="flex-1 p-5 mb-4 overflow-y-auto">
        {mensajes.length === 0 ? (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Prueba a preguntar algo como:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[75%] px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap"
                  style={{
                    background: m.rol === 'user' ? 'var(--accent-soft)' : 'var(--panel-alt)',
                    color: m.rol === 'user' ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {m.texto}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Consultando el CRM…</p>}
            <div ref={bottomRef} />
          </div>
        )}
      </Panel>

      {error && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Escribe tu pregunta..."
          className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <Button onClick={() => enviar()} disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</Button>
      </div>
    </div>
  )
}
