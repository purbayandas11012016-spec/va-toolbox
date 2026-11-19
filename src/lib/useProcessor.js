import { useCallback, useEffect, useRef, useState } from 'react'
import { VAEngine } from '../lib/engine.js'

// Owns one engine instance for the page lifetime and mirrors worker events into React state.
export function useProcessor(toast) {
  const engineRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [caps, setCaps] = useState(null)
  const [threaded, setThreaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('idle')
  const [counts, setCounts] = useState({ decode: 0, gpu: 0, mux: 0, total: 0 })
  const [output, setOutput] = useState(null)
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEffect(() => {
    const engine = new VAEngine((event, data) => {
      if (event === 'decode-progress') setCounts((c) => ({ ...c, decode: data.done, total: data.total || c.total }))
      else if (event === 'gpu-progress') setCounts((c) => ({ ...c, gpu: data.done }))
      else if (event === 'mux-progress') setCounts((c) => ({ ...c, mux: data.progress ?? c.mux }))
      else if (event === 'stage') setStage(data.stage)
      else if (event === 'error') toastRef.current.error('Engine error', data.error)
    })
    engineRef.current = engine
    engine
      .init()
      .then(() => {
        setCaps(engine.caps)
        setThreaded(engine.threaded)
        setReady(true)
      })
      .catch((e) => toastRef.current.error('Engine init failed', e.message))
    return () => engine.terminate()
  }, [])

  useEffect(() => {
    return () => {
      if (output?.url) URL.revokeObjectURL(output.url)
    }
  }, [output])

  const probe = useCallback(async (file) => {
    const engine = engineRef.current
    setOutput(null)
    const info = await engine.probe(file)
    setCounts({ decode: 0, gpu: 0, mux: 0, total: info.frameCount || 0 })
    setStage('idle')
    return info
  }, [])

  const run = useCallback(async (settings) => {
    const engine = engineRef.current
    setBusy(true)
    setStage('pipeline')
    setCounts({ decode: 0, gpu: 0, mux: 0, total: engine.probeInfo?.frameCount || 0 })
    try {
      const res = await engine.run(settings)
      const url = URL.createObjectURL(res.blob)
      setOutput({ ...res, url, size: res.blob.size })
      setStage('done')
      toastRef.current.success('Export complete', `${res.name} · ${(res.blob.size / 1048576).toFixed(1)} MB`)
      return res
    } catch (e) {
      setStage('error')
      toastRef.current.error('Export failed', e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const cancel = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.terminate()
    engineRef.current = new VAEngine((event, data) => {
      if (event === 'error') toastRef.current.error('Engine error', data.error)
    })
    engineRef.current.init().then(() => {
      setCaps(engineRef.current.caps)
      setReady(true)
    })
    setBusy(false)
    setStage('idle')
    toastRef.current.warn('Stopped', 'Workers restarted, GPU memory released.')
  }, [])

  return { ready, caps, threaded, busy, stage, counts, output, probe, run, cancel }
}
