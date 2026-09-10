// Fórmula de cálculo de pagos — réplica exacta del sistema del mentor
export function fmtMoney(n) {
  const x = parseFloat(n) || 0
  return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function sumArr(arr, k = 'monto') {
  return (arr || []).reduce((s, x) => s + (parseFloat(x[k]) || 0), 0)
}

// Construye, a partir de las ventas entre compañeros de un periodo, el delta neto por chatter
export function buildCompMap(comps) {
  const m = {}
  for (const c of comps || []) {
    const net = (parseFloat(c.monto_bruto) || 0) * 0.8 / 2
    m[c.vendedor_id] = (m[c.vendedor_id] || 0) + net
    m[c.dueno_id] = (m[c.dueno_id] || 0) - net
  }
  return m
}

// row: {facturacion, pct, sanciones[], metas_equipo[], metas_mensuales[], ventas_faltantes[], ventas_companeros}
// E: delta de ventas entre compañeros ya calculado (opcional, si no se pasa usa row.ventas_companeros)
export function calcPagoRow(row, E) {
  const C = parseFloat(row.facturacion) || 0
  const D = parseFloat(row.pct) || 0
  const Ev = (E !== undefined && E !== null) ? E : (parseFloat(row.ventas_companeros) || 0)
  const Jnet = sumArr(row.ventas_faltantes, 'bruto') * 0.8
  const F = sumArr(row.sanciones, 'monto')
  const G = sumArr(row.metas_equipo, 'monto')
  const H = sumArr(row.metas_mensuales, 'monto')
  const I = Math.floor(C / 1000) * 15
  const comision = D * (C + Ev + Jnet)
  const aPagar = comision + G + H + I - F
  return { C, D, E: Ev, Jnet, F, G, H, I, comision, aPagar }
}
