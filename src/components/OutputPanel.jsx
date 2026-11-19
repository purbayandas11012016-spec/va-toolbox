import { CheckCircle, DownloadSimple, Export, Rewind } from '@phosphor-icons/react'
import { Panel, Stat } from './ui.jsx'
import { bytes } from '../lib/presets.js'

export function OutputPanel({ output, onReset }) {
  if (!output) {
    return (
      <Panel icon={Export} title="Result">
        <div className="empty">
          <span className="ico">
            <Export size={34} weight="duotone" />
          </span>
          <p>Nothing rendered yet. Load a file, dial in the targets, then run the local pipeline.</p>
        </div>
      </Panel>
    )
  }

  const isAudio = output.blob.type.startsWith('audio')

  return (
    <Panel icon={CheckCircle} title="Result" sub={output.name}>
      {isAudio ? (
        <audio className="video-preview" src={output.url} controls style={{ maxHeight: 60 }} />
      ) : (
        <video className="video-preview" src={output.url} controls playsInline />
      )}
      <div className="stat-grid">
        <Stat label="File" value={output.name} />
        <Stat label="Size" value={bytes(output.size)} />
        <Stat label="Type" value={output.blob.type} />
      </div>
      <div className="grid-2">
        <a className="btn primary" href={output.url} download={output.name}>
          <DownloadSimple size={16} weight="bold" />
          Download
        </a>
        <button type="button" className="btn ghost" onClick={onReset}>
          <Rewind size={16} weight="bold" />
          Clear
        </button>
      </div>
    </Panel>
  )
}
