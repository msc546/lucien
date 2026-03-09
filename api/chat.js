module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const { apiKey, model, system, messages, stream } = req.body;

  if (!apiKey) return res.status(400).json({ error: { message: 'API Key fehlt' } });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5-20241022',
        max_tokens: 4096,
        system: system || '',
        messages: messages || [],
        stream: !!stream
      })
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (!response.ok) {
        const errData = await response.json();
        res.write(`data: ${JSON.stringify({ type: 'error', error: errData.error || { message: 'API Fehler' } })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data: ') || line.startsWith('event: ') || line.trim() === '') {
              res.write(line + '\n');
            }
          }
        }
        if (buffer) res.write(buffer + '\n');
      } catch (streamErr) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: { message: streamErr.message } })}\n\n`);
      }
      res.end();
    } else {
      const data = await response.json();
      return res.status(response.status).json(data);
    }
  } catch (e) {
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ type: 'error', error: { message: 'Verbindungsfehler: ' + e.message } })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: { message: 'Verbindungsfehler: ' + e.message } });
    }
  }
};
