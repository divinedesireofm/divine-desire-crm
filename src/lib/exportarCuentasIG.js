// Exporta «Cuentas de Instagram» a Excel, Word o PDF: General + cada subapartado como una hoja / sección del mismo documento.
// Respeta los permisos: sin permiso para ver contraseñas o 2FA, esas columnas salen como «Sin permiso».
import { supabase } from './supabase'
import { SECCIONES, ORDEN_SECCIONES, estadoDeCuenta } from './cuentasIGSecciones'
import { urlInstagram, usuarioIG } from './instagramLink'
import { conjuntoExtrabajadores, conEtiqueta } from './personasIG'

const SIN_PERMISO = 'Sin permiso'
const ESTADO_GENERAL = { calentando: 'Calentando', activa: 'Activa', en_pausa: 'En pausa', en_revision: 'En revisión', suspendida: 'Suspendida', baneada: 'Baneada' }
const fechaES = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '')
const hoyISO = () => new Date().toISOString().slice(0, 10)
const dias = (f) => { if (!f) return ''; const d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000); return d >= 0 ? d : '' }

// Cada hoja: { nombre, titulo, columnas: [{ n, peso }], filas: [[celda]] }  ·  celda = { t: texto, fecha?: 'YYYY-MM-DD', url?: enlace }
export async function reunirHojas({ accounts = [], seguidores = {}, models = [], verPass = true, ver2fa = true, incluirSecciones = true, origenDe, personas = [] }) {
  const hojas = []
  const extras = conjuntoExtrabajadores(personas)
  const nombreModelo = (id) => models.find((m) => m.id === id)?.stage_name || ''

  const generales = accounts.slice().sort((a, b) => (a.orden ?? 1e15) - (b.orden ?? 1e15))
  hojas.push({
    nombre: 'General', titulo: 'General',
    columnas: [{ n: 'Cuenta actual', peso: 1.3 }, { n: 'Modelo' }, { n: 'Estado' }, { n: 'Responsable' }, { n: 'Seguidores', peso: 1.1 }, { n: 'IG original', peso: 1.2 },
      { n: 'Correo', peso: 1.6 }, { n: '2FA', peso: 1.4 }, { n: 'Público' }, { n: 'Asignación', peso: 0.9 }, { n: 'Días', peso: 0.6 }, { n: 'Observaciones', peso: 2.5 }, { n: 'Restricciones', peso: 2.5 }],
    filas: generales.map((a) => [
      { t: `@${a.username}`, url: urlInstagram(a.username) },
      { t: a.models?.stage_name || '' }, { t: estadoDeCuenta(a) || ESTADO_GENERAL[a.status] || a.status || '' }, { t: a.profiles?.full_name || '' },
      { t: seguidores[a.id] != null ? String(seguidores[a.id]) : '' }, { t: (origenDe ? origenDe(a) : a.original_username) || '' }, { t: a.email || '' },
      { t: a.two_fa_code ? (ver2fa ? a.two_fa_code : SIN_PERMISO) : '' }, { t: (a.target_audience || []).join(', ') },
      { t: fechaES(a.assigned_at), fecha: a.assigned_at ? String(a.assigned_at).slice(0, 10) : null }, { t: String(dias(a.assigned_at)) },
      { t: a.observations || '' }, { t: a.restrictions || '' },
    ]),
  })

  if (incluirSecciones) {
    for (const id of ORDEN_SECCIONES) {
      if (Array.isArray(incluirSecciones) && !incluirSecciones.includes(id)) continue
      const cfg = SECCIONES[id]
      const { data, error } = await supabase.from(cfg.tabla).select('*').order('orden', { ascending: true }).limit(5000)
      if (error) throw new Error(`No se pudo leer «${cfg.pestana}»: ${error.message}`)
      const cols = cfg.cols.filter((c) => !c.soloForm)
      hojas.push({
        nombre: cfg.pestana, titulo: cfg.pestana,
        columnas: cols.map((c) => ({ n: c.n, peso: c.tipo === 'largo' ? 2.5 : c.k.includes('correo') || c.k === 'email' ? 1.6 : c.tipo === 'fecha' ? 0.9 : 1 })),
        filas: (data || []).map((f) => cols.map((c) => {
          const v = f[c.k]
          if (v === null || v === undefined || v === '') return { t: '' }
          if (c.tipo === 'secreto') return { t: verPass ? String(v) : SIN_PERMISO }
          if (c.k === 'dos_fa') return { t: ver2fa ? String(v) : SIN_PERMISO }
          if (c.tipo === 'modeloSel') return { t: nombreModelo(v) }
          if (c.tipo === 'persona') return { t: conEtiqueta(v, extras) }
          if (c.tipo === 'fecha') return { t: fechaES(v), fecha: String(v).slice(0, 10) }
          if (c.usuarioIG) return { t: String(v), url: urlInstagram(v) }
          return { t: String(v) }
        })),
      })
    }
  }
  return hojas
}

function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
export const nombreArchivo = (ext) => `Cuentas-de-Instagram_${hoyISO()}.${ext}`

