import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Models from './pages/Models'
import InstagramAccounts from './pages/InstagramAccounts'
import WeeklyMetrics from './pages/WeeklyMetrics'
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
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="modelos" element={<Models />} />
        <Route path="metricas" element={<WeeklyMetrics />} />
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
