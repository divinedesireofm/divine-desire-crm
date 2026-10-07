// Lectura de los Excel de seguimiento (chatters y modelos) directamente en el navegador.
// Se usa la librería "xlsx" (SheetJS), cargada solo cuando se sube un archivo.

// ---------------- fechas ----------------
export const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export function aFecha(isoStr) { const [y, m, d] = isoStr.split('-').map(Number); return new Date(y, m - 1, d) }
export function lunesDe(isoStr) { const d = aFecha(isoStr); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d) }
// La fecha de la columna es el lunes en que se rellena el informe; describe la semana anterior.
export function semanaDeInforme(isoStr) { const d = aFecha(isoStr); d.setDate(d.getDate() - 7); return lunesDe(iso(d)) }
export function fmtF(isoStr) { if (!isoStr) return ''; const [y, m, d] = isoStr.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }

// Número de serie de Excel, objeto Date o texto -> 'AAAA-MM-DD' (o null)
export function aFechaISO(v) {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : iso(v)
  if (typeof v === 'number') {
    if (v < 30000 || v > 80000) return null
    const d = new Date(Math.round((v - 25569) * 86400000))
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
  }
  const t = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = Number(m[3])
    return `${y < 100 ? 2000 + y : y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
  }
  return null
}

// ---------------- valores ----------------
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// "1.234,5" -> 1234.5 ; "#DIV/0!" o vacío -> null
export function aNumero(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = String(v).trim().replace('%', '').replace('$', '').replace('€', '').trim()
  if (!t || t.startsWith('#')) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

// '2m37s' | '3M15S' | '2:37' | 157 | 0.0018 (formato hora de Excel) -> segundos
export function tiempoASegundos(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    return v > 0 && v < 1 ? Math.round(v * 86400) : Math.round(v)
  }
  const t = String(v).trim().toLowerCase()
  if (!t || t.startsWith('#')) return null
  let m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:eg)?)?$/)
  if (m && (m[1] || m[2] || m[3])) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0)
  m = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (m) return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])
  const n = aNumero(t)
  return n === null ? null : Math.round(n)
}
export function segundosATexto(s) {
  if (s === null || s === undefined || s === '') return '—'
  const n = Math.round(Number(s))
  return `${Math.floor(n / 60)}m${String(n % 60).padStart(2, '0')}s`
}

// ---------------- lectura del archivo ----------------
export async function leerLibro(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  return wb.SheetNames.map((nombre) => ({
    nombre,
    filas: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true }),
  }))
}

// Busca, en las primeras filas, la fila cuya primera celda coincide con alguna de las etiquetas
function buscarFila(filas, etiquetas, desde = 0, hasta = 40) {
  const set = etiquetas.map(norm)
  for (let r = desde; r < Math.min(filas.length, hasta); r++) {
    if (set.includes(norm(filas[r]?.[0]))) return r
  }
  return -1
}

// ---------------- Excel de CHATTERS (una hoja por chatter) ----------------
export const CAMPOS_CHATTER_EXCEL = [
  ['ventas_total', ['ventas totales + subs', 'ventas totales'], 'n'],
  ['ventas_ppv', ['ventas ppv'], 'n'],
  ['propinas', ['propinas'], 'n'],
  ['mensajes_enviados', ['mensajes enviados'], 'n'],
  ['ppv_enviados', ['ppv enviados'], 'n'],
  ['ppv_desbloqueados', ['ppv desbloqueados'], 'n'],
  ['fans_chateados', ['fans chateados'], 'n'],
  ['tiempo_respuesta_seg', ['tiempo de respuesta'], 't'],
  ['horas_trabajadas', ['horas trabajadas'], 'n'],
]

export function parsearChatters(hojas) {
  const out = []
  for (const h of hojas) {
    const rf = buscarFila(h.filas, ['fecha'])
    if (rf < 0) continue
    const filaCampo = {}
    for (const [key, etiquetas] of CAMPOS_CHATTER_EXCEL) {
      // solo la primera tabla (antes de «SIGNIFICADO»)
      const r = buscarFila(h.filas, etiquetas, rf + 1, rf + 25)
      if (r >= 0) filaCampo[key] = r
    }
    const semanas = []
    const ncols = Math.max(...h.filas.slice(rf, rf + 1).map((f) => f.length))
    for (let c = 1; c < ncols; c++) {
      const fecha = aFechaISO(h.filas[rf][c])
      if (!fecha) continue
      const valores = {}
      for (const [key, , tipo] of CAMPOS_CHATTER_EXCEL) {
        const raw = filaCampo[key] !== undefined ? h.filas[filaCampo[key]]?.[c] : null
        valores[key] = tipo === 't' ? tiempoASegundos(raw) : aNumero(raw)
      }
      const hayDatos = ['ventas_total', 'mensajes_enviados', 'fans_chateados', 'horas_trabajadas'].some((k) => valores[k])
      if (!hayDatos) continue
      semanas.push({ fecha, week_start: semanaDeInforme(fecha), valores })
    }
    out.push({ hoja: h.nombre, semanas })
  }
  return out
}

// ---------------- Excel de MODELOS (una hoja, una modelo) ----------------
// clave -> etiquetas posibles. Las calculadas (ratios) no se leen: el CRM las recalcula.
export const CAMPOS_MODELO_EXCEL = [
  ['billing_total', ['fac. cuenta', 'fac cuenta']],
  ['subscription_income', ['suscripciones']],
  ['of_profile_visits', ['visitas al perfil']],
  ['renewals_count', ['renovaciones']],
  ['of_subs_new', ['subs nuevas']],
  ['renewal_income', ['$ renovaciones']],
  ['renewal_activated_count', ['fans con renovacion activada']],
  ['active_fans', ['fans activos']],
  ['arppu', ['$ x spender']],
  ['arpu', ['$ x fan']],
  ['avg_days_subscribed', ['dias suscritos']],
  ['ig_followers_total', ['seguidores']],
  ['ig_avg_likes', ['media likes']],
  ['ig_avg_comments', ['media comentarios']],
  ['ig_avg_views', ['media vistas']],
]

export function parsearModelo(hojas) {
  const out = []
  for (const h of hojas) {
    const rf = buscarFila(h.filas, ['fecha'], 0, 10)
    if (rf < 0) continue
    const rfIG = buscarFila(h.filas, ['fecha'], rf + 1, 40)
    const filaCampo = {}
    for (const [key, etiquetas] of CAMPOS_MODELO_EXCEL) {
      const r = buscarFila(h.filas, etiquetas, rf + 1, 30)
      if (r >= 0) filaCampo[key] = r
    }
    const semanas = []
    const ncols = h.filas[rf].length
    for (let c = 1; c < ncols; c++) {
      const fecha = aFechaISO(h.filas[rf][c]) || (rfIG >= 0 ? aFechaISO(h.filas[rfIG][c]) : null)
      if (!fecha) continue
      const valores = {}
      for (const [key] of CAMPOS_MODELO_EXCEL) {
        valores[key] = filaCampo[key] !== undefined ? aNumero(h.filas[filaCampo[key]]?.[c]) : null
      }
      if (!Object.values(valores).some((v) => v !== null && v !== 0)) continue
      semanas.push({ fecha, week_start: semanaDeInforme(fecha), valores })
    }
    out.push({ hoja: h.nombre, semanas })
  }
  return out
}
