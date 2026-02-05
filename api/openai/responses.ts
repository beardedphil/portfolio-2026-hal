import type { IncomingMessage, ServerResponse } from 'http'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as { input?: string }

    const key = process.env.OPENAI_API_KEY?.trim()
    const model = process.env.OPENAI_MODEL?.trim()
    if (!key || !model) {
      json(res, 503, {
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
      })
      return
    }

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input: body.input ?? '' }),
    })

    // Preserve status + return body as-is (JSON text).
    const text = await openaiRes.text()
    res.statusCode = openaiRes.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

