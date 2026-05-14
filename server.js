const express = require('express')
const { execFile } = require('child_process')
const app = express()
app.use(express.json())
const SECRET = process.env.API_SECRET || ''
function checkAuth(req, res) {
  if (!SECRET) return true
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${SECRET}`) { res.status(401).json({ error: 'Unauthorized' }); return false }
  return true
}
app.get('/health', (_req, res) => res.json({ ok: true }))
app.post('/resolve', (req, res) => {
  if (!checkAuth(req, res)) return
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })
  const args = ['--dump-json','--no-warnings','--no-call-home','--no-check-certificate','--format','best[ext=mp4][height<=720]/best[ext=mp4]/mp4/best','--add-header','User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',url]
  execFile('yt-dlp', args, { timeout: 40000 }, (err, stdout) => {
    if (err) return res.status(422).json({ error: err.message.slice(0, 300) })
    try {
      const info = JSON.parse(stdout)
      const videoUrl = info.url || (info.formats||[]).find(f=>f.ext==='mp4'&&(f.height??999)<=720)?.url || (info.formats||[]).find(f=>f.ext==='mp4')?.url || (info.formats||[])[0]?.url
      if (!videoUrl) return res.status(422).json({ error: 'No video URL found' })
      res.json({ url: videoUrl })
    } catch { res.status(422).json({ error: 'Failed to parse output' }) }
  })
})
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => console.log(`yt-dlp resolver on port ${PORT}`))
