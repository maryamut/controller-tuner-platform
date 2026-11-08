import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Brush,
} from 'recharts'
import Icon from './Icon'

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'layers' },
  { key: 'response', label: 'System response', icon: 'activity' },
  { key: 'control', label: 'Control input', icon: 'chart' },
  { key: 'metrics', label: 'Performance metrics', icon: 'target' },
]

const LABELS = {
  mse: 'Mean squared error',
  settling_time: 'Settling time',
  overshoot: 'Overshoot',
  control_effort: 'Control effort',
  steady_state_error: 'Steady-state error',
  rise_time: 'Rise time',
  zero_crossings: 'Zero crossings',
  stable: 'Stability',
}

export function formatValue(value, digits = 4) {
  if (value == null) return 'N/A'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'N/A'
    if (Number.isInteger(value)) return value.toLocaleString('en-US')
    return Number(value.toPrecision(Math.max(2, digits))).toString()
  }
  return String(value)
}

function metricLabel(name) {
  return LABELS[name] || name.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function normalizePoint(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ChartPanel({ title, description, chartData, field, color, target, showBrush = false }) {
  const hasValues = chartData.some(point => point[field] !== null)
  return (
    <section className="ct-card ct-chart-card">
      <div className="ct-card-heading">
        <div><h3>{title}</h3><p>{description}</p></div>
        <span className="ct-chip">TIME SERIES</span>
      </div>
      {chartData.length > 0 && hasValues ? (
        <div className="ct-chart-body" role="img" aria-label={`${title} time series chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 14, right: 18, left: 0, bottom: showBrush ? 0 : 10 }}>
              <CartesianGrid stroke="#e9eef5" strokeDasharray="3 5" />
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tick={{fontSize: 11}} tickLine={false} axisLine={{stroke:'#d7e2f0'}} tickFormatter={v => formatValue(v, 3)} label={showBrush ? undefined : {value:'Time (s)',position:'insideBottom',offset:-6,fontSize:11,fill:'#7b8ba1'}} />
              <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false} width={55} tickFormatter={v => formatValue(v, 3)} domain={['auto','auto']}/>
              <Tooltip formatter={value => [formatValue(value, 6), field === 'response' ? 'System output' : 'Control input']} labelFormatter={v => `t = ${formatValue(v, 6)} s`} contentStyle={{fontSize:12,borderRadius:8,borderColor:'#dfe6ee'}} />
              <Legend verticalAlign="top" height={30} wrapperStyle={{fontSize:11}} />
              {typeof target === 'number' && Number.isFinite(target) && field === 'response' && <ReferenceLine y={target} stroke="#d29b36" strokeDasharray="5 5" label={{value:'Target',position:'insideTopRight',fill:'#a67826',fontSize:11}} />}
              <Line type="linear" dataKey={field} name={field === 'response' ? 'System output' : 'Control input'} stroke={color} strokeWidth={2.5} dot={chartData.length === 1 ? {r:3} : false} activeDot={{r:5}} connectNulls={false} isAnimationActive={false}/>
              {showBrush && chartData.length > 16 && <Brush dataKey="time" height={24} stroke="#8eb0e8" travellerWidth={8} tickFormatter={v => formatValue(v, 3)}/>}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="ct-chart-empty"><Icon name="chart" size={28}/><span>No numeric {field === 'response' ? 'response' : 'control'} samples returned.</span></div>
      )}
    </section>
  )
}

function MetricGrid({ metrics }) {
  const entries = Object.entries(metrics || {})
  return entries.length ? (
    <div className="ct-metric-grid">
      {entries.map(([key, val]) => (
        <div className="ct-metric-item" key={key}>
          <span>{metricLabel(key)}</span>
          <strong className={key === 'stable' ? val === true ? 'ct-text-success' : val === false ? 'ct-text-warning' : '' : ''}>{formatValue(val, 6)}</strong>
        </div>
      ))}
    </div>
  ) : <div className="ct-panel-empty">The API did not return performance metrics for this run.</div>
}

function StatusPill({ result, simulating, system, schemaLoading, uploading }) {
  let type = 'neutral', label = 'Awaiting system'
  if (uploading || schemaLoading) { type = 'working'; label = 'Loading configuration' }
  else if (simulating) { type = 'working'; label = 'Simulation running' }
  else if (result) { type = result.success ? 'success' : 'warning'; label = result.success ? 'Simulation complete' : 'Simulation reported an issue' }
  else if (system) { type = 'success'; label = 'Ready to simulate' }
  return <span className={`ct-phase ct-phase--${type}`}><span className="ct-phase-dot"/>{label}</span>
}

export default function AnalysisWorkspace({
  system, controllerType, schemaLoading, uploading, simulating, result, simulationError,
  gains, simulationConfig, runSnapshot,
}) {
  const [tab, setTab] = useState('overview')
  useEffect(() => { setTab('overview') }, [result, system?.system_id])

  const chartData = useMemo(() => {
    if (!Array.isArray(result?.time_points)) return []
    return result.time_points
      .map((time, index) => ({
        time: normalizePoint(time),
        response: normalizePoint(result.trajectory?.[index]),
        control: normalizePoint(result.control_signals?.[index]),
      }))
      .filter(p => p.time !== null)
  }, [result])

  const metrics = result?.metrics || {}
  const completed = result !== null
  const stability = typeof metrics.stable === 'boolean' ? metrics.stable : null
  const snapshot = runSnapshot || { controllerType, gains, simulationConfig }
  const exportBase = `${(system?.name || 'system').replace(/[^a-z0-9_-]/gi, '_')}_${snapshot.controllerType}_simulation`

  const exportJson = () => downloadFile(JSON.stringify({
    system: { name:system?.name, system_id:system?.system_id, num_states:system?.num_states },
    controller_type: snapshot.controllerType,
    params: snapshot.gains,
    system_config: snapshot.simulationConfig,
    result,
  }, null, 2), `${exportBase}.json`, 'application/json')

  const exportCsv = () => {
    const rows = ['time,response,control_input', ...chartData.map(d => [d.time, d.response ?? '', d.control ?? ''].join(','))]
    downloadFile(rows.join('\r\n'), `${exportBase}.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <main className="ct-workspace">
      <div className="ct-workspace-header">
        <div><div className="ct-eyebrow">CONTROL SYSTEM ANALYSIS</div><h1>{system ? system.name : 'Simulation Workspace'}</h1><p>{system ? `${controllerType} controller · ${system.num_states} state${system.num_states === 1 ? '' : 's'} · Single-run analysis` : 'Load a trusted dynamics model to begin a simulation.'}</p></div>
        <StatusPill system={system} result={result} simulating={simulating} schemaLoading={schemaLoading} uploading={uploading}/>
      </div>

      {simulationError && <div className="ct-alert ct-alert--error ct-wide-alert" role="alert"><Icon name="alert" size={18}/><span>{simulationError}</span></div>}

      {!system && !uploading && (
        <section className="ct-empty-state ct-card">
          <div className="ct-hero-icon"><Icon name="activity" size={34}/></div>
          <div className="ct-eyebrow">WORKSPACE INITIALIZATION</div>
          <h2>Analyze your closed-loop system</h2>
          <p>Load a Python dynamics definition, choose a controller, enter precise gain values, and simulate the response. Charts and performance metrics will appear in this workspace.</p>
          <div className="ct-process-steps">
            <div><b>01</b><strong>Load model</strong><span>Trusted .py dynamics</span></div>
            <div><b>02</b><strong>Configure controller</strong><span>P · PI · PD · PID · FSF</span></div>
            <div><b>03</b><strong>Simulate</strong><span>Response and input</span></div>
          </div>
        </section>
      )}

      {uploading && (
        <section className="ct-processing ct-card" role="status">
          <span className="ct-large-spinner"/><h2>Initializing your system</h2>
          <p>Loading the dynamics definition and detecting its state dimensions.</p>
        </section>
      )}

      {system && !completed && !simulating && (
        <section className="ct-ready-state ct-card">
          <div className="ct-hero-icon ct-hero-icon--green"><Icon name="checkCircle" size={32}/></div>
          <div className="ct-eyebrow">CONFIGURATION READY</div>
          <h2>{schemaLoading ? 'Loading controller parameters…' : 'Ready to run a simulation'}</h2>
          <p>{schemaLoading ? 'Retrieving the allowed gain ranges from the system schema.' : 'Use the configuration panel to set gains and simulation parameters. Run the simulation to view real system trajectories and metrics.'}</p>
          <div className="ct-process-steps">
            <div><b>01</b><strong>{system.name}</strong><span>System loaded</span></div>
            <div><b>02</b><strong>{controllerType}</strong><span>Selected controller</span></div>
            <div><b>03</b><strong>Run simulation</strong><span>Awaiting execution</span></div>
          </div>
        </section>
      )}

      {simulating && (
        <section className="ct-processing ct-card" role="status" aria-live="polite">
          <div className="ct-large-spinner"/>
          <div className="ct-eyebrow">SIMULATION IN PROGRESS</div>
          <h2>Evaluating the controller</h2>
          <p>The backend is computing the closed-loop trajectory and performance metrics. Results will appear when the API request completes.</p>
          <div className="ct-activity-track"><div/></div>
          <div className="ct-processing-caption"><Icon name="info" size={16}/> This is an activity indicator, not a measured progress percentage.</div>
        </section>
      )}

      {completed && !simulating && (
        <>
          <div className="ct-results-title">
            <div><div className="ct-eyebrow">SIMULATION RESULTS</div><h2>Run analysis</h2><p>Computed output for the selected dynamics and controller settings.</p></div>
            <div className="ct-results-actions"><button className="ct-btn ct-btn--outline" onClick={exportCsv}><Icon name="download" size={15}/> Export CSV</button><button className="ct-btn ct-btn--outline" onClick={exportJson}><Icon name="download" size={15}/> Export JSON</button></div>
          </div>
          <div className="ct-result-status">
            <span className={`ct-result-badge ${result.success ? 'is-good' : 'is-warning'}`}><Icon name={result.success ? 'checkCircle' : 'alert'} size={16}/>{result.success ? 'API simulation completed' : 'Backend reported unsuccessful simulation'}</span>
            {stability !== null && <span className={`ct-result-badge ${stability ? 'is-good' : 'is-warning'}`}><Icon name={stability ? 'checkCircle' : 'alert'} size={16}/>{stability ? 'Reported stable' : 'Reported unstable'}</span>}
          </div>
          <div className="ct-stat-grid">
            <div className="ct-stat"><span>Controller type</span><strong>{snapshot.controllerType}</strong><small>Manual gain configuration</small></div>
            <div className="ct-stat"><span>Mean square error</span><strong>{formatValue(metrics.mse, 6)}</strong><small>From backend metrics</small></div>
            <div className="ct-stat"><span>Settling time</span><strong>{formatValue(metrics.settling_time, 6)}</strong><small>Reported by simulator</small></div>
            <div className="ct-stat"><span>Samples</span><strong>{chartData.length}</strong><small>Numeric time points</small></div>
          </div>

          <div className="ct-tabs" role="tablist" aria-label="Simulation results sections">
            {TABS.map(item => (
              <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}><Icon name={item.icon} size={16}/>{item.label}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="ct-analysis-grid">
              <ChartPanel title="Closed-loop response" description="System output against elapsed time" chartData={chartData} field="response" color="#2a70e1" target={snapshot.simulationConfig?.target}/>
              <ChartPanel title="Control input" description="Applied control signal against elapsed time" chartData={chartData} field="control" color="#159f96"/>
              <section className="ct-card ct-analysis-full">
                <div className="ct-card-heading"><div><h3>Controller parameters</h3><p>Values used in this simulation</p></div><span className="ct-chip">{snapshot.controllerType}</span></div>
                <div className="ct-gain-list">{Object.entries(snapshot.gains || {}).map(([key,value]) => <div key={key}><span>{key}</span><strong>{formatValue(value, 6)}</strong></div>)}</div>
              </section>
            </div>
          )}
          {tab === 'response' && <ChartPanel title="Closed-loop system response" description="Detailed output trajectory · reference line indicates configured target" chartData={chartData} field="response" color="#2a70e1" target={snapshot.simulationConfig?.target} showBrush/>}
          {tab === 'control' && <ChartPanel title="Control effort over time" description="Applied control input. Model-specific units are not assumed." chartData={chartData} field="control" color="#159f96" showBrush/>}
          {tab === 'metrics' && <section className="ct-card"><div className="ct-card-heading"><div><h3>Performance metrics</h3><p>Reported by the existing simulation engine; no additional metrics are estimated by the UI.</p></div><span className="ct-chip">ENGINE OUTPUT</span></div><MetricGrid metrics={metrics}/></section>}
        </>
      )}
    </main>
  )
}
