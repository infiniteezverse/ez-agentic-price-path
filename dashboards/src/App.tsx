import { Routes, Route, Navigate } from 'react-router-dom'
import OperatorDashboard from './pages/OperatorDashboard'
import AgentDashboard from './pages/AgentDashboard'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/operator" replace />} />
      <Route path="/operator" element={<OperatorDashboard />} />
      <Route path="/agent" element={<AgentDashboard />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
