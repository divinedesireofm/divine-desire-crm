// Tabla con las barras de desplazamiento normales (vertical y horizontal, como cualquier tabla).
// El encabezado se queda fijo al bajar.
export default function TablaScroll({ children, altura = '70vh' }) {
  return (
    <div>
      <div className="tabla-scroll overflow-auto" style={{ maxHeight: altura }}>
        {children}
      </div>
      <style>{`
        .tabla-scroll thead th{position:sticky;top:0;background:var(--panel);z-index:1}
        .tabla-scroll{scrollbar-width:auto;scrollbar-color:var(--text-muted) var(--panel-alt)}
        .tabla-scroll::-webkit-scrollbar{width:12px;height:12px}
        .tabla-scroll::-webkit-scrollbar-track{background:var(--panel-alt)}
        .tabla-scroll::-webkit-scrollbar-thumb{background:var(--text-muted);border-radius:6px;border:2px solid var(--panel-alt)}
        .tabla-scroll::-webkit-scrollbar-thumb:hover{background:var(--accent)}
      `}</style>
    </div>
  )
}
