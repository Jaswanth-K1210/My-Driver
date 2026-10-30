import { reactErrorHandler } from './lib/sentry.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@root'
import './index.css'

createRoot(document.getElementById('root'), {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
