import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { AuthGate } from './features/auth/AuthGate'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
