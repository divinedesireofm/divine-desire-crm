import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button } from './ui'

export const IA_APARTADOS = {
  turno: { titulo: 'Lectura de capturas de los reportes de turno', ayuda: 'Cómo debe leer las capturas de ventas que suben los chatters al reportar su turno.', ejemplo: 'Ej.: Los importes de las capturas de OnlyFans están en dólares. Si un fan aparece con varios pagos seguidos, cuéntalos por separado. Ignora las suscripciones de 0 $. Si el usuario no se ve, déjalo vacío y márcalo como dudoso.' },
  metricas: { titulo: 'Lectura de las capturas de Infloww (métricas de chatters)', ayuda: 'Cómo debe leer las tablas de estadísticas de Infloww y qué columnas priorizar.', ejemplo: 'Ej.: Usa siempre la columna de ventas brutas. Si hay dos columnas de tiempo de respuesta, quédate con la de horas trabajadas. Los nombres de los chatters llevan el apodo entre paréntesis: ignóralo.' },
  informes: { titulo: 'Informes y análisis que escribe la IA', ayuda: 'Cómo debe comportarse y cómo debe redactar los informes y análisis (tono, estructura, qué destacar).', ejemplo: 'Ej.: Escribe en español cercano y directo. Empieza con un resumen de 3 líneas, después lo mejor y lo peor de la semana y termina con 3 acciones concretas. No uses tablas. Compara siempre con la semana anterior.' },
}

// Cuadro desplegable para que admin y managers escriban instrucciones para la IA de los reportes.
// claves: lista de apartados de IA_APARTADOS que se pueden editar desde esta pantalla.
export default function InstruccionesIA({ claves }) {
  const { profile, hasAnyRole } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(claves[0])
  const [textos, setTextos] = useState({})
  const [orig, setOrig] = useState({})
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)
  const puede = hasAnyRole(['admin', 'manager'])

  useEffect(() => {
    if (!abierto || !puede) return
    supabase.from('ai_report_instructions').select('clave, texto').then(({ data, error }) => {
      if (error) return setMsg(/ai_report_instructions/.test(error.message) ? 'Falta ejecutar la migración 83 en Supabase (instrucciones para la IA).' : error.message)
      const o = {}; (data || []).forEach((r) => { o[r.clave] = r.texto || '' })
      setTextos(o); setOrig(o)
    })
  }, [abierto, puede])

  if (!puede) return null
  const a = IA_APARTADOS[activa]
  const valor = textos[activa] ?? ''
  const cambiado = valor !== (orig[activa] ?? '')

  async function guardar() {
    setGuardando(true); setMsg('')
    const { error } = await supabase.from('ai_report_instructions').upsert({ clave: activa, texto: valor.trim(), updated_by: profile?.id || null, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
    setGuardando(false)
    if (error) return setMsg(/ai_report_instructions/.test(error.message) ? 'Falta ejecutar la migración 83 en Supabase (instrucciones para la IA).' : error.message)
    setOrig((o) => ({ ...o, [activa]: valor.trim() })); setTextos((t) => ({ ...t, [activa]: valor.trim() }))
    setMsg('✓ Guardado. La IA lo usará desde la próxima vez que lea una captura o escriba un informe.')
  }

  return (
    <Panel className="mb-5">
      <button type="button" className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="font-medium">🤖 Instrucciones para la IA</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{abierto ? 'Ocultar' : 'Dile cómo debe comportarse y cómo sacar los reportes'}</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
          {claves.length > 1 && (
            <div className="flex gap-2 flex-wrap mt-3">
              {claves.map((k) => (
                <button key={k} type="button" onClick={() => { setActiva(k); setMsg('') }} className="px-3 py-1 rounded-md text-xs"
                  style={{ background: activa === k ? 'var(--accent)' : 'var(--panel-alt)', color: activa === k ? '#000' : 'var(--text)', border: '1px solid ' + (activa === k ? 'var(--accent)' : 'var(--border)') }}>{IA_APARTADOS[k].titulo}</button>))}
            </div>
          )}
          <p className="text-sm mt-3 font-medium">{a.titulo}</p>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{a.ayuda} Se añade a las reglas internas de la IA y tiene prioridad sobre ellas (salvo inventar datos).</p>
          <textarea value={valor} onChange={(e) => setTextos((t) => ({ ...t, [activa]: e.target.value }))} rows={6} placeholder={a.ejemplo}
            className="w-full rounded-md px-3 py-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Button onClick={guardar} disabled={!cambiado || guardando}>{guardando ? 'Guardando…' : 'Guardar instrucciones'}</Button>
            {valor && <button type="button" className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => setTextos((t) => ({ ...t, [activa]: '' }))}>Vaciar</button>}
            {msg && <span className="text-xs" style={{ color: msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>{msg}</span>}
          </div>
        </div>
      )}
    </Panel>
  )
}
