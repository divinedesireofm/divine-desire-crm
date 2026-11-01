// Números con el mismo formato que Infloww: la coma separa los miles y el punto los decimales (2,188.24).
// También entiende «12,5» (coma decimal) y «2.188,24» (formato europeo) para no equivocarse al pegar.
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = String(v ?? '').trim().replace(/[$€£\s]/g, '')
  if (!t || t === '-' || t === '.' || t === ',') return 0
  const neg = t.startsWith('-'); if (neg) t = t.slice(1)
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? (neg ? -n : n) : 0
}
// 2188.24 -> «2,188.24»
export const fmtNum = (v, dec = 2) => num(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
