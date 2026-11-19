import { useAuth } from '../context/AuthContext'
import IGPlans from './IGPlans'
import ReelsModelo from './ReelsModelo'

// Quien solo es asistente de Instagram ve las planificaciones con la interfaz sencilla (Por subir / Subidos);
// el resto del equipo (admin, ig_manager, planner) sigue con la pantalla completa para crearlas y gestionarlas.
export default function PlanificacionesRuta() {
  const { hasAnyRole } = useAuth()
  const soloAsistente = hasAnyRole(['ig_assistant']) && !hasAnyRole(['admin', 'ig_manager', 'planner'])
  return soloAsistente ? <ReelsModelo modo="asistente" /> : <IGPlans />
}
