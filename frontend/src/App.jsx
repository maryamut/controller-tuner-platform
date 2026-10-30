
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const DEFAULT_GAINS = {
  Kp: 15,
  Ki: 0.5,
  Kd: 2,
}

const CONTROLLERS = ['P', 'PI', 'PD', 'PID', 'FSF']

function App() {
  const [file, setFile] = useState(null)
  const [system, setSystem] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [controllerType, setControllerType] = useState('PID')
  const [schema, setSchema] = useState(null)
  const [gains, setGains] = useState({})
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  const [simulating, setSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    setSchema(null)
    setGains({})
    setResult(null)

    if (!system) return

    const controller = new AbortController()

    async function loadSchema() {
      setSchemaLoading(true)
      setSchemaError('')

      try {
        const response = await fetch(
          `${API_URL}/api/v1/systems/${system.system_id}/schema?controller_type=${controllerType}`,
          { signal: controller.signal }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            typeof data.detail === 'string'
              ? data.detail
              : 'Failed to load schema'
          )
        }

        if (controller.signal.aborted) return

        const initialGains = {}

        Object.entries(data).forEach(([name, range]) => {
          const value = DEFAULT_GAINS[name] ?? 1
          initialGains[name] = Math.max(
            range.min,
            Math.min(range.max, value)
          )
        })

        setSchema(data)
        setGains(initialGains)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSchemaError(err.message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setSchemaLoading(false)
        }
      }
    }

    loadSchema()
    return () => controller.abort()
  }, [system, controllerType])

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setUploadError('')
    setSystem(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/api/v1/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'Upload failed'
        )
      }

      setSystem(data)
    } catch (err) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSimulation() {
    if (!system || !schema || simulating) return

    setSimulating(true)
    setSimulationError('')
    setResult(null)

    try {
      const response = await fetch(
        `${API_URL}/api/v1/systems/${system.system_id}/simulate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            controller_type: controllerType,
            params: gains,
            system_config: {
              dt: 0.01,
              max_time: 5.0,
              target: 0.0,
              min_control: -10.0,
              max_control: 10.0,
            },
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'Simulation failed'
        )
      }

      if (!data.success || !Array.isArray(data.time_points)) {
        throw new Error('Invalid simulation response')
      }

      setResult(data)
    } catch (err) {
      setSimulationError(err.message || 'Simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  const chartData = result?.time_points?.map((time, index) => ({
    time,
    response: result.trajectory?.[index] ?? null,
    control: result.control_signals?.[index] ?? null,
  })) ?? []

  function formatMetric(value) {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'boolean') return value ? 'True' : 'False'
    if (typeof value === 'number') return value.toFixed(4)
    return String(value)
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl space-y-8">

        <header>
          <h1 className="text-4xl font-bold">
            Controller Tuner
          </h1>
          <p className="mt-3 text-slate-400">
            Dynamical System Simulation Platform
          </p>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            1. Upload Dynamics File
          </h2>

          <input
            type="file"
            accept=".py"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setSystem(null)
              setResult(null)
              setControllerType('PID')
              setUploadError('')
            }}
            className="mt-5 block w-full rounded-lg border border-slate-600 p-3"
          />

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-5 rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload System'}
          </button>

          {uploadError && (
            <p role="alert" className="mt-4 text-red-400">
              {uploadError}
            </p>
          )}

          {system && (
            <div className="mt-6 rounded-lg border border-emerald-700 bg-emerald-950 p-5">
              <p className="font-semibold text-emerald-400">
                System Initialized Successfully
              </p>
              <p className="mt-2">Name: {system.name}</p>
              <p>States: {system.num_states}</p>
              <p className="break-all text-sm text-slate-400">
                ID: {system.system_id}
              </p>
            </div>
          )}
        </section>

        {system && (
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              2. Controller Settings
            </h2>

            <label htmlFor="controller-type" className="mt-5 block text-sm text-slate-300">
              Controller Type
            </label>

            <select
              id="controller-type"
              value={controllerType}
              disabled={simulating}
              onChange={(event) => {
                setControllerType(event.target.value)
                setResult(null)
                setSimulationError('')
              }}
              className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
            >
              {CONTROLLERS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            {schemaLoading && (
              <p className="mt-4 text-blue-300">
                Loading parameters...
              </p>
            )}

            {schemaError && (
              <p role="alert" className="mt-4 text-red-400">
                {schemaError}
              </p>
            )}

            {schema && (
              <div className="mt-7 space-y-7">
                {Object.entries(schema).map(([name, range]) => (
                  <div key={name}>
                    <div className="flex justify-between">
                      <label htmlFor={`gain-${name}`} className="font-medium">
                        {name}
                      </label>
                      <span className="font-mono text-blue-400">
                        {gains[name]?.toFixed(2)}
                      </span>
                    </div>

                    <input
                      id={`gain-${name}`}
                      type="range"
                      min={range.min}
                      max={range.max}
                      step="0.01"
                      value={gains[name] ?? range.min}
                      disabled={simulating}
                      onChange={(event) => {
                        setGains((previous) => ({
                          ...previous,
                          [name]: Number(event.target.value),
                        }))
                        setResult(null)
                      }}
                      className="mt-3 w-full accent-blue-500"
                    />

                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{range.min}</span>
                      <span>{range.max}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSimulation}
              disabled={!schema || schemaLoading || simulating}
              className="mt-8 rounded-lg bg-emerald-600 px-7 py-3 font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {simulating ? 'Running Simulation...' : 'Run Simulation'}
            </button>

            {simulationError && (
              <p role="alert" className="mt-4 rounded-lg bg-red-950 p-4 text-red-300">
                {simulationError}
              </p>
            )}
          </section>
        )}

        {result && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold">
              3. Simulation Results
            </h2>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-5 text-lg font-semibold">
                System Response
              </h3>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <ReferenceLine y={0} stroke="#f59e0b" strokeDasharray="5 5" />
                    <Line
                      type="monotone"
                      dataKey="response"
                      stroke="#38bdf8"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-5 text-lg font-semibold">
                Control Input
              </h3>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="control"
                      stroke="#a78bfa"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  Performance Metrics
                </h3>

                <span className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  result.metrics?.stable
                    ? 'bg-emerald-900 text-emerald-300'
                    : 'bg-red-950 text-red-300'
                }`}>
                  {result.metrics?.stable ? 'Stable' : 'Unstable'}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(result.metrics ?? {}).map(([name, value]) => (
                  <div
                    key={name}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-4"
                  >
                    <p className="text-sm text-slate-400">
                      {name.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {formatMetric(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}

export default App
