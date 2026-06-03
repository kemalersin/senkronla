import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { ensurePrismLanguages } from './prism-setup.ts'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

void ensurePrismLanguages().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
