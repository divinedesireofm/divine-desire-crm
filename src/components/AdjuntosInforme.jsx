import { useEffect, useRef, useState } from 'react'
import { MAX_IMG_POR_APARTADO, subirImagenInforme, urlImagenInforme, borrarImagenInforme } from '../lib/imagenesInforme'

function Miniatura({ img, editable, onQuitar }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let vivo = true; urlImagenInforme(img.path).then((u) => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [img.path])
  return (
    <div className="relative group" style={{ width: 84, height: 84 }}>
      <a href={url || undefined} target="_blank" rel="noopener noreferrer" title={`${img.nombre} (clic para ampliar)`}>
        {url
          ? <img src={url} alt={img.nombre} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <div style={{ width: 84, height: 84, borderRadius: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }} />}
      </a>
      {editable && <button type="button" onClick={onQuitar} title="Quitar imagen" className="absolute -top-2 -right-2 rounded-full text-xs leading-none" style={{ width: 20, height: 20, background: 'var(--danger)', color: '#fff' }}>×</button>}
    </div>
  )
}

// Imágenes adjuntas (opcionales) de UN apartado del informe
export default function AdjuntosInforme({ managerId, informeId, clave, imagenes = [], editable, onCambio }) {
  const ref = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [err, setErr] = useState('')

  async function elegir(e) {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    const hueco = MAX_IMG_POR_APARTADO - imagenes.length
    if (hueco <= 0) { setErr(`Máximo ${MAX_IMG_POR_APARTADO} imágenes por apartado.`); return }
    setErr(''); setSubiendo(true)
    const nuevas = []
    try {
      for (const f of files.slice(0, hueco)) nuevas.push(await subirImagenInforme({ managerId, informeId, clave, file: f }))
      if (files.length > hueco) setErr(`Solo caben ${MAX_IMG_POR_APARTADO} por apartado; se subieron ${hueco}.`)
    } catch (ex) { setErr(ex.message) }
    setSubiendo(false)
    if (nuevas.length) await onCambio([...imagenes, ...nuevas])
  }
  async function quitar(img) {
    if (!confirm('¿Quitar esta imagen?')) return
    await borrarImagenInforme(img.path)
    await onCambio(imagenes.filter((x) => x.path !== img.path))
  }

  if (!editable && imagenes.length === 0) return null
  return (
    <div className="mt-2">
      {imagenes.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {imagenes.map((img) => <Miniatura key={img.path} img={img} editable={editable} onQuitar={() => quitar(img)} />)}
        </div>
      )}
      {editable && (
        <>
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={elegir} />
          <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} className="text-xs underline" style={{ color: 'var(--accent)' }}>
            {subiendo ? 'Subiendo…' : `📎 Adjuntar imágenes (opcional)${imagenes.length ? ` · ${imagenes.length}/${MAX_IMG_POR_APARTADO}` : ''}`}
          </button>
          {err && <span className="text-xs ml-2" style={{ color: 'var(--danger)' }}>{err}</span>}
        </>
      )}
    </div>
  )
}
