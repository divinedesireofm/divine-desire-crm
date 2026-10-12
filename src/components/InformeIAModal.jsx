import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { iaCall, getVoiceGuide, withVoiceGuide } from '../lib/ai'
import { Button } from './ui'
import InformeView from './InformeView'

const BASE = `Eres el analista de rendimiento del equipo de chat de la agencia Divine Desire (agencia de OnlyFans). Trabajas para Kevin, el CEO, y redactas INFORMES INTERNOS en español.
Reglas de análisis:
1. Compara tendencias (sube / baja / se mantiene), no solo el número de la última semana.
2. Ventas altas con muy pocos mensajes u horas pueden ser suerte puntual, no técnica repetible.
3. Una caída de más del 25% frente a la media de semanas anteriores merece atención.
4. Lee las métricas en cadena: ventas ← PPV desbloqueados ← Unlock Ratio (calidad de la oferta, precio, momento) y PPV enviados ← Golden Ratio (ganas de vender) ← fans chateados (tráfico).
5. Tiempo de respuesta: menos de 5 minutos es óptimo; más es inaceptable. Si sube, es malo.
6. Si bajan ventas y también fans chateados, la causa suele ser el tráfico de la cuenta, no la persona.
7. Se valora a personas: antes de culpar, considera otras explicaciones (tráfico, turno, horas, luz/internet) y plantea las dudas como cosas a revisar con la persona.
8. Los valores null son datos no registrados, no ceros. Golden y Unlock Ratio vienen como fracción (0.05 = 5%). Los importes están en dólares.
9. Usa SOLO los datos aportados; no inventes cifras. Si algo no se puede concluir con los datos, dilo.
10. Si Kevin escribe un contexto o unas instrucciones, tenlos en cuenta como prioridad: responde a lo que pide y con el enfoque que pide.
Formato de salida: SOLO Markdown, sin introducciones del tipo "Aquí tienes". Empieza con un título con # (por ejemplo "# Informe de rendimiento — Nombre"), y usa secciones con ## (Resumen ejecutivo, Lo que dicen los números —con tabla Markdown de las cifras clave—, Puntos fuertes, Puntos de atención, Plan de acción numerado, Conclusión), negritas para lo importante y listas. Sé directo, concreto y accionable, sin relleno.`

// ambito: 'chatter' | 'equipo'
export default function InformeIAModal({ ambito, chatterId, chatterNombre, periodo, datos, onClose }) {
  const { profile } = useAuth()
  const [contexto, setContexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [informe, setInforme] = useState(null) // { titulo, contenido }
  const esEquipo = ambito === 'equipo'

  async function generar() {
    setBusy(true); setErr(''); setAviso('')
    try {
      const guia = await getVoiceGuide().catch(() => '')
      const system = withVoiceGuide(BASE, guia)
      const cabecera = esEquipo
        ? `ANÁLISIS DE TODO EL EQUIPO DE CHATTERS.\nPeriodo cubierto: ${periodo}\n\nDatos semanales por chatter (JSON):\n${datos}`
        : `ANÁLISIS DEL CHATTER: ${chatterNombre}\nPeriodo cubierto: ${periodo}\n\nHistórico semanal (JSON):\n${datos}`
      const texto = `${cabecera}\n\n${contexto.trim() ? `CONTEXTO E INSTRUCCIONES DE KEVIN (prioridad):\n${contexto.trim()}` : 'Kevin no ha añadido contexto: haz un análisis general completo.'}`
      const res = await iaCall(system, [{ role: 'user', content: texto }], 4000)
      const md = typeof res === 'string' ? res.trim() : ''
      if (!md) throw new Error('La IA no devolvió ningún texto. Inténtalo de nuevo.')
      const titulo = esEquipo ? `Análisis del equipo — ${periodo}` : `Análisis de ${chatterNombre} — ${periodo}`
      setInforme({ titulo, contenido: md })
      const { error } = await supabase.from('metric_reports').insert({
        tipo: ambito, chatter_id: esEquipo ? null : chatterId, chatter_nombre: esEquipo ? null : chatterNombre,
        titulo, contexto: contexto.trim(), contenido: md, periodo, created_by: profile?.id || null,
      })
      if (error) setAviso(error.message.includes('metric_reports') ? 'El informe se ha generado pero no se pudo guardar: falta ejecutar la migración 59 en Supabase.' : `El informe se ha generado pero no se pudo guardar: ${error.message}`)
      else setAviso('ok')
    } catch (e) { setErr(e?.message || 'No se pudo generar el análisis.') }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl p-6" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-display text-lg font-semibold">{esEquipo ? '✨ Análisis de todo el equipo' : `✨ Análisis de ${chatterNombre}`}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{periodo}</p>
          </div>
          <button aria-label="Cerrar" className="text-xl leading-none px-2" onClick={onClose} disabled={busy}>×</button>
        </div>

        {!informe && (
          <>
            <label className="text-sm font-medium block mb-1">Contexto e instrucciones (opcional)</label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Cuéntale a la IA lo que quieras que tenga en cuenta o cómo quieres el análisis: qué ha pasado esa semana, qué te preocupa, si quieres un tono más duro o más motivador, si es para hablar con la persona, etc. Concluirá en base a lo que escribas y a las estadísticas.
            </p>
            <textarea
              value={contexto} onChange={(e) => setContexto(e.target.value)} rows={7} disabled={busy}
              placeholder={esEquipo ? 'Ej: Esta semana cambiamos los horarios y bajó el tráfico en la cuenta de Alicia. Quiero saber quién rinde por encima y por debajo de la media y qué acciones tomar con cada uno.' : 'Ej: Es nueva y lleva 3 semanas. Quiero saber si va bien para su experiencia y qué le diría en la reunión del viernes.'}
              className="w-full rounded-md p-3 text-sm mb-3"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
            />
            {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
              <Button onClick={generar} disabled={busy}>{busy ? 'Redactando el informe…' : '✨ Generar informe'}</Button>
            </div>
          </>
        )}

        {informe && (
          <>
            {aviso === 'ok'
              ? <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>✓ Informe guardado. Lo encontrarás siempre en <Link to="/informes-metricas" className="underline" onClick={onClose}>Informes de métricas</Link>.</p>
              : aviso && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{aviso}</p>}
            <InformeView
              titulo={informe.titulo} subtitulo={`Generado el ${new Date().toLocaleDateString('es-ES')} · ${periodo}`} markdown={informe.contenido}
              acciones={<Button variant="ghost" onClick={() => { setInforme(null); setAviso('') }}>Generar otro</Button>}
            />
          </>
        )}
      </div>
    </div>
  )
}
