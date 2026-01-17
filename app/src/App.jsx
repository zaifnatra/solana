import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [session, setSession] = useState(null)

  // Check Supabase connection
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Supabase connection error:', error)
      } else {
        console.log('Supabase Connected! Session:', data.session)
        setSession(data.session)
      }
    })
  }, [])

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>

      {/* Supabase Connection Status */}
      <div style={{ padding: '10px', margin: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h3>Database Connection Status:</h3>
        <p>{session === null ? '🔴 Not Connected / No Session' : '🟢 Connected!'}</p>
        <p style={{ fontSize: '0.8em', color: '#666' }}>Check console for details</p>
      </div>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
