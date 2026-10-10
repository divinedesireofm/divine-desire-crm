// Exporta la ficha de cada chatter a Excel con el MISMO formato que SEGUIMIENTO_CHATTERS.xlsx:
// fila 1 = meses (con color), fila 2 = fechas de informe, métricas, ratios en amarillo (con fórmulas)
// y las tablas «SIGNIFICADO» y «POSIBLES PROBLEMAS» debajo.
// Usa xlsx-js-style (igual que xlsx, pero permite colores y negritas), cargado solo al exportar.

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
// Colores de cada mes tomados del Excel original (marzo, que era de tema, en amarillo suave; nov y dic nuevos)
const COLOR_MES = ['6AA84F', 'FF9900', 'FFD966', 'F4CCCC', 'FCE5CD', '741B47', '00FF00', 'E6B8AF', '3D85C6', '00FF00', 'A4C2F4', 'B4A7D6']
const OSCUROS = new Set(['741B47', '3D85C6'])
const AMARILLO = 'FFE599'

// [clave, etiqueta, formato, tipo]  tipo: 'in' dato · 'f' ratio/fórmula
const FILAS = [
  ['ventas_total', 'Ventas Totales + Subs', '[$$]#,##0.00', 'in'],
  ['ventas_ppv', 'Ventas PPV', '[$$]#,##0.00', 'in'],
  ['propinas', 'Propinas', '[$$]#,##0.00', 'in'],
  ['mensajes_enviados', 'Mensajes Enviados', 'General', 'in'],
  ['ppv_enviados', 'PPV Enviados', 'General', 'in'],
  ['ppv_desbloqueados', 'PPV Desbloqueados', 'General', 'in'],
  ['golden', 'Golden Ratio', '0.00%', 'f', (c) => `IFERROR(${c}7/${c}6,"")`],
  ['unlock', 'Unlock Ratio', '0.00%', 'f', (c) => `IFERROR(${c}8/${c}7,"")`],
  ['fans_chateados', 'Fans Chateados', 'General', 'in'],
  ['tiempo_respuesta_seg', 'Tiempo de Respuesta', 'General', 'in'],
  ['horas_trabajadas', 'Horas trabajadas', 'General', 'in'],
  ['precio_medio', 'Precio medio PPV', '0.00', 'f', (c) => `IFERROR(${c}3/${c}8,"")`],
  ['por_fan', '$ por Fan Chateado', '0.00', 'f', (c) => `IFERROR(${c}3/${c}11,"")`],
  ['msgs_fan', 'Mensajes por fan', '0.00', 'f', (c) => `IFERROR(${c}6/${c}11,"")`],
  ['por_hora', '$ por hora', '0.00', 'f', (c) => `IFERROR(${c}3/${c}13,"")`],
]
// Fila 3 de la hoja = primera métrica (la fila 1 son los meses y la 2 las fechas)
const FILA_INI = 3

