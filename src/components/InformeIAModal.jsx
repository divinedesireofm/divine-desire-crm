import { useEffect, useMemo, useState } from 'react'
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
const FRASES = ['Leyendo las estadísticas…', 'Comparando semanas y tendencias…', 'Cruzando ventas, ratios y tráfico…', 'Detectando puntos de atención…', 'Teniendo en cuenta tu contexto…', 'Redactando el informe…', 'Puliendo las conclusiones…']
const CSS_IA = `
@keyframes iaspin{to{transform:rotate(360deg)}}
@keyframes iapulse{0%{transform:scale(.55);opacity:.55}100%{transform:scale(1.5);opacity:0}}
@keyframes iashimmer{0%{background-position:-300px 0}100%{background-position:300px 0}}
@keyframes iafade{0%{opacity:0;transform:translateY(6px)}15%,85%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-6px)}}
@keyframes iafloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.ia-orb{position:relative;width:84px;height:84px;margin:0 auto;animation:iafloat 3s ease-in-out infinite}
.ia-orb .core{position:absolute;inset:18px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff7d6,var(--accent) 55%,#6b4aff);box-shadow:0 0 30px var(--accent)}
.ia-orb .ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 55%,var(--accent) 75%,#fff 100%);-webkit-mask:radial-gradient(circle,transparent 58%,#000 60%);mask:radial-gradient(circle,transparent 58%,#000 60%);animation:iaspin 1.6s linear infinite}
.ia-orb .ring.r2{inset:6px;animation-duration:2.6s;animation-direction:reverse;opacity:.7}
.ia-orb .wave{position:absolute;inset:14px;border-radius:50%;border:2px solid var(--accent);animation:iapulse 2.4s ease-out infinite}
.ia-orb .wave.w2{animation-delay:1.2s}
.ia-line{height:11px;border-radius:6px;margin:10px auto;background:linear-gradient(90deg,var(--panel-alt) 25%,var(--accent-soft) 50%,var(--panel-alt) 75%);background-size:600px 100%;animation:iashimmer 1.6s linear infinite}
.ia-frase{animation:iafade 2.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.ia-orb,.ia-orb .ring,.ia-orb .wave,.ia-line,.ia-frase{animation:none}}
`
const iso = (d) => String(d || '').slice(0, 10)
// Las semanas se guardan por su lunes; cada una cubre de lunes a domingo
const mas6 = (d) => { const t = new Date(iso(d) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 6); return t.toISOString().slice(0, 10) }

function Cargando({ segundos, intento }) {
  const [f, setF] = useState(0)
  useEffect(() => { const t = setInterval(() => setF((x) => (x + 1) % FRASES.length), 2600); return () => clearInterval(t) }, [])
  return (
    <div className="py-8 text-center" role="status" aria-live="polite">
      <style>{CSS_IA}</style>
      <div className="ia-orb"><span className="wave" /><span className="wave w2" /><span className="ring" /><span className="ring r2" /><span className="core" /></div>
      <p key={f} className="ia-frase text-sm font-medium mt-6 mb-1">{FRASES[f]}</p>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        La IA está trabajando{intento > 1 ? ` (reintento ${intento - 1})` : ''} · {segundos}s · suele tardar entre 15 y 40 segundos, no cierres esta ventana
      </p>
      <div className="max-w-md mx-auto">
        <div className="ia-line" style={{ width: '90%' }} /><div className="ia-line" style={{ width: '100%' }} /><div className="ia-line" style={{ width: '75%' }} /><div className="ia-line" style={{ width: '88%' }} />
      </div>
    </div>
  )
}

