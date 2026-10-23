import { useEffect, useRef, useState } from 'react'

// Tabla con dos barras de desplazamiento ARRIBA (horizontal ↔ y vertical ↕) además de las normales.
// El encabezado se queda fijo al bajar.
export default function TablaScroll({ children, altura = '70vh' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x: 0, y: 0, ox: false, oy: false })

  function medir() {
    const el = ref.current
    if (!el) return
    const mx = el.scrollWidth - el.clientWidth
    const my = el.scrollHeight - el.clientHeight
    setPos({ x: mx > 0 ? (el.scrollLeft / mx) * 100 : 0, y: my > 0 ? (el.scrollTop / my) * 100 : 0, ox: mx > 1, oy: my > 1 })
  }
  useEffect(() => {
    medir()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [children])

  const mover = (eje, v) => {
    const el = ref.current
    if (!el) return
    if (eje === 'x') el.scrollLeft = ((el.scrollWidth - el.clientWidth) * v) / 100
    else el.scrollTop = ((el.scrollHeight - el.clientHeight) * v) / 100
  }
  const lbl = { color: 'var(--text-muted)' }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <label className="flex items-center gap-2 text-xs flex-1 min-w-[180px]" style={{ ...lbl, opacity: pos.ox ? 1 : 0.4 }}>
          <span className="whitespace-nowrap">↔ Horizontal</span>
          <input type="range" min="0" max="100" step="0.5" value={pos.x} disabled={!pos.ox} aria-label="Desplazar horizontalmente"
            onChange={(e) => mover('x', Number(e.target.value))} className="flex-1" style={{ accentColor: 'var(--accent)' }} />
        </label>
        <label className="flex items-center gap-2 text-xs flex-1 min-w-[180px]" style={{ ...lbl, opacity: pos.oy ? 1 : 0.4 }}>
          <span className="whitespace-nowrap">↕ Vertical</span>
          <input type="range" min="0" max="100" step="0.5" value={pos.y} disabled={!pos.oy} aria-label="Desplazar verticalmente"
            onChange={(e) => mover('y', Number(e.target.value))} className="flex-1" style={{ accentColor: 'var(--accent)' }} />
        </label>
      </div>
      <div ref={ref} onScroll={medir} className="tabla-scroll overflow-auto" style={{ maxHeight: altura }}>
        {children}
      </div>
      <style>{`.tabla-scroll thead th{position:sticky;top:0;background:var(--panel);z-index:1}`}</style>
    </div>
  )
}
