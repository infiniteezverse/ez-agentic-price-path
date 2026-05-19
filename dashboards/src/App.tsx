import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import OperatorDashboard from './pages/OperatorDashboard'
import AgentDashboard from './pages/AgentDashboard'
import NotFound from './pages/NotFound'
import { useAdminKey, usePayerAddress } from './hooks/useAuthToken'

function ProtectedAdminRoute() {
  const { token } = useAdminKey()
  return token ? <OperatorDashboard /> : <Navigate to="/login" replace />
}

function ProtectedAgentRoute() {
  const { token } = usePayerAddress()
  return token ? <AgentDashboard /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/agent" element={<ProtectedAgentRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
