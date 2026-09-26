import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Models from './pages/Models'
import InstagramAccounts from './pages/InstagramAccounts'
import WeeklyMetrics from './pages/WeeklyMetrics'
import ModelsComparison from './pages/ModelsComparison'
import Chatters from './pages/Chatters'
import Leads from './pages/Leads'
import Attendance from './pages/Attendance'
import ShiftReports from './pages/ShiftReports'
import Schedules from './pages/Schedules'
import Payments from './pages/Payments'
import Sanctions from './pages/Sanctions'
import Packs from './pages/Packs'
import Scripts from './pages/Scripts'
import Prices from './pages/Prices'
import Activation from './pages/Activation'
import Team from './pages/Team'
import Activity from './pages/Activity'
import Announcements from './pages/Announcements'
import Training from './pages/Training'
import AiSettings from './pages/AiSettings'
import Assistant from './pages/Assistant'
import DirectionTodos from './pages/DirectionTodos'
import ImportantDates from './pages/ImportantDates'
import ContentAssignments from './pages/ContentAssignments'
import ModelRequests from './pages/ModelRequests'
import Resources from './pages/Resources'
import ChatterMetrics from './pages/ChatterMetrics'
import Requests from './pages/Requests'
import Massives from './pages/Massives'
import SetPassword from './pages/SetPassword'

function Protected({ children }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        Cargando…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { session } = useAuth()

  // Si el enlace del email trae un token de invitación o recuperación (Supabase lo añade
  // siempre en el "hash" de la URL), forzamos la pantalla de crear/restablecer contraseña
  // sin importar a qué página haya caído — así funciona aunque la lista de "Redirect URLs"
  // de Supabase no tenga registrada exactamente esta ruta y haya caído en la raíz del sitio.
  const hash = window.location.hash
  const esEnlaceDeContrasena = hash.includes('type=invite') || hash.includes('type=recovery')
  if (esEnlaceDeContrasena) {
    return (
      <Routes>
        <Route path="*" element={<SetPassword />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/restablecer-contrasena" element={<SetPassword />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="modelos" element={<Models />} />
        <Route path="metricas" element={<WeeklyMetrics />} />
        <Route path="comparativa" element={<ModelsComparison />} />
        <Route path="chatters" element={<Chatters />} />
        <Route path="instagram" element={<InstagramAccounts />} />
        <Route path="leads" element={<Leads />} />
        <Route path="asistencia" element={<Attendance />} />
        <Route path="reportes-turno" element={<ShiftReports />} />
        <Route path="horarios" element={<Schedules />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="sanciones" element={<Sanctions />} />
        <Route path="packs" element={<Packs />} />
        <Route path="scripts" element={<Scripts />} />
        <Route path="precios" element={<Prices />} />
        <Route path="activacion" element={<Activation />} />
        <Route path="equipo" element={<Team />} />
        <Route path="historial" element={<Activity />} />
        <Route path="anuncios" element={<Announcements />} />
        <Route path="formacion" element={<Training />} />
        <Route path="voz-marca" element={<AiSettings />} />
        <Route path="asistente" element={<Assistant />} />
        <Route path="tareas" element={<DirectionTodos />} />
        <Route path="fechas" element={<ImportantDates />} />
        <Route path="contenido" element={<ContentAssignments />} />
        <Route path="solicitudes-modelos" element={<ModelRequests />} />
        <Route path="recursos" element={<Resources />} />
        <Route path="metricas-chatters" element={<ChatterMetrics />} />
        <Route path="solicitudes" element={<Requests />} />
        <Route path="masivos" element={<Massives />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
