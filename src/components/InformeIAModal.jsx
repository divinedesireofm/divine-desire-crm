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
10. NUNCA analices solo los números del periodo pedido. Recibirás: (a) el PERIODO A ANALIZAR, (b) el HISTÓRICO ANTERIOR con sus medias, (c) la media del equipo en ese periodo (para un chatter) y (d) los INFORMES ANTERIORES guardados. Compara siempre el periodo con su media histórica y con las semanas previas (¿mejora o empeora y cuánto?), con el resto del equipo, y haz seguimiento de los informes anteriores: qué se dijo entonces, si las cifras confirman o desmienten aquellas conclusiones y si se cumplieron las acciones propuestas. Si falta historial o informes previos, dilo en una línea y sigue.
11. Si Kevin escribe un contexto o unas instrucciones, tenlos en cuenta como prioridad: responde a lo que pide y con el enfoque que pide.
Formato de salida: SOLO Markdown, sin introducciones del tipo "Aquí tienes". Empieza con un título con # (por ejemplo "# Informe de rendimiento — Nombre"), y usa secciones con ## (Resumen ejecutivo, Lo que dicen los números —con tabla Markdown de las cifras clave—, Puntos fuertes, Puntos de atención, Plan de acción numerado, Conclusión), negritas para lo importante y listas. Sé directo, concreto y accionable, sin relleno.`

// ambito: 'chatter' | 'equipo'
const FASES = ['SINCRONIZANDO DATOS', 'ESCANEANDO TENDENCIAS', 'CRUZANDO RATIOS', 'DETECTANDO ANOMALÍAS', 'INTEGRANDO TU CONTEXTO', 'REDACTANDO INFORME', 'VERIFICANDO CONCLUSIONES']
const CSS_IA = `
.hud{position:relative;height:300px;perspective:900px;overflow:hidden;border-radius:12px;background:radial-gradient(ellipse at 50% 55%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 65%),var(--panel-alt);border:1px solid var(--border)}
.hud .scene{position:absolute;left:50%;top:44%;width:0;height:0;transform-style:preserve-3d;transform:rotateX(-18deg);animation:hudtilt 9s ease-in-out infinite alternate}
.hud .cube{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;transform-style:preserve-3d;animation:hudspin 9s linear infinite}
.hud .cube.in{width:60px;height:60px;margin:-30px 0 0 -30px;animation:hudspin2 5s linear infinite}
.hud .f{position:absolute;inset:0;border:1.5px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,transparent);box-shadow:0 0 14px color-mix(in srgb,var(--accent) 45%,transparent) inset;background-image:linear-gradient(var(--accent-soft) 1px,transparent 1px),linear-gradient(90deg,var(--accent-soft) 1px,transparent 1px);background-size:20px 20px}
.hud .cube.in .f{background-size:15px 15px;border-color:#fff;box-shadow:0 0 18px var(--accent) inset}
.hud .f1{transform:translateZ(60px)}.hud .f2{transform:rotateY(90deg) translateZ(60px)}.hud .f3{transform:rotateY(180deg) translateZ(60px)}.hud .f4{transform:rotateY(-90deg) translateZ(60px)}.hud .f5{transform:rotateX(90deg) translateZ(60px)}.hud .f6{transform:rotateX(-90deg) translateZ(60px)}
.hud .cube.in .f1{transform:translateZ(30px)}.hud .cube.in .f2{transform:rotateY(90deg) translateZ(30px)}.hud .cube.in .f3{transform:rotateY(180deg) translateZ(30px)}.hud .cube.in .f4{transform:rotateY(-90deg) translateZ(30px)}.hud .cube.in .f5{transform:rotateX(90deg) translateZ(30px)}.hud .cube.in .f6{transform:rotateX(-90deg) translateZ(30px)}
.hud .core{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;box-shadow:0 0 25px 8px var(--accent),0 0 60px 18px color-mix(in srgb,var(--accent) 50%,transparent);animation:hudcore 1.4s ease-in-out infinite}
.hud .ring{position:absolute;border-radius:50%;border:1.5px dashed var(--accent);transform-style:preserve-3d}
.hud .r1{width:230px;height:230px;margin:-115px 0 0 -115px;transform:rotateX(75deg);animation:hudring 7s linear infinite}
.hud .r2{width:290px;height:290px;margin:-145px 0 0 -145px;border-style:solid;border-width:1px;opacity:.55;transform:rotateX(75deg) rotateY(25deg);animation:hudring 12s linear infinite reverse}
.hud .r3{width:180px;height:180px;margin:-90px 0 0 -90px;border-color:#fff;opacity:.6;transform:rotateY(75deg);animation:hudring2 5s linear infinite}
.hud .sat{position:absolute;left:50%;top:-5px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#fff;box-shadow:0 0 12px 3px var(--accent)}
.hud .grid{position:absolute;left:-50%;right:-50%;bottom:-30%;height:60%;transform:rotateX(72deg);transform-origin:50% 0;background-image:linear-gradient(var(--accent) 1px,transparent 1px),linear-gradient(90deg,var(--accent) 1px,transparent 1px);background-size:34px 34px;opacity:.28;animation:hudgrid 1.2s linear infinite;-webkit-mask:linear-gradient(transparent,#000 40%);mask:linear-gradient(transparent,#000 40%)}
.hud .scan{position:absolute;left:0;right:0;height:70px;background:linear-gradient(transparent,color-mix(in srgb,var(--accent) 22%,transparent),transparent);animation:hudscan 2.8s linear infinite}
.hud .br{position:absolute;width:22px;height:22px;border:2px solid var(--accent)}
.hud .br.a{left:10px;top:10px;border-right:0;border-bottom:0}.hud .br.b{right:10px;top:10px;border-left:0;border-bottom:0}.hud .br.c{left:10px;bottom:10px;border-right:0;border-top:0}.hud .br.d{right:10px;bottom:10px;border-left:0;border-top:0}
.hud .tag{position:absolute;font:600 10px/1.4 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em;color:var(--accent);text-transform:uppercase}
.hud .bar{position:absolute;left:12%;right:12%;bottom:34px;height:3px;background:var(--border);overflow:hidden;border-radius:2px}
.hud .bar i{position:absolute;top:0;bottom:0;width:35%;background:linear-gradient(90deg,transparent,var(--accent),#fff);animation:hudbar 1.5s ease-in-out infinite}
.hud .fase{position:absolute;left:0;right:0;bottom:12px;text-align:center;font:700 11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;color:var(--text);animation:hudblink 1.2s steps(2) infinite}
.hud .p{position:absolute;width:3px;height:3px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--accent);animation:hudp 4s linear infinite}
@keyframes hudspin{to{transform:rotateX(360deg) rotateY(360deg)}}
@keyframes hudspin2{to{transform:rotateX(-360deg) rotateZ(360deg) rotateY(-360deg)}}
@keyframes hudtilt{from{transform:rotateX(-30deg) rotateY(-12deg)}to{transform:rotateX(-8deg) rotateY(12deg)}}
@keyframes hudring{to{transform:rotateX(75deg) rotateZ(360deg)}}
@keyframes hudring2{to{transform:rotateY(75deg) rotateZ(-360deg)}}
@keyframes hudcore{0%,100%{transform:scale(.8)}50%{transform:scale(1.25)}}
@keyframes hudgrid{to{background-position:0 34px}}
@keyframes hudscan{0%{top:-70px}100%{top:100%}}
@keyframes hudbar{0%{left:-35%}100%{left:100%}}
@keyframes hudblink{50%{opacity:.55}}
@keyframes hudp{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-280px);opacity:0}}
@media (prefers-reduced-motion:reduce){.hud *{animation:none!important}}
`
const iso = (d) => String(d || '').slice(0, 10)
// Las semanas se guardan por su lunes; cada una cubre de lunes a domingo
const mas6 = (d) => { const t = new Date(iso(d) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 6); return t.toISOString().slice(0, 10) }

