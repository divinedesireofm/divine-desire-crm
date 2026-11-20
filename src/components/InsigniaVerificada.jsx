// Check azul de «cuenta verificada» al estilo Instagram: sello con puntas y check blanco.
export default function InsigniaVerificada({ size = 15, className = '' }) {
  return (
    <svg data-verificada viewBox="0 0 40 40" width={size} height={size} role="img" aria-label="Cuenta verificada" className={className} style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0 }}>
      <title>Cuenta verificada</title>
      <path fill="#0095F6" d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" />
      <path fill="#fff" d="M17.4 27.3 10.7 20.6l2.4-2.4 4.3 4.3 9.5-9.5 2.4 2.4-11.9 11.9Z" />
    </svg>
  )
}
