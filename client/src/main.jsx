import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MapLoading from './MapLoading.jsx'

const FireMap = lazy(() => import('./App.jsx'))
const Landing = lazy(() => import('./Landing.jsx'))
const isMap = /^\/map\/?$/.test(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isMap ? (
      <Suspense fallback={<MapLoading />}>
        <FireMap />
      </Suspense>
    ) : (
      <Suspense>
        <Landing />
      </Suspense>
    )}
  </StrictMode>,
)