const SIGNIFICADO = [
  ['Ventas Totales + Subs', 'Ventas totales del chatter en bruto (PPV+PROPINAS+MENSAJES) mas las renovaciones de subs conseguidas por ellos', false],
  ['Ventas PPV', 'Ventas en neto', false],
  ['Propinas', 'Propinas en neto ', false],
  ['Mensajes Enviados', 'Cuantos mensajes ha enviado en ese periodo', false],
  ['PPV Enviados', 'Cuantos mensajes de venta ha enviado en ese periodo', false],
  ['PPV Desbloqueados', 'Cuantos mensajes de venta le compraron en ese periodo', false],
  ['Golden Ratio', 'De cada cuantos mensajes normales enviados, cuantos son de venta', true],
  ['Unlock Ratio', 'De cada mensaje de venta que envia, cuantos le abren', true],
  ['Fans Chateados', 'Con cuantos fans ha chateado en ese periodo', false],
  ['Tiempo de Respuesta', 'Tiempo medio de respuesta en los chats, siempre menos de 5 min es lo optimo, mas de eso inaceptable', false],
  ['Horas trabajadas', 'Cuantas horas ha trabajado en ese periodo', false],
  ['Precio medio PPV', 'Media de precios de los mensajes de venta que le compran', true],
  ['$ por Fan Chateado', 'Facturación por fan que habla', true],
  ['Mensajes por fan', 'Cuantos mensajes envia por fan', true],
  ['$ por hora', 'Cuanto factura por hora', true],
]
const PROBLEMAS = [
  ['Ventas', 'Si ⬇ es porque ha vendido menos en ese periodo, no siempre es por el chatter, puede ser trafico, revisar golden y unlock ratio y demás metricas en naranja', false],
  ['Mensajes Enviados', 'Si ⬇ es porque ha enviado mensajes, puede ser por tráfico igual revisar otras métricas', false],
  ['PPV Enviados', 'Si ⬇ es porque ha enviado menos mensajes de venta, revisar fans y mensajes enviados', false],
  ['PPV Desbloqueados', 'Si ⬇ es porque le abrieron menos mensajes, revisar fans chateados y unlock ratio', false],
  ['Golden Ratio', 'Si ⬇ es que esta mandando menos mensajes de venta, revisar miedos o pocas ganas de vender', true],
  ['Unlock Ratio', 'Si ⬇ es porque le abren menos mensajes de venta, revisar los PPV que envia, precio y contenido o momento en el que los envia', true],
  ['Fans Chateados', 'Si ⬇ es porque está hablando con menos fans, revisar si es problema de tráfico en la otra tabla de cuenta', false],
  ['Tiempo de Respuesta', 'Si ↑ es malo porque tarda más en responder mensajes', false],
  ['Horas trabajadas', 'Si ⬇ está trabajando menos dias o tiene problemas de luz o internet', false],
  ['Precio medio PPV', 'Si ⬇ es que está vendiendo a menos precio, revisar facturación si es buena, si aumento es que vende más pero a menos precio, no está mal', true],
  ['$ por Fan Chateado', 'Si ⬇ es que está monetizando menos a los fans que ya hay en la cuenta, revisar como habla con fans nuevos y si sigue guias de venta', true],
  ['Mensajes por fan', 'Si ⬇ es que está hablando menos con los fans y seguramente al hablar menos no esté fidelizando y esté teniendo menos ventas', true],
  ['$ por hora', 'Si ⬇ es porque en el horario está rindiendo menos en cuanto a ventas, revisar tiempo de respuesta y ventas realizadas', true],
]

