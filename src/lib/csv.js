// Exporta un array de objetos a un .csv que Excel abre directamente
export function exportCSV(filename, rows, columns) {
  // columns: [{ key: 'nombre', label: 'Nombre' }, ...]
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(';')
  const body = rows.map((r) => columns.map((c) => escape(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';')).join('\n')
  const csv = '\uFEFF' + header + '\n' + body // BOM para que Excel reconozca los acentos
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
