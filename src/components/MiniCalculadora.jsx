import { useEffect, useRef, useState } from 'react'

// Evaluador seguro (sin eval): + − × ÷ ( ) %, decimales y menos unario. «20%» = 0,2 ; «200+10%» = 220.
function evaluar(src) {
  const s = String(src || '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '')
  if (!s) return null
  let i = 0
  const peek = () => s[i]
  function numero() {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i))
    if (!m) throw new Error('x')
    i += m[0].length
    return parseFloat(m[0])
  }
  // atomo devuelve [valor, llevaPorcentaje]
  function atomo() {
    let v
    if (peek() === '(') { i++; v = suma(); if (peek() !== ')') throw new Error('x'); i++ } else if (peek() === '-') { i++; v = -atomo()[0] } else if (peek() === '+') { i++; v = atomo()[0] } else v = numero()
    let pct = false
    while (peek() === '%') { i++; v /= 100; pct = true }
    return [v, pct]
  }
  function producto() {
    let [v, pct] = atomo()
    let simple = true
    while (peek() === '*' || peek() === '/') {
      simple = false
      const op = s[i++]
      const [r] = atomo()
      v = op === '*' ? v * r : v / r
    }
    return [v, simple && pct]
  }
  function suma() {
    let [v] = producto()
    while (peek() === '+' || peek() === '-') {
      const op = s[i++]
      const [r, esPct] = producto()
      const d = esPct ? v * r : r // «200+10%» = 200 + el 10 % de 200
      v = op === '+' ? v + d : v - d
    }
    return v
  }
  try {
    const v = suma()
    if (i !== s.length || !Number.isFinite(v)) return null
    return Math.round(v * 1e8) / 1e8
  } catch (e) { return null }
}
const fmt = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

const TECLAS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['(', '0', ',', ')'],
]

// Calculadora integrada (desplegable dentro del reporte). onUsar(número) lo vuelca en el importe de la compra que se está añadiendo.
export default function MiniCalculadora({ onUsar }) {
  const [abierta, setAbierta] = useState(false)
  const [expr, setExpr] = useState('')
  const [hist, setHist] = useState([])
  const [copiado, setCopiado] = useState(false)
  const ref = useRef(null)
  const res = evaluar(expr)

  useEffect(() => { if (abierta) ref.current?.focus() }, [abierta])

  function tecla(t) {
    if (t === 'C') return setExpr('')
    if (t === '⌫') return setExpr((e) => e.slice(0, -1))
    setExpr((e) => e + t)
  }
  function igual() {
    if (res === null) return
    setHist((h) => [{ e: expr, r: res }, ...h].slice(0, 5))
    setExpr(String(res).replace('.', ','))
  }
  async function copiar() {
    if (res === null) return
    try { await navigator.clipboard.writeText(String(res)); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch (e) { /* sin portapapeles */ }
  }
  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); igual() }
    if (e.key === 'Escape') setAbierta(false)
  }

  return (
    <div className="mb-3">
      <button
        type="button" onClick={() => setAbierta((x) => !x)} aria-expanded={abierta}
        className="text-sm px-3 py-1.5 rounded-md inline-flex items-center gap-2"
        style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >🧮 Calculadora <span style={{ color: 'var(--text-muted)' }}>{abierta ? '▲' : '▼'}</span></button>
      {abierta && (
        <div className="mt-2 rounded-xl p-3" style={{ maxWidth: 300, background: 'var(--panel)', border: '1px solid var(--border)' }} role="group" aria-label="Calculadora">
          <input
            ref={ref} value={expr} onChange={(e) => setExpr(e.target.value.replace(/[^0-9+\-*/().,%×÷−]/g, ''))} onKeyDown={onKey}
            inputMode="decimal" placeholder="0" aria-label="Operación"
            className="w-full rounded-md px-3 py-2 text-right text-lg tabular-nums mb-1"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="text-right text-sm tabular-nums mb-2 min-h-[22px]" style={{ color: res === null ? 'var(--text-muted)' : 'var(--success)' }}>
            {expr ? (res === null ? '…' : '= ' + fmt(res)) : ''}
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {TECLAS.flat().map((t) => (
              <button
                key={t} type="button" onClick={() => tecla(t)}
                className="rounded-md py-2 text-sm font-medium"
                style={{ background: /[÷×−+]/.test(t) ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)', color: t === 'C' ? 'var(--danger)' : 'var(--text)' }}
              >{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={igual} className="rounded-md py-2 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#000' }}>= Calcular</button>
            <button type="button" onClick={copiar} disabled={res === null} className="rounded-md py-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', opacity: res === null ? 0.5 : 1 }}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
          </div>
          {onUsar && (
            <button type="button" disabled={res === null || res <= 0} onClick={() => onUsar(res)} className="mt-1.5 w-full rounded-md py-2 text-sm" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text)', opacity: res === null || res <= 0 ? 0.5 : 1 }}>Usar como importe de la compra</button>
          )}
          {hist.length > 0 && (
            <div className="mt-2 pt-2 text-xs space-y-0.5" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {hist.map((h, i) => (
                <button key={i} type="button" onClick={() => setExpr(String(h.r).replace('.', ','))} className="flex w-full justify-between hover:underline">
                  <span className="truncate mr-2">{h.e}</span><span className="tabular-nums">= {fmt(h.r)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
