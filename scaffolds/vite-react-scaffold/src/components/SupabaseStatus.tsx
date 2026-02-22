import { useEffect, useState } from 'react'

interface SupabaseConfig {
  url: string | undefined
  anonKey: string | undefined
}

export function SupabaseStatus() {
  const [config, setConfig] = useState<SupabaseConfig>({
    url: undefined,
    anonKey: undefined,
  })
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    setConfig({ url, anonKey })
    setChecked(true)
  }, [])

  if (!checked) {
    return (
      <section className="supabase-status">
        <h2>Supabase Configuration</h2>
        <p>Checking configuration...</p>
      </section>
    )
  }

  const isConfigured = config.url && config.anonKey
  const missingVars: string[] = []
  if (!config.url) missingVars.push('VITE_SUPABASE_URL')
  if (!config.anonKey) missingVars.push('VITE_SUPABASE_ANON_KEY')

  return (
    <section className={`supabase-status ${isConfigured ? 'success' : 'error'}`}>
      <h2>Supabase Configuration</h2>
      {isConfigured ? (
        <div className="supabase-message success">
          <p>✓ Supabase is configured correctly.</p>
          <p style={{ fontSize: '0.9em', marginTop: '0.5rem', opacity: 0.8 }}>
            URL: {config.url?.substring(0, 30)}...
          </p>
        </div>
      ) : (
        <div className="supabase-message error">
          <p>
            <strong>Supabase environment variables are missing:</strong>
          </p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            {missingVars.map(varName => (
              <li key={varName}>
                <code>{varName}</code>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: '1rem', fontSize: '0.9em' }}>
            To configure Supabase:
          </p>
          <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', fontSize: '0.9em' }}>
            <li>Create a <code>.env</code> file in the project root</li>
            <li>Add your Supabase URL and anon key:
              <pre style={{ 
                marginTop: '0.5rem', 
                padding: '0.5rem', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '4px',
                fontSize: '0.85em',
                overflow: 'auto'
              }}>
{`VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}
              </pre>
            </li>
            <li>Restart the development server</li>
          </ol>
          <p style={{ marginTop: '1rem', fontSize: '0.9em', opacity: 0.8 }}>
            The app will continue to work without Supabase, but Supabase features will not be available.
          </p>
        </div>
      )}
    </section>
  )
}
