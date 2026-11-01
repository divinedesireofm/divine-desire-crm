import { useRef } from 'react'
import { Input } from './ui'
import { fmtNum } from '../lib/numeros'

// Campo de dinero al estilo Infloww: escribes 2188.24 o 2,188.24 y al salir queda «2,188.24» (coma = miles, punto = decimales).
// Solo reformatea si has escrito tú en el campo (así no cambia valores automáticos con solo hacer clic).
export default function MoneyInput({ value, onChange, raw, className, style, ...rest }) {
  const tocado = useRef(false)
  const props = {
    type: 'text', inputMode: 'decimal', autoComplete: 'off', value: value ?? '', ...rest,
    onChange: (e) => { tocado.current = true; onChange({ target: { value: e.target.value.replace(/[^0-9.,-]/g, '') } }) },
    onBlur: () => { if (tocado.current && String(value ?? '').trim() !== '') { tocado.current = false; onChange({ target: { value: fmtNum(value) } }) } tocado.current = false },
  }
  return raw ? <input {...props} className={className} style={style} /> : <Input {...props} />
}
