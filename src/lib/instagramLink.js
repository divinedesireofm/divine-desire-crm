// Enlace de una cuenta de Instagram a partir de su nombre de usuario: así nadie tiene que escribir enlaces a mano.
// Acepta «@usuario», «usuario» o incluso un enlace completo ya pegado.
export function usuarioIG(valor) {
  let u = String(valor || '').trim()
  if (!u) return ''
  const m = u.match(/instagram\.com\/([^/?#\s]+)/i)
  if (m) u = m[1]
  return u.replace(/^@+/, '').replace(/\/+$/, '').trim()
}
export function urlInstagram(valor) {
  const u = usuarioIG(valor)
  return u ? `https://www.instagram.com/${u}/` : ''
}
