export default function NumberField({ id, label, value, onChange, min, max, step = 'any', disabled = false, hint, compact = false }) {
  return (
    <div className={`ct-number-field${compact ? ' ct-number-field--compact' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value
          onChange(raw === '' ? '' : Number(raw))
        }}
      />
      {hint && <small>{hint}</small>}
    </div>
  )
}
