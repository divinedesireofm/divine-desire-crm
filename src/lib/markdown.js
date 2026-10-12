// Convierte Markdown sencillo (títulos, negritas, listas, tablas, citas, líneas) en HTML SEGURO:
// todo el texto se escapa antes de aplicar formato, así que nunca puede romper la pantalla.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
}

const esFilaTabla = (l) => /^\s*\|.*\|\s*$/.test(l)
const esSepTabla = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-')
const celdas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export function mdToHtml(md) {
  const lines = String(md ?? '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    let m
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(m[1].length + 0, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { out.push('<hr/>'); i++; continue }
    if (esFilaTabla(l) && i + 1 < lines.length && esSepTabla(lines[i + 1])) {
      const head = celdas(l)
      i += 2
      const rows = []
      while (i < lines.length && esFilaTabla(lines[i])) { rows.push(celdas(lines[i])); i++ }
      out.push('<div class="tw"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (/^\s*>\s?/.test(l)) {
      const q = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      out.push(`<blockquote>${q.map(inline).join('<br/>')}</blockquote>`)
      continue
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const it = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++ }
      out.push('<ul>' + it.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>')
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const it = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { it.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++ }
      out.push('<ol>' + it.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>')
      continue
    }
    const p = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*>|\s*\|)/.test(lines[i])) { p.push(lines[i]); i++ }
    if (!p.length) { p.push(lines[i]); i++ }
    out.push(`<p>${p.map(inline).join('<br/>')}</p>`)
  }
  return out.join('\n')
}

export const ESTILO_INFORME = `
.informe{font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;line-height:1.6;font-size:14px}
.informe h1{font-size:24px;margin:0 0 12px;font-weight:700}
.informe h2{font-size:18px;margin:26px 0 8px;padding-bottom:5px;border-bottom:2px solid #c9a24b;font-weight:700}
.informe h3{font-size:15px;margin:18px 0 6px;font-weight:700}
.informe h4{font-size:14px;margin:14px 0 4px;font-weight:700}
.informe p{margin:8px 0}
.informe ul,.informe ol{margin:8px 0 8px 22px;padding:0}
.informe li{margin:3px 0}
.informe hr{border:0;border-top:1px solid #ccc;margin:18px 0}
.informe blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid #c9a24b;background:rgba(201,162,75,.10);border-radius:4px}
.informe code{background:rgba(128,128,128,.18);padding:1px 5px;border-radius:4px;font-size:12.5px}
.informe .tw{overflow-x:auto;margin:12px 0}
.informe table{border-collapse:collapse;width:100%;font-size:13px}
.informe th{background:rgba(201,162,75,.22);text-align:left;font-weight:700}
.informe th,.informe td{border:1px solid rgba(128,128,128,.4);padding:6px 9px;vertical-align:top}
`

// Exporta a PDF usando el diálogo de impresión del navegador ("Guardar como PDF").
// Se usa un iframe oculto para que no lo bloquee el bloqueador de ventanas emergentes.
export function exportarInformePDF({ titulo, subtitulo, markdown }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page{size:A4;margin:16mm}
body{margin:0;color:#111;background:#fff}
${ESTILO_INFORME}
.cab{border-bottom:3px solid #c9a24b;margin-bottom:18px;padding-bottom:10px}
.cab .marca{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a6d1f;font-weight:700}
.cab h1{margin:6px 0 2px}
.cab .sub{font-size:12px;color:#555}
.informe h2,.informe h3{break-after:avoid}
.informe table,.informe blockquote{break-inside:avoid}
</style></head><body>
<div class="cab"><div class="marca">Divine Desire · Informe interno</div><h1>${esc(titulo)}</h1><div class="sub">${esc(subtitulo)}</div></div>
<div class="informe">${mdToHtml(markdown)}</div></body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const w = f.contentWindow
  w.document.open(); w.document.write(html); w.document.close()
  const lanzar = () => { try { w.focus(); w.print() } catch (e) { /* nada */ } setTimeout(() => f.remove(), 60000) }
  setTimeout(lanzar, 350)
}
