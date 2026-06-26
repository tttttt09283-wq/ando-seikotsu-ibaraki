const LINE_TOKEN = 'IjKfscY0v26S5eBl+Soop/Ty2r+YLovOOanqXJRbUL8093lsfJt1sjgj4T+xN66KZ3ufgPomsXn5BIR3Uy9Bw4HPArx/hpo4dqI6knZXj8aADrf/eTJekeLzCC662exQYxHRUtNSpUUvFweJHRFXCwdB04t89/1O/w1cDnyilFU=';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { groupId, message } = req.body;
  if (!groupId || !message) return res.status(400).json({ error: 'missing params' });

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: 'text', text: message }],
    }),
  });

  const data = await response.json();
  return res.status(response.ok ? 200 : 500).json(data);
}
