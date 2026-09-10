import { useState } from 'react'
import { fmtMoney } from '../lib/pagos'

export default function MultiMonto({ items, onChange, montoKey = 'monto', unidad }) {
  const [v, setV] = useState('')
  const [n, setN] = useState('')

  function add() {
    const num = parseFloat(v)
    if (isNaN(num)) return
    onChange((items || []).concat([{ [montoKey]: num, nota: n.trim() }]))
    setV(''); setN('')
  }
  function del(i) {
    onChange((items || []).filter((_, j) => j !== i))
  }
  function onKey(e) { if (e.key === 'Enter') add() }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(items || []).length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
        {(items || []).map((it, i) => (
          <span
            key={i}
            onClick={() => del(i)}
            title="Clic para quitar"
            className="px-2 py-1 rounded-full text-xs cursor-pointer"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {fmtMoney(it[montoKey])}{it.nota ? ` · ${it.nota}` : ''} ✕
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKey}
          placeholder={unidad || '$'}
          className="w-24 px-2 py-1 rounded-md text-xs outline-none"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <input
          value={n} onChange={(e) => setN(e.target.value)} onKeyDown={onKey}
          placeholder="nota"
          className="flex-1 px-2 py-1 rounded-md text-xs outline-none"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <button onClick={add} className="px-2 py-1 rounded-md text-xs" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>+</button>
      </div>
    </div>
  )
}
