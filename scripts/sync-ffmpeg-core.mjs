// Copies the ffmpeg.wasm cores into public/ so the app stays fully local (no CDN, no backend).
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// ESM cores: the ffmpeg.wasm class worker imports the core as a module and needs its default export.
const jobs = [
  ['node_modules/@ffmpeg/core/dist/esm', 'public/ffmpeg'],
  ['node_modules/@ffmpeg/core-mt/dist/esm', 'public/ffmpeg-mt'],
]

for (const [from, to] of jobs) {
  const src = path.join(root, from)
  const dst = path.join(root, to)
  try {
    await stat(src)
  } catch {
    console.warn(`[ffmpeg-core] skip missing ${from}`)
    continue
  }
  await rm(dst, { recursive: true, force: true })
  await mkdir(dst, { recursive: true })
  await cp(src, dst, { recursive: true })
  console.log(`[ffmpeg-core] ${from} -> ${to}`)
}
