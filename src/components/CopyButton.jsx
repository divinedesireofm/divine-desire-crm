import { useState } from 'react'
import { Button } from './ui'

export default function CopyButton({ text, label }) {
  const [ok, setOk] = useState(false)
  return (
    <Button
      variant="ghost"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setOk(true)
        setTimeout(() => setOk(false), 1300)
      }}
    >
      {ok ? '✓ Copiado' : (label || 'Copiar')}
    </Button>
  )
}