// ───────── Excel ─────────
export async function exportarExcel(hojas) {
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.utils.book_new()
  const borde = { style: 'thin', color: { rgb: 'D9D9D9' } }
  const bordes = { top: borde, bottom: borde, left: borde, right: borde }
  const usados = new Set()
  hojas.forEach((h) => {
    const cab = h.columnas.map((c) => ({ v: c.n, t: 's', s: { font: { bold: true, color: { rgb: '1A1A1A' } }, fill: { fgColor: { rgb: 'D4AF37' } }, alignment: { vertical: 'center', horizontal: 'center', wrapText: true }, border: bordes } }))
    const filas = h.filas.map((fila) => fila.map((c) => {
      const base = { alignment: { vertical: 'top', wrapText: true }, border: bordes }
      if (c.fecha) return { v: new Date(c.fecha + 'T00:00:00Z'), t: 'd', z: 'dd/mm/yyyy', s: base }
      const cel = { v: c.t, t: 's', s: base }
      if (c.url && c.t) { cel.l = { Target: c.url, Tooltip: 'Abrir la cuenta de Instagram' }; cel.s = { ...base, font: { color: { rgb: '0563C1' }, underline: true } } }
      return cel
    }))
    const ws = XLSX.utils.aoa_to_sheet([cab, ...filas], { cellDates: true })
    ws['!cols'] = h.columnas.map((c, i) => {
      const max = Math.max(c.n.length, ...h.filas.map((f) => String(f[i]?.t || '').length))
      return { wch: Math.min(Math.max(10, max + 2), c.peso >= 2 ? 60 : 38) }
    })
    ws['!rows'] = [{ hpt: 30 }]
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws['!views'] = [{ state: 'frozen', ySplit: 1 }]
    if (h.filas.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: h.filas.length, c: h.columnas.length - 1 } }) }
    let nombre = h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); let n = 2
    while (usados.has(nombre.toLowerCase())) nombre = `${nombre.slice(0, 28)} ${n++}`
    usados.add(nombre.toLowerCase())
    XLSX.utils.book_append_sheet(wb, ws, nombre)
  })
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })
  bajar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo('xlsx'))
}

// Reparte un ancho total entre columnas según su peso
const repartir = (cols, total) => { const s = cols.reduce((a, c) => a + (c.peso || 1), 0); return cols.map((c) => Math.floor((total * (c.peso || 1)) / s)) }

// ───────── Word ─────────
export async function exportarWord(hojas) {
  const D = await import('docx')
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, ShadingType, PageOrientation, AlignmentType, Footer, PageNumber, BorderStyle } = D
  const ANCHO = 15398
  const linea = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
  const bordes = { top: linea, bottom: linea, left: linea, right: linea }
  const secciones = hojas.map((h) => {
    const anchos = repartir(h.columnas, ANCHO)
    const celda = (texto, i, cab) => new TableCell({
      width: { size: anchos[i], type: WidthType.DXA }, borders: bordes,
      shading: cab ? { type: ShadingType.CLEAR, fill: 'D4AF37', color: 'auto' } : undefined,
      margins: { top: 40, bottom: 40, left: 70, right: 70 },
      children: [new Paragraph({ children: [new TextRun({ text: texto || '', size: 14, bold: !!cab })] })],
    })
    const cuerpo = h.filas.length
      ? h.filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c.t, i, false)) }))
      : [new TableRow({ children: [new TableCell({ columnSpan: h.columnas.length, width: { size: ANCHO, type: WidthType.DXA }, borders: bordes, children: [new Paragraph({ children: [new TextRun({ text: 'Sin registros', italics: true, size: 16 })] })] })] })]
    return {
      properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Divine Desire · Cuentas de Instagram · Página ', size: 14, color: '7F7F7F' }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '7F7F7F' })] })] }) },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `Cuentas de Instagram · ${h.titulo}`, bold: true, size: 32 })] }),
        new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: `${h.filas.length} registro${h.filas.length === 1 ? '' : 's'} · exportado el ${fechaES(hoyISO())}`, size: 18, color: '7F7F7F' })] }),
        new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, rows: [new TableRow({ tableHeader: true, children: h.columnas.map((c, i) => celda(c.n, i, true)) }), ...cuerpo] }),
      ],
    }
  })
  const doc = new Document({ creator: 'Divine Desire CRM', title: 'Cuentas de Instagram', sections: secciones })
  bajar(await Packer.toBlob(doc), nombreArchivo('docx'))
}

// ───────── PDF ─────────
const limpiaPdf = (s) => String(s ?? '').replace(/[^ -ÿ–—‘’“”•€]/g, '').replace(/\s+/g, ' ').trim()
export async function exportarPdf(hojas) {
  const [pdfMod, tablaMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const jsPDF = pdfMod.jsPDF || pdfMod.default?.jsPDF || pdfMod.default
  const autoTable = [tablaMod.default, tablaMod.default?.default, tablaMod.autoTable].find((f) => typeof f === 'function')
  if (!autoTable) throw new Error('No se pudo cargar el generador de tablas del PDF')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const margen = 28
  const util = doc.internal.pageSize.getWidth() - margen * 2
  hojas.forEach((h, idx) => {
    if (idx > 0) doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(26, 26, 26)
    doc.text(limpiaPdf(`Cuentas de Instagram · ${h.titulo}`), margen, 38)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120)
    doc.text(`${h.filas.length} registro${h.filas.length === 1 ? '' : 's'} · exportado el ${fechaES(hoyISO())}`, margen, 52)
    const anchos = repartir(h.columnas, util)
    autoTable(doc, {
      startY: 62, margin: { left: margen, right: margen, top: 40, bottom: 34 },
      head: [h.columnas.map((c) => limpiaPdf(c.n))],
      body: h.filas.length ? h.filas.map((f) => f.map((c) => limpiaPdf(c.t))) : [[{ content: 'Sin registros', colSpan: h.columnas.length, styles: { fontStyle: 'italic' } }]],
      styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'top', lineColor: [200, 200, 200], lineWidth: 0.3, textColor: [30, 30, 30] },
      headStyles: { fillColor: [212, 175, 55], textColor: [26, 26, 26], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: Object.fromEntries(anchos.map((w, i) => [i, { cellWidth: w }])),
    })
  })
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140)
    doc.text(`Divine Desire · Cuentas de Instagram · Página ${i} de ${n}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 16, { align: 'center' })
  }
  doc.save(nombreArchivo('pdf'))
}
