const express = require('express')
const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const app = express()
app.use(express.json())

const SECRET = process.env.API_SECRET || ''

function checkAuth(req, res) {
  if (!SECRET) return true
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${SECRET}`) {
    console.log('[auth] Unauthorized - header:', auth ? 'present but wrong' : 'missing')
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

let cookiesFile = null
if (process.env.INSTAGRAM_COOKIES) {
  try {
    cookiesFile = path.join(os.tmpdir(), 'ig_cookies.txt')
    fs.writeFileSync(cookiesFile, process.env.INSTAGRAM_COOKIES)
    console.log('[startup] Cookies file written')
  } catch (e) {
    console.error('[startup] Failed to write cookies:', e.message)
  }
}

app.get('/health', (_req, res) => {
  let ytdlpVersion = 'unknown'
  try { ytdlpVersion = execFileSync('yt-dlp', ['--version'], { timeout: 5000 }).toString().trim() } catch {}
  res.json({ ok: true, ytdlp: ytdlpVersion, cookies: !!cookiesFile })
})

app.post('/resolve', (req, res) => {
  if (!checkAuth(req, res)) return
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })
  console.log('[resolve] Request for:', url)
  const args = [
    '--dump-json', '--no-warnings', '--no-call-home', '--no-check-certificate',
    '--format', 'best[ext=mp4][height<=720]/best[ext=mp4]/mp4/best',
    '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    '--extractor-retries', '3',
  ]
  if (cookiesFile) { args.push('--cookies', cookiesFile); console.log('[resolve] Using cookies') }
  args.push(url)
  execFile('yt-dlp', args, { timeout: 40000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[resolve] yt-dlp error:', err.message.slice(0, 400))
      if (stderr) console.error('[resolve] stderr:', stderr.slice(0, 200))
      return res.status(422).json({ error: err.message.slice(0, 300) })
    }
    try {
      const info = JSON.parse(stdout)
      const videoUrl = info.url ||
        (info.formats||[]).find(f=>f.ext==='mp4'&&(f.height??999)<=720)?.url ||
        (info.formats||[]).find(f=>f.ext==='mp4')?.url ||
        (info.formats||[])[0]?.url
      if (!videoUrl) { console.error('[resolve] No video URL found'); return res.status(422).json({ error: 'No video URL found' }) }
      console.log('[resolve] Success, URL length:', videoUrl.length)
      res.json({ url: videoUrl })
    } catch (e) { console.error('[resolve] Parse error:', e.message); res.status(422).json({ error: 'Failed to parse output' }) }
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => console.log(`yt-dlp resolver on port ${PORT}, secret:${SECRET?'set':'not set'}, cookies:${cookiesFile?'yes':'no'}`))
