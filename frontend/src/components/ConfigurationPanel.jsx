import Icon from './Icon'
import NumberField from './NumberField'

export const CONTROLLERS = ['P', 'PI', 'PD', 'PID', 'FSF']

const SETTINGS = [
  { key: 'dt', label: 'Time step (s)', step: '0.001' },
  { key: 'max_time', label: 'Duration (s)', step: '0.1' },
  { key: 'target', label: 'Reference target', step: 'any' },
  { key: 'min_control', label: 'Minimum control', step: 'any' },
  { key: 'max_control', label: 'Maximum control', step: 'any' },
]

function SectionHeading({ index, title, aside }) {
  return (
    <div className="ct-section-heading">
      <span className="ct-section-index">{index}</span>
      <h3>{title}</h3>
      {aside && <span className="ct-section-aside">{aside}</span>}
    </div>
  )
}

export default function ConfigurationPanel({
  file, setFile, system, uploading, uploadError, onUpload,
  controllerType, setControllerType, schema, schemaLoading, schemaError,
  gains, setGains, simulationConfig, setSimulationConfig,
  simulating, onSimulate, validationError,
}) {
  const disabled = uploading || simulating
  const schemaEntries = schema ? Object.entries(schema) : []

  return (
    <aside className="ct-sidebar" aria-label="Simulation configuration">
      <div className="ct-sidebar-heading">
        <div className="ct-sidebar-heading-icon"><Icon name="sliders" size={20} /></div>
        <div><h2>Configuration</h2><p>Model · Controller · Simulation</p></div>
        <span className="ct-sidebar-step">SETUP</span>
      </div>

      <section className="ct-config-section">
        <SectionHeading index="01" title="Dynamical system" aside=".py model" />
        <label className={`ct-file-picker${disabled ? ' is-disabled' : ''}`}>
          <Icon name="upload" size={17} />
          <span>Choose dynamics Python file</span>
          <input
            type="file"
            accept=".py,text/x-python"
            disabled={disabled}
            aria-label="Choose trusted Python dynamics file"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
        {file && <div className="ct-file-name"><Icon name="file" size={15} /><span title={file.name}>{file.name}</span></div>}
        <button className="ct-btn ct-btn--primary ct-full-width ct-upload-btn" type="button" disabled={!file || disabled} onClick={onUpload}>
          {uploading ? <span className="ct-spinner"/> : <Icon name="upload" size={15} />}
          {uploading ? 'Loading system…' : 'Load system'}
        </button>
        {uploadError && <div className="ct-alert ct-alert--error" role="alert">{uploadError}</div>}
        {system && (
          <div className="ct-system-info">
            <div className="ct-system-name"><Icon name="checkCircle" size={16}/><strong>{system.name}</strong></div>
            <div className="ct-system-pills"><span>{system.num_states} states</span><span>Uploaded model</span></div>
            <p title={system.system_id}>System ID: {system.system_id}</p>
          </div>
        )}
        <p className="ct-security-note"><Icon name="alert" size={14}/> Upload <strong>only trusted .py files</strong>. Server-side model loading may execute Python code.</p>
      </section>

      <fieldset className="ct-config-fieldset" disabled={!system || disabled}>
        <section className="ct-config-section">
          <SectionHeading index="02" title="Controller definition" aside="5 types" />
          <label className="ct-field-label" htmlFor="ct-controller-type">Controller type</label>
          <select id="ct-controller-type" className="ct-select" value={controllerType} disabled={!system || disabled} onChange={event => setControllerType(event.target.value)}>
            {CONTROLLERS.map(type => <option key={type} value={type}>{type}{type === 'FSF' ? ' · Full-state feedback' : ''}</option>)}
          </select>
          {schemaLoading && <div className="ct-inline-notice"><span className="ct-spinner"/> Loading parameter schema…</div>}
          {schemaError && <div role="alert" className="ct-alert ct-alert--error">{schemaError}</div>}
          {schema && (
            <>
              <div className="ct-parameter-header"><span>PARAMETER</span><span>VALUE</span></div>
              {schemaEntries.map(([name, bounds]) => (
                <div className="ct-parameter-row" key={name}>
                  <div className="ct-parameter-description"><strong>{name}</strong><span>Range {bounds.min} to {bounds.max}</span></div>
                  <NumberField compact id={`ct-gain-${name}`} label={`${name} value`} value={gains[name] ?? ''} min={bounds.min} max={bounds.max} disabled={disabled} onChange={value => setGains(old => ({ ...old, [name]: value }))}/>
                </div>
              ))}
              {controllerType === 'FSF' && <p className="ct-muted-note">Full-state feedback gains are determined by the model schema, not assumed to be Kp/Ki/Kd.</p>}
            </>
          )}
        </section>

        <section className="ct-config-section">
          <SectionHeading index="03" title="Simulation settings" />
          <div className="ct-settings-grid">
            {SETTINGS.map(({key,label,step}) => (
              <NumberField key={key} id={`ct-setting-${key}`} label={label} value={simulationConfig[key]} step={step} disabled={disabled} onChange={value => setSimulationConfig(old => ({ ...old, [key]: value }))}/>
            ))}
          </div>
          <p className="ct-muted-note">Maximum 20,000 time steps. Actual output units depend on the uploaded model.</p>
        </section>
      </fieldset>

      <div className="ct-config-actions">
        {validationError && <div role="alert" className="ct-alert ct-alert--error">{validationError}</div>}
        <button className="ct-btn ct-btn--run ct-full-width" type="button" onClick={onSimulate} disabled={!system || !schema || schemaLoading || disabled}>
          {simulating ? <span className="ct-spinner ct-spinner--light"/> : <Icon name="play" size={17}/>}
          {simulating ? 'Running simulation…' : 'Run simulation'}
        </button>
        <p className="ct-run-help">Simulate the selected controller with the specified gains and configuration.</p>
      </div>
    </aside>
  )
}
