import { useState } from 'react'
import './App.css'
import { Version } from './components/Version'
import { SupabaseStatus } from './components/SupabaseStatus'
import { useIdleReload } from './hooks/useIdleReload'

function App() {
  const [reloadKey, setReloadKey] = useState(0)
  useIdleReload(() => {
    setReloadKey(prev => prev + 1)
  })

  return (
    <div className="app" key={reloadKey}>
      <header className="app-header">
        <h1>Vite + React</h1>
      </header>
      <main className="app-main">
        <div className="app-content">
          <p>
            This is a scaffold template for creating new Vite + React projects.
          </p>
          <Version />
          <SupabaseStatus />
        </div>
      </main>
    </div>
  )
}

export default App
