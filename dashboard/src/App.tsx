import { MotionConfig } from 'framer-motion'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Collaboration } from './pages/Collaboration'
import { Overview } from './pages/Overview'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="collaboration" element={<Collaboration />} />
        </Route>
      </Routes>
    </MotionConfig>
  )
}