// datos: chatter -> [{semana, ...métricas}] · equipo -> [{chatter, semanas:[{semana,...}]}]
export default function InformeIAModal({ ambito, chatterId, chatterNombre, datos, onClose }) {
  const { profile } = useAuth()
  const [contexto, setContexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [informe, setInforme] = useState(null) // { titulo, contenido }
  const [segundos, setSegundos] = useState(0)
  const [intento, setIntento] = useState(1)
  const esEquipo = ambito === 'equipo'

  const semanasAll = useMemo(() => [...new Set((esEquipo ? datos.flatMap((d) => d.semanas) : datos).map((s) => iso(s.semana)))].sort(), [datos, esEquipo])
  const ultimas = (n) => ({ desde: semanasAll[Math.max(0, semanasAll.length - n)] || '', hasta: semanasAll.length ? mas6(semanasAll[semanasAll.length - 1]) : '' })
  const [rango, setRango] = useState(() => ultimas(esEquipo ? 8 : 16))
  const enRango = (s) => iso(s.semana) <= rango.hasta && mas6(s.semana) >= rango.desde // la semana (lun-dom) coincide con el periodo
  const filtrado = useMemo(() => (esEquipo
    ? datos.map((d) => ({ chatter: d.chatter, semanas: d.semanas.filter(enRango) })).filter((d) => d.semanas.length)
    : datos.filter(enRango)), [datos, rango, esEquipo])
  const nSemanas = useMemo(() => new Set((esEquipo ? filtrado.flatMap((d) => d.semanas) : filtrado).map((s) => iso(s.semana))).size, [filtrado, esEquipo])
  const fmtD = (d) => (d ? d.split('-').reverse().join('/') : '—')
  const periodo = nSemanas ? `semanas del ${fmtD(rango.desde)} al ${fmtD(rango.hasta)} (${nSemanas} ${nSemanas === 1 ? 'semana' : 'semanas'})` : 'sin datos en ese rango'
  const rangoMal = !rango.desde || !rango.hasta || rango.desde > rango.hasta

  useEffect(() => {
    if (!busy) return undefined
    setSegundos(0)
    const t = setInterval(() => setSegundos((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  async function generar() {
    if (rangoMal || !nSemanas) { setErr('Elige un periodo con datos: la fecha «desde» debe ser anterior a «hasta» y tener semanas registradas.'); return }
    setBusy(true); setErr(''); setAviso(''); setIntento(1)
    try {
      const guia = await getVoiceGuide().catch(() => '')
      const system = withVoiceGuide(BASE, guia)
      const cabecera = esEquipo
        ? `ANÁLISIS DE TODO EL EQUIPO DE CHATTERS.\nPeriodo cubierto: ${periodo}\n\nDatos semanales por chatter (JSON):\n${JSON.stringify(filtrado)}`
        : `ANÁLISIS DEL CHATTER: ${chatterNombre}\nPeriodo cubierto: ${periodo}\n\nHistórico semanal (JSON):\n${JSON.stringify(filtrado)}`
      const texto = `${cabecera}\n\n${contexto.trim() ? `CONTEXTO E INSTRUCCIONES DE KEVIN (prioridad):\n${contexto.trim()}` : 'Kevin no ha añadido contexto: haz un análisis general completo.'}`
      // La primera llamada a veces llega vacía (la función estaba «dormida»): se reintenta sola hasta 3 veces
      let md = ''
      let ultimoErr = null
      for (let n = 1; n <= 3 && !md; n++) {
        setIntento(n)
        try {
          const res = await iaCall(system, [{ role: 'user', content: texto }], 4000)
          md = typeof res === 'string' ? res.trim() : ''
        } catch (e) { ultimoErr = e }
        if (!md && n < 3) await new Promise((r) => setTimeout(r, 1500))
      }
      if (!md) throw (ultimoErr || new Error('La IA no devolvió ningún texto tras varios intentos. Inténtalo de nuevo en un minuto.'))
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

        {busy && <Cargando segundos={segundos} intento={intento} />}

        {!informe && !busy && (
          <>
            <p className="text-sm font-medium mb-1">Periodo a analizar</p>
            <div className="flex items-end gap-3 flex-wrap mb-2">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Desde</label>
                <input type="date" value={rango.desde} min={semanasAll[0]} max={rango.hasta || undefined} onChange={(e) => setRango({ ...rango, desde: e.target.value })} className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Hasta</label>
                <input type="date" value={rango.hasta} min={rango.desde || undefined} max={semanasAll.length ? mas6(semanasAll[semanasAll.length - 1]) : undefined} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[4, 8, 16].map((n) => <Button key={n} variant="ghost" onClick={() => setRango(ultimas(n))}>Últ. {n} sem.</Button>)}
                <Button variant="ghost" onClick={() => setRango(ultimas(semanasAll.length))}>Todo</Button>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: nSemanas && !rangoMal ? 'var(--text-muted)' : 'var(--danger)' }}>
              {rangoMal ? 'La fecha «desde» debe ser anterior a «hasta».' : nSemanas ? `Se analizarán ${nSemanas} ${nSemanas === 1 ? 'semana completa (lunes a domingo)' : 'semanas completas (lunes a domingo)'} que coinciden con esas fechas (${semanasAll.length} disponibles en total).` : 'No hay semanas registradas en ese rango.'}
            </p>
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
              <Button onClick={generar} disabled={rangoMal || !nSemanas}>✨ Generar informe</Button>
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