// ---- utilidades ----
const pad = (n) => String(n).padStart(2, '0')
function aDate(isoStr) { const [y, m, d] = String(isoStr).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
// Fecha de la columna = lunes en que se rellena el informe = inicio de la semana medida + 7 días
function fechaInforme(weekStart) { const d = aDate(weekStart); d.setDate(d.getDate() + 7); return d }
function serieExcel(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000) }
function segATexto(s) { const n = Math.round(Number(s)); return `${Math.floor(n / 60)}m${n % 60}s` }
function letra(i) { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const borde = { style: 'thin', color: { rgb: '000000' } }
const BORDES = { top: borde, bottom: borde, left: borde, right: borde }
function nombreHoja(n, usados) {
  let base = String(n || 'Chatter').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Chatter'
  let t = base, i = 2
  while (usados.has(t.toLowerCase())) { t = base.slice(0, 28) + ' ' + i++ }
  usados.add(t.toLowerCase())
  return t
}

// Construye la hoja de un chatter. `semanas` = filas de chatter_weekly_stats (cualquier orden).
function construirHoja(XLSX, semanas) {
  const ord = [...semanas].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)))
  const ws = {}
  const celda = (r, c, v, t, s, z) => {
    const ref = XLSX.utils.encode_cell({ r: r - 1, c })
    ws[ref] = { v, t, s }
    if (z) ws[ref].z = z
    return ref
  }
  const merges = []
  const negrita = (extra = {}) => ({ font: { name: 'Arial', bold: true }, ...extra })

  celda(2, 0, 'FECHA', 's', negrita({ border: BORDES }))
  FILAS.forEach((f, i) => celda(FILA_INI + i, 0, f[1], 's', negrita({ border: BORDES, ...(f[3] === 'f' ? { fill: { patternType: 'solid', fgColor: { rgb: AMARILLO } } } : {}) })))

  // Columnas semanales; el rótulo de mes se combina sobre las columnas de ese mes
  let mesIni = -1, mesClave = ''
  const cerrarMes = (hasta) => { if (mesIni >= 0 && hasta > mesIni) merges.push({ s: { r: 0, c: mesIni }, e: { r: 0, c: hasta } }) }
  ord.forEach((w, k) => {
    const c = k + 1
    const col = letra(c)
    const fi = fechaInforme(w.week_start)
    const clave = fi.getFullYear() + '-' + fi.getMonth()
    const color = COLOR_MES[fi.getMonth()]
    const fillMes = { patternType: 'solid', fgColor: { rgb: color } }
    const fontMes = { name: 'Arial', bold: true, color: { rgb: OSCUROS.has(color) ? 'FFFFFF' : '000000' } }
    if (clave !== mesClave) {
      cerrarMes(c - 1)
      mesClave = clave; mesIni = c
      celda(1, c, `MES ${MESES[fi.getMonth()]} ${fi.getFullYear()}`, 's', { font: fontMes, fill: fillMes, alignment: { horizontal: 'center' }, border: BORDES })
    } else {
      celda(1, c, '', 's', { fill: fillMes, border: BORDES })
    }
    celda(2, c, serieExcel(fi), 'n', { font: fontMes, fill: fillMes, border: BORDES, alignment: { horizontal: 'right' } }, 'dd/mm/yy')
    FILAS.forEach((f, i) => {
      const r = FILA_INI + i
      const [clv, , fmt, tipo, formula] = f
      if (tipo === 'f') {
        celda(r, c, '', 's', { font: { name: 'Arial' }, fill: { patternType: 'solid', fgColor: { rgb: AMARILLO } }, border: BORDES })
        const ref = XLSX.utils.encode_cell({ r: r - 1, c })
        ws[ref] = { t: 'n', f: formula(col), z: fmt, s: { font: { name: 'Arial' }, fill: { patternType: 'solid', fgColor: { rgb: AMARILLO } }, border: BORDES, alignment: { horizontal: 'right' } } }
        return
      }
      const estilo = { font: { name: 'Arial' }, fill: fillMes, border: BORDES, alignment: { horizontal: 'right' } }
      if (clv === 'tiempo_respuesta_seg') {
        const v = num(w[clv])
        if (v === null) celda(r, c, '', 's', estilo)
        else celda(r, c, segATexto(v), 's', estilo)
        return
      }
      const v = num(w[clv])
      if (v === null) celda(r, c, '', 's', estilo)
      else celda(r, c, v, 'n', estilo, fmt)
    })
  })
  cerrarMes(ord.length)

  // Tablas explicativas, igual que en el Excel original
  let r = FILA_INI + FILAS.length + 1 // deja una fila en blanco (SIGNIFICADO en la fila 19, como el original)
  const amarilloA = { font: { name: 'Arial' }, fill: { patternType: 'solid', fgColor: { rgb: AMARILLO } } }
  celda(r, 0, 'SIGNIFICADO', 's', negrita()); r++
  SIGNIFICADO.forEach(([a, b, amar]) => { celda(r, 0, a, 's', amar ? amarilloA : { font: { name: 'Arial' } }); celda(r, 1, b, 's', { font: { name: 'Arial' } }); r++ })
  r += 2
  celda(r, 0, 'POSIBLES PROBLEMAS', 's', negrita()); r++
  PROBLEMAS.forEach(([a, b, amar]) => { celda(r, 0, a, 's', amar ? amarilloA : { font: { name: 'Arial' } }); celda(r, 1, b, 's', { font: { name: 'Arial' } }); r++ })

  const ncols = Math.max(2, ord.length + 1)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: ncols - 1 } })
  ws['!merges'] = merges
  ws['!cols'] = [{ wch: 25.25 }, ...Array.from({ length: ncols - 1 }, () => ({ wch: 11.5 }))]
  return ws
}

// fichas: [{ nombre, semanas:[filas de chatter_weekly_stats] }]
export async function exportarFichasChatters(fichas, nombreArchivo) {
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.utils.book_new()
  const usados = new Set()
  fichas.forEach((f) => XLSX.utils.book_append_sheet(wb, construirHoja(XLSX, f.semanas), nombreHoja(f.nombre, usados)))
  XLSX.writeFile(wb, nombreArchivo, { cellStyles: true })
}
