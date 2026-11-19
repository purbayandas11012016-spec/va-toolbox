import { CheckCircle, Cpu, FilmSlate, Lightning, Play, SpinnerGap, Stop, Waveform } from '@phosphor-icons/react'
import { Panel, Progress } from './ui.jsx'
import { MSG } from '../lib/presets.js'

const stageState = (busy, done) => (done ? 'done' : busy ? 'run' : 'idle')
const StageIcon = ({ state, icon: Icon }) => (
  <span className="ico">{state === 'run' ? <SpinnerGap size={16} weight="bold" /> : state === 'done' ? <CheckCircle size={16} weight="fill" /> : <Icon size={16} />}</span>
)

export function RunPanel({ ready, busy, stage, counts, audioOnly, canRun, onRun, onCancel }) {
  const total = counts.total || 0
  const dec = total ? Math.min(1, counts.decode / total) : 0
  const gpu = total ? Math.min(1, counts.gpu / total) : 0
  const mux = counts.mux || 0
  const overall = audioOnly ? mux : total ? 0.35 * dec + 0.4 * gpu + 0.25 * mux : 0
  const done = stage === 'done'

  const sDecode = stageState(busy && stage === 'pipeline' && !(total && counts.decode >= total), total > 0 && counts.decode >= total)
  const sGpu = stageState(busy && stage === 'pipeline' && !(total && counts.gpu >= total), total > 0 && counts.gpu >= total)
  const sMux = stageState(busy && stage === MSG.MUX_START, done)

  return (
    <Panel icon={Lightning} title="Processing" sub={ready ? 'engine ready' : 'warming up'}>
      <div className="stage-list">
        {!audioOnly && (
          <>
            <div className="stage" data-state={sDecode}>
              <StageIcon state={sDecode} icon={FilmSlate} />
              <span>WebCodecs decode</span>
              <span className="mono">{total ? `${counts.decode}/${total}` : '—'}</span>
            </div>
            <div className="stage" data-state={sGpu}>
              <StageIcon state={sGpu} icon={Cpu} />
              <span>WebGPU scale + encode</span>
              <span className="mono">{total ? `${counts.gpu}/${total}` : '—'}</span>
            </div>
          </>
        )}
        <div className="stage" data-state={sMux}>
          <StageIcon state={sMux} icon={Waveform} />
          <span>ffmpeg.wasm mux</span>
          <span className="mono">{Math.round(mux * 100)}%</span>
        </div>
      </div>

      <Progress value={done ? 1 : overall} busy={busy} />

      <div className="grid-2">
        <button type="button" className="btn primary" disabled={!ready || !canRun || busy} onClick={onRun}>
          <Play size={16} weight="fill" />
          {busy ? 'Processing…' : 'Process locally'}
        </button>
        <button type="button" className="btn danger" disabled={!busy} onClick={onCancel}>
          <Stop size={16} weight="fill" />
          Stop
        </button>
      </div>
    </Panel>
  )
}
