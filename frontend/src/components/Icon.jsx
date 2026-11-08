import { Fragment } from 'react'

const paths = {
  activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-5 3 2 5-7" /></>,
  upload: <><path d="M12 16V3m0 0L7 8m5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  play: <><path d="m8 5 11 7-11 7V5z" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><path d="m12 3 10 18H2L12 3z" /><path d="M12 9v5m0 3v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4" /></>,
  settings: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none" /></>,
  download: <><path d="M12 3v12m0 0-5-5m5 5 5-5M4 17v4h16v-4" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v6h6" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  layers: <><path d="m12 2 10 6-10 6L2 8l10-6zM2 12l10 6 10-6M2 16l10 6 10-6" /></>,
  arrow: <><path d="M4 12h16m-7-7 7 7-7 7" /></>,
}

export default function Icon({ name, size = 18, className = '', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className} {...rest}>
      {paths[name] || <Fragment>{paths.activity}</Fragment>}
    </svg>
  )
}
