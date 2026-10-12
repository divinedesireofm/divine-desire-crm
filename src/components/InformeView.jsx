import { mdToHtml, ESTILO_INFORME, exportarInformePDF } from '../lib/markdown'
import { Button } from './ui'

// Muestra un informe en Markdown con formato (títulos, tablas, listas) y botón de PDF.
export default function InformeView({ titulo, subtitulo, markdown, acciones }) {
  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4">
        <Button onClick={() => exportarInformePDF({ titulo, subtitulo, markdown })}>⬇ Exportar PDF</Button>
        {acciones}
      </div>
      <style>{ESTILO_INFORME}</style>
      <div className="informe" dangerouslySetInnerHTML={{ __html: mdToHtml(markdown) }} />
    </div>
  )
}
