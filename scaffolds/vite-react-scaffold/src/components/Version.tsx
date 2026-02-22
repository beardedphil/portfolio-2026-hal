import { useEffect, useState } from 'react'

interface VersionData {
  commitSha: string
  buildTimestamp: string
  environment: string
  appName: string
}

export function Version() {
  const [versionData, setVersionData] = useState<VersionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/version.json')
      .then(res => res.json())
      .then((data: VersionData) => {
        setVersionData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load version data:', err)
        setVersionData({
          commitSha: 'unknown',
          buildTimestamp: new Date().toISOString(),
          environment: import.meta.env.MODE || 'development',
          appName: import.meta.env.VITE_APP_NAME || 'Vite + React App',
        })
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <section className="version-section">
        <h2>Version</h2>
        <p>Loading version information...</p>
      </section>
    )
  }

  if (!versionData) {
    return null
  }

  return (
    <section className="version-section">
      <h2>Version</h2>
      <div className="version-info">
        <div className="version-item">
          <span className="version-label">App Name:</span>
          <span className="version-value">{versionData.appName}</span>
        </div>
        <div className="version-item">
          <span className="version-label">Environment:</span>
          <span className="version-value">{versionData.environment}</span>
        </div>
        <div className="version-item">
          <span className="version-label">Git Commit:</span>
          <span className="version-value">
            {versionData.commitSha.substring(0, 7)}
          </span>
        </div>
        <div className="version-item">
          <span className="version-label">Build Timestamp:</span>
          <span className="version-value">
            {new Date(versionData.buildTimestamp).toLocaleString()}
          </span>
        </div>
      </div>
    </section>
  )
}
