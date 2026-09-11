import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button } from './ui'

function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

const LETRAS = ['A', 'B', 'C', 'D']

export default function PildoraGate({ children }) {
  const { profile, role } = useAuth()
  const aplica = ['admin', 'manager', 'chatter'].includes(role)
  const [checking, setChecking] = useState(true)
  const [pil, setPil] = useState(null)
  const [sel, setSel] = useState('')
  const [fase, setFase] = useState('pregunta')
  const [busy, setBusy] = useState(false)

  async function check() {
    setChecking(true)
    const hoy = fechaHoyISO()
    const { data: activas } = await supabase.from('training_pills').select('*').eq('activa', true).eq('fecha_publicacion', hoy).limit(1)
    const activa = activas?.[0]
    if (!activa) { setPil(null); setChecking(false); return }
    const { data: yaResp } = await supabase.from('training_answers').select('id').eq('pildora_id', activa.id).eq('usuario_id', profile.id).limit(1)
    if (yaResp?.length) { setPil(null); setChecking(false); return }
    setPil(activa)
    setChecking(false)
  }

  useEffect(() => { if (profile && aplica) check(); else setChecking(false) }, [profile])

  async function responder() {
    if (!sel) return
    setBusy(true)
    const ok = sel === pil.respuesta_correcta
    await supabase.from('training_answers').insert([{ pildora_id: pil.id, usuario_id: profile.id, respuesta_dada: sel, es_correcta: ok }])
    setBusy(false)
    setFase('resultado')
  }

  if (!aplica || checking || !pil) return children

  const opts = [pil.opcion_a, pil.opcion_b, pil.opcion_c, pil.opcion_d]
  const esCorrecta = sel === pil.respuesta_correcta

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Panel className="w-full max-w-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <span>💊</span>
          <p className="font-medium">Píldora de valor del día {pil.numero ? `· #${pil.numero}` : ''}</p>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Obligatoria</span>
        </div>

        {fase === 'pregunta' ? (
          <>
            <p className="text-xs mb-1" style={{ color: 'var(--gold)' }}>{pil.concepto}</p>
            <h2 className="text-lg font-display font-semibold mb-2">{pil.titulo}</h2>
            <p className="text-sm whitespace-pre-wrap mb-4" style={{ color: 'var(--text-muted)' }}>{pil.contenido}</p>
            <p className="text-sm font-medium mb-3">{pil.pregunta}</p>
            <div className="space-y-2 mb-5">
              {opts.map((o, i) => (
                <button
                  key={i}
                  onClick={() => setSel(LETRAS[i])}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm"
                  style={{
                    background: sel === LETRAS[i] ? 'var(--accent-soft)' : 'var(--panel-alt)',
                    border: `1px solid ${sel === LETRAS[i] ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <strong>{LETRAS[i]}</strong> {o}
                </button>
              ))}
            </div>
            <Button onClick={responder} disabled={!sel || busy} className="w-full">
              {busy ? 'Enviando…' : 'Responder'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-lg font-display font-semibold mb-3" style={{ color: esCorrecta ? 'var(--success)' : 'var(--danger)' }}>
              {esCorrecta ? '✅ ¡Correcto!' : '❌ Respuesta incorrecta'}
            </p>
            <p className="text-sm mb-1"><strong>Respuesta correcta: {pil.respuesta_correcta}</strong></p>
            {pil.explicacion_correcta && <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{pil.explicacion_correcta}</p>}
            <Button onClick={check} className="w-full">He leído y entendido · Entrar al CRM</Button>
          </>
        )}
      </Panel>
    </div>
  )
}
