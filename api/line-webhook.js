export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok' });
  }

  const body = req.body;

  if (body.events && body.events.length > 0) {
    const event = body.events[0];
    const source = event.source;
    console.log('Group ID:', source.groupId);
    console.log('User ID:', source.userId);
  }

  return res.status(200).json({ status: 'ok' });
}