function Cargando({ segundos, intento }) {
  const [f, setF] = useState(0)
  useEffect(() => { const t = setInterval(() => setF((x) => (x + 1) % FASES.length), 2400); return () => clearInterval(t) }, [])
  const parts = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: 6 + ((i * 37) % 88), d: (i * 0.45) % 4, t: 40 + ((i * 53) % 220) })), [])
  return (
    <div role="status" aria-live="polite" className="py-2">
      <style>{CSS_IA}</style>
      <div className="hud">
        <div className="grid" />
        {parts.map((p, i) => <span key={i} className="p" style={{ left: `${p.l}%`, top: p.t, animationDelay: `${p.d}s` }} />)}
        <div className="scene">
          <div className="ring r1"><span className="sat" /></div>
          <div className="ring r2"><span className="sat" /></div>
          <div className="ring r3"><span className="sat" /></div>
          <div className="cube"><i className="f f1" /><i className="f f2" /><i className="f f3" /><i className="f f4" /><i className="f f5" /><i className="f f6" /></div>
          <div className="cube in"><i className="f f1" /><i className="f f2" /><i className="f f3" /><i className="f f4" /><i className="f f5" /><i className="f f6" /></div>
          <div className="core" />
        </div>
        <div className="scan" />
        <i className="br a" /><i className="br b" /><i className="br c" /><i className="br d" />
        <span className="tag" style={{ left: 22, top: 16 }}>DD·IA // ANÁLISIS</span>
        <span className="tag" style={{ right: 22, top: 16 }}>T+{String(segundos).padStart(3, '0')}s</span>
        <span className="tag" style={{ left: 22, bottom: 58, opacity: .7 }}>{intento > 1 ? `REINTENTO ${intento - 1}` : 'CANAL SEGURO'}</span>
        <div className="bar"><i /></div>
        <div className="fase">{FASES[f]}…</div>
      </div>
      <p className="text-xs text-center mt-3" style={{ color: 'var(--text-muted)' }}>La IA está trabajando · suele tardar entre 15 y 40 segundos · no cierres esta ventana</p>
    </div>
  )
}

