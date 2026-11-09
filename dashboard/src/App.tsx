import { MotionConfig } from 'framer-motion'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Audit } from './pages/Audit'
import { Collaboration } from './pages/Collaboration'
import { Overview } from './pages/Overview'
import { Tokens } from './pages/Tokens'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="collaboration" element={<Collaboration />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Routes>
    </MotionConfig>
  )
}
