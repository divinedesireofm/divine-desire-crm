import { useAuth } from '../context/AuthContext'
import MiPerfilModelo from './MiPerfilModelo'
import MiPerfilEquipo from './MiPerfilEquipo'

// «Mi perfil»: cada tipo de cuenta acotada ve el suyo
export default function MiPerfil() {
  const { roles } = useAuth()
  return roles.length > 0 && roles.every((r) => r === 'modelo') ? <MiPerfilModelo /> : <MiPerfilEquipo />
}