// datos: chatter -> [{semana, ...métricas}] · equipo -> [{chatter, semanas:[{semana,...}]}]
const NUM_KEYS = ['ventas', 'ventas_ppv', 'propinas', 'mensajes', 'ppv_enviados', 'ppv_desbloqueados', 'golden_ratio', 'unlock_ratio', 'fans_chateados', 'tiempo_respuesta_seg', 'horas', 'precio_medio_ppv', 'dolar_por_fan', 'mensajes_por_fan', 'dolar_por_hora']
// Media de cada métrica (ignora las semanas sin dato)
function medias(rows) {
  const out = {}
  NUM_KEYS.forEach((k) => {
    const v = rows.map((r) => (r[k] === null || r[k] === undefined || r[k] === '' ? null : Number(r[k]))).filter((x) => x !== null && !Number.isNaN(x))
    if (v.length) out[k] = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000
  })
  return out
}
const recorta = (t, n) => (t.length > n ? t.slice(0, n) + '\n[…recortado]' : t)

export default function InformeIAModal({ ambito, chatterId, chatterNombre, datos, equipo, onClose }) {
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
      // Contexto para que la IA no mire solo el periodo: historial previo, media del equipo e informes anteriores
      const antes = (s) => iso(s.semana) < rango.desde
      const NPREV = esEquipo ? 8 : 12
      let previos = ''
      try {
        let q = supabase.from('metric_reports').select('titulo,periodo,contenido,created_at').eq('tipo', ambito).order('created_at', { ascending: false }).limit(3)
        if (!esEquipo) q = q.eq('chatter_id', chatterId)
        const { data: rp } = await q
        previos = (rp || []).map((r) => `--- Informe del ${new Date(r.created_at).toLocaleDateString('es-ES')} (${r.periodo}) ---\n${recorta(r.contenido || '', 3500)}`).join('\n\n')
      } catch (e) { /* sin informes previos */ }
      const sinPrevios = 'No hay informes anteriores guardados.'
      let cabecera
      if (esEquipo) {
        const hist = datos.map((d) => ({ chatter: d.chatter, semanas: d.semanas.filter(antes).slice(-NPREV) })).filter((d) => d.semanas.length)
        cabecera = `ANÁLISIS DE TODO EL EQUIPO DE CHATTERS.\n\n== (a) PERIODO A ANALIZAR: ${periodo} ==\nDatos semanales por chatter (JSON):\n${JSON.stringify(filtrado)}\n\nMedias del periodo por chatter (JSON):\n${JSON.stringify(filtrado.map((d) => ({ chatter: d.chatter, media_periodo: medias(d.semanas) })))}\n\n== (b) HISTÓRICO ANTERIOR (hasta ${NPREV} semanas previas al periodo) ==\n${hist.length ? `Medias históricas por chatter (JSON):\n${JSON.stringify(hist.map((d) => ({ chatter: d.chatter, semanas_previas: d.semanas.length, media_historica: medias(d.semanas) })))}\n\nSemanas previas (JSON):\n${JSON.stringify(hist)}` : 'No hay semanas anteriores registradas.'}\n\n== (d) INFORMES ANTERIORES DEL EQUIPO ==\n${previos || sinPrevios}`
      } else {
        const hist = datos.filter(antes).slice(-NPREV)
        const eqPeriodo = (equipo || []).filter((d) => d.chatter !== chatterNombre).flatMap((d) => d.semanas.filter(enRango))
        cabecera = `ANÁLISIS DEL CHATTER: ${chatterNombre}\n\n== (a) PERIODO A ANALIZAR: ${periodo} ==\nSemanas (JSON):\n${JSON.stringify(filtrado)}\nMedia del periodo (JSON): ${JSON.stringify(medias(filtrado))}\n\n== (b) HISTÓRICO ANTERIOR (${hist.length} semanas previas al periodo) ==\n${hist.length ? `Media histórica (JSON): ${JSON.stringify(medias(hist))}\nSemanas previas (JSON):\n${JSON.stringify(hist)}` : 'No hay semanas anteriores registradas.'}\n\n== (c) MEDIA DEL RESTO DEL EQUIPO EN EL MISMO PERIODO ==\n${eqPeriodo.length ? JSON.stringify(medias(eqPeriodo)) : 'Sin datos del equipo.'}\n\n== (d) INFORMES ANTERIORES DE ${chatterNombre} ==\n${previos || sinPrevios}`
      }
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
                {[['Última semana', 1], ['Última quincena', 2], ['Último mes', 4], ['Últimos 3 meses', 13]].map(([t, n]) => <Button key={n} variant="ghost" onClick={() => setRango(ultimas(n))}>{t}</Button>)}
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
