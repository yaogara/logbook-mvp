export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    console.log('[api/log]', body?.context || 'unknown', body?.message || body)
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[api/log] failed to process', err)
    res.status(200).json({ ok: true })
  }
}

