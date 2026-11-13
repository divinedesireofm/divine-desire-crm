import { useEffect, useRef, useState } from 'react'
import { reunirHojas, exportarExcel, exportarWord, exportarPdf } from '../lib/exportarCuentasIG'

// Botón «Exportar»: Excel, Word o PDF con General y cada subapartado como una hoja del mismo documento
const FORMATOS = [
  { id: 'excel', etiqueta: 'Excel (.xlsx)', icono: '📊', fn: exportarExcel },
  { id: 'word', etiqueta: 'Word (.docx)', icono: '📝', fn: exportarWord },
  { id: 'pdf', etiqueta: 'PDF (.pdf)', icono: '📄', fn: exportarPdf },
]

export default function ExportarCuentasIG({ accounts, seguidores, models, verPass, ver2fa, incluirSecciones }) {
  const [abierto, setAbierto] = useState(false)
  const [haciendo, setHaciendo] = useState(null)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  async function exportar(f) {
    setHaciendo(f.id); setError(null); setAbierto(false)
    try {
      const hojas = await reunirHojas({ accounts, seguidores, models, verPass, ver2fa, incluirSecciones })
      await f.fn(hojas)
    } catch (e) {
      setError('No se pudo exportar: ' + (e?.message || e))
    }
    setHaciendo(null)
  }

  const btn = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div ref={ref} style={{ position: 'relative' }} data-exportar-ig>
      <button type="button" disabled={!!haciendo} onClick={() => setAbierto((v) => !v)} className="px-3 py-1.5 rounded-full text-sm disabled:opacity-60" style={btn} aria-haspopup="menu" aria-expanded={abierto}>
        {haciendo ? `⏳ Preparando ${FORMATOS.find((f) => f.id === haciendo).etiqueta.split(' ')[0]}…` : '⬇ Exportar'}
      </button>
      {abierto && (
        <div role="menu" className="rounded-md overflow-hidden" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 40, minWidth: 220, background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            {incluirSecciones ? 'General + cada apartado, una hoja por apartado' : 'Cuadro General'}
          </p>
          {FORMATOS.map((f) => (
            <button key={f.id} type="button" role="menuitem" onClick={() => exportar(f)} className="w-full text-left px-3 py-2 text-sm hover:opacity-80" style={{ background: 'transparent', color: 'var(--text)' }}>
              {f.icono} {f.etiqueta}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)', position: 'absolute', right: 0, top: '100%', whiteSpace: 'nowrap' }}>{error}</p>}
    </div>
  )
}
