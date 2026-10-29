import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Panel, PageHeader } from '../components/ui'
import Dashboard from './Dashboard'
import ModelPortal from './ModelPortal'

const ROLES_REDDIT = ['reddit_manager', 'reddit_assistant']

export default function Home() {
  const { roles, profile } = useAuth()
  const soloModelo = roles.length > 0 && roles.every((r) => r === 'modelo')
  // El personal de Reddit solo trabaja en su departamento: su inicio son sus dos apartados
  const soloReddit = roles.length > 0 && roles.every((r) => ROLES_REDDIT.includes(r))
  if (soloReddit) {
    return (
      <div>
        <PageHeader title={`Hola${profile?.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}`} subtitle="Departamento de Reddit" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <Link to="/reddit/reportes"><Panel className="p-5 hover:opacity-90"><p className="font-medium mb-1">Reportes del día →</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Apunta el estado de la cuenta con la que has operado.</p></Panel></Link>
          <Link to="/reddit/cuentas"><Panel className="p-5 hover:opacity-90"><p className="font-medium mb-1">Cuentas de Reddit →</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Consulta las cuentas, su modelo y su estado.</p></Panel></Link>
        </div>
      </div>
    )
  }
  return soloModelo ? <ModelPortal /> : <Dashboard />
}
