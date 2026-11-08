import { useEffect, useState } from 'react'
import ConfigurationPanel from './components/ConfigurationPanel'
import AnalysisWorkspace from './components/AnalysisWorkspace'
import Icon from './components/Icon'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const DEFAULT_GAINS = { Kp: 15, Ki: 0.5, Kd: 2 }
const DEFAULT_SIMULATION_CONFIG = {
  dt: 0.01,
  max_time: 5,
  target: 0,
  min_control: -10,
  max_control: 10,
}

async function readJsonResponse(response) {
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = json?.detail
    const errorMessage = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `HTTP ${response.status}`
    throw new Error(errorMessage)
  }
  if (!json || typeof json !== 'object') throw new Error('The API did not return a valid JSON object.')
  return json
}

function checkNumbers(schema, gains, config) {
  if (!schema || !Object.keys(schema).length) return 'Controller parameter schema is not available.'
  for (const [name, bounds] of Object.entries(schema)) {
    const value = gains[name]
    if (value === '' || !Number.isFinite(value)) return `Enter a valid number for ${name}.`
    if (value < bounds.min || value > bounds.max) return `${name} must be between ${bounds.min} and ${bounds.max}.`
  }
  for (const [name, value] of Object.entries(config)) {
    if (value === '' || !Number.isFinite(value)) return `Enter a valid number for ${name.replaceAll('_', ' ')}.`
  }
  if (config.dt <= 0 || config.max_time <= 0) return 'Time step and duration must be greater than zero.'
  if (config.max_time / config.dt > 20000) return 'Too many simulation steps. Increase dt or reduce duration (maximum 20,000).'
  if (config.min_control >= config.max_control) return 'Minimum control must be less than maximum control.'
  return ''
}

export default function App() {
  const [file, setFile] = useState(null)
  const [system, setSystem] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [controllerType, setControllerType] = useState('PID')
  const [schema, setSchema] = useState(null)
  const [gains, setGains] = useState({})
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  const [simulationConfig, setSimulationConfig] = useState(DEFAULT_SIMULATION_CONFIG)
  const [simulating, setSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [result, setResult] = useState(null)
  const [runSnapshot, setRunSnapshot] = useState(null)

  useEffect(() => {
    setSchema(null)
    setGains({})
    setResult(null)
    setRunSnapshot(null)
    setSchemaError('')
    setSchemaLoading(false)
    if (!system) return

    const controller = new AbortController()
    async function loadSchema() {
      setSchemaLoading(true)
      try {
        const response = await fetch(
          `${API_URL}/api/v1/systems/${encodeURIComponent(system.system_id)}/schema?controller_type=${encodeURIComponent(controllerType)}`,
          { signal: controller.signal }
        )
        const data = await readJsonResponse(response)
        if (controller.signal.aborted) return
        const defaults = {}
        for (const [name, range] of Object.entries(data)) {
          const suggested = DEFAULT_GAINS[name] ?? 1
          defaults[name] = Math.max(range.min, Math.min(range.max, suggested))
        }
        setSchema(data)
        setGains(defaults)
      } catch (error) {
        if (error.name !== 'AbortError') setSchemaError(error.message || 'Failed to load controller schema.')
      } finally {
        if (!controller.signal.aborted) setSchemaLoading(false)
      }
    }
    loadSchema()
    return () => controller.abort()
  }, [system, controllerType])

  function handleFileSelected(nextFile) {
    setFile(nextFile)
    setSystem(null)
    setResult(null)
    setRunSnapshot(null)
    setControllerType('PID')
    setUploadError('')
    setSimulationError('')
    setValidationError('')
    setSimulationConfig({ ...DEFAULT_SIMULATION_CONFIG })
  }

  function handleControllerType(type) {
    setControllerType(type)
    setResult(null)
    setRunSnapshot(null)
    setSimulationError('')
    setValidationError('')
  }

  function handleGains(update) {
    setGains(update)
    setResult(null)
    setRunSnapshot(null)
    setSimulationError('')
    setValidationError('')
  }

  function handleConfig(update) {
    setSimulationConfig(update)
    setResult(null)
    setRunSnapshot(null)
    setSimulationError('')
    setValidationError('')
  }

  async function handleUpload() {
    if (!file || uploading || simulating) return
    if (!file.name.toLowerCase().endsWith('.py')) {
      setUploadError('Select a trusted Python (.py) file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('The backend accepts Python files up to 2 MB.')
      return
    }
    setUploading(true)
    setUploadError('')
    setSystem(null)
    setResult(null)
    setRunSnapshot(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`${API_URL}/api/v1/upload`, { method: 'POST', body: form })
      const data = await readJsonResponse(response)
      if (!data.system_id) throw new Error('System response is missing a system ID.')
      setSystem(data)
    } catch (error) {
      setUploadError(error.message || 'Could not load dynamics model.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSimulate() {
    if (!system || !schema || simulating || uploading || schemaLoading) return
    const invalid = checkNumbers(schema, gains, simulationConfig)
    setValidationError(invalid)
    if (invalid) return

    const snapshot = {
      controllerType,
      gains: Object.fromEntries(Object.keys(schema).map(name => [name, Number(gains[name])])),
      simulationConfig: Object.fromEntries(Object.entries(simulationConfig).map(([key, value]) => [key, Number(value)])),
    }
    setResult(null)
    setRunSnapshot(snapshot)
    setSimulationError('')
    setSimulating(true)
    try {
      const response = await fetch(`${API_URL}/api/v1/systems/${encodeURIComponent(system.system_id)}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          controller_type: snapshot.controllerType,
          params: snapshot.gains,
          system_config: snapshot.simulationConfig,
        }),
      })
      const data = await readJsonResponse(response)
      if (!Array.isArray(data.time_points)) throw new Error('Simulation response is missing its time_points array.')
      setResult(data)
    } catch (error) {
      setSimulationError(error.message || 'Simulation request failed.')
      setRunSnapshot(null)
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="ct-app">
      <header className="ct-topbar">
        <div className="ct-brand-area">
          <div className="ct-logo"><Icon name="activity" size={23}/></div>
          <div className="ct-brand"><strong>Controller Tuning Studio</strong><span>CONTROL ENGINEERING WORKSPACE</span></div>
          <span className="ct-header-divider"/>
          <span className="ct-topbar-category">Manual controller simulation</span>
        </div>
        <div className="ct-topbar-right"><span className="ct-header-online-dot"/> MANUAL SIMULATION <span className="ct-version-chip">UI REDESIGN</span></div>
      </header>
      <div className="ct-layout">
        <ConfigurationPanel
          file={file} setFile={handleFileSelected} system={system} uploading={uploading} uploadError={uploadError} onUpload={handleUpload}
          controllerType={controllerType} setControllerType={handleControllerType} schema={schema} schemaLoading={schemaLoading} schemaError={schemaError}
          gains={gains} setGains={handleGains} simulationConfig={simulationConfig} setSimulationConfig={handleConfig}
          simulating={simulating} onSimulate={handleSimulate} validationError={validationError}
        />
        <AnalysisWorkspace
          system={system} controllerType={controllerType} schemaLoading={schemaLoading} uploading={uploading} simulating={simulating}
          result={result} simulationError={simulationError} gains={gains} simulationConfig={simulationConfig} runSnapshot={runSnapshot}
        />
      </div>
      <footer className="ct-footer">Controller Tuning Studio · Manual simulation workspace · Core simulation engine unchanged</footer>
    </div>
  )
}
