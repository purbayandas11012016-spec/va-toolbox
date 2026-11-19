export function Panel({ icon: Icon, title, sub, children }) {
  return (
    <section className="panel">
      <header className="panel-head">
        {Icon && (
          <span className="ico">
            <Icon size={18} weight="duotone" />
          </span>
        )}
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Segmented({ value, onChange, options, disabled }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          data-on={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value = 0, busy }) {
  return (
    <div className={`progress${busy ? ' busy' : ''}`}>
      <i style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Stat({ label, value }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b className="mono">{value}</b>
    </div>
  )
}
