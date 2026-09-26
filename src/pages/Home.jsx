import { useAuth } from '../context/AuthContext'
import Dashboard from './Dashboard'
import ModelPortal from './ModelPortal'

export default function Home() {
  const { roles } = useAuth()
  const soloModelo = roles.length > 0 && roles.every((r) => r === 'modelo')
  return soloModelo ? <ModelPortal /> : <Dashboard />
}
