import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, PageHeader } from '../components/ui'

export default function AiSettings() {
  const { profile, hasAnyRole } = useAuth()
  const puedeEditar = hasAnyRole(['admin', 'manager'])
  const [guia, setGuia] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  async function load() {
    const { data } = await supabase.from('ai_settings').select('*').eq('id', 1).single()
    setGuia(data?.guia || '')
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function guardar() {
    setBusy(true); setOk(false)
    await supabase.from('ai_settings').update({ guia, actualizado_por: profile.id, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  return (
    <div>
      <PageHeader
        title="Voz de marca (IA)"
        subtitle="Esto se añade automáticamente a los tres generadores de IA: Packs, Activación y Formación."
      />
      <Panel className="p-5">
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <>
            <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Escribe en tus propias palabras cómo quieres que suene siempre la IA: tono, muletillas que usar,
              cosas que evitar, nivel de picante/vulgaridad permitido, ejemplos de frases reales que os representen...
            </label>
            <textarea
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              disabled={!puedeEditar}
              rows={14}
              placeholder={`Ejemplo:\n- Nunca sonar como un anuncio, siempre como un mensaje de una persona real\n- Evita frases genéricas tipo "no te lo puedes perder" o "oferta especial"\n- Usa frases cortas, como si estuvieras escribiendo rápido desde el móvil\n- Algún error tipográfico natural está bien, no seas perfecto\n- Nivel de picante: insinuación, nunca explícito\n- Ejemplo real que nos gusta: "ay para q lo sepas hice algo hoy que no habia hecho nunca 👀"`}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-4 font-mono"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {puedeEditar ? (
              <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : (ok ? 'Guardado ✓' : 'Guardar')}</Button>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Solo los managers pueden editar esta guía.</p>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
