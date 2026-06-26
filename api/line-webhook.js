export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'ok' });
  }

  const body = req.body;
  let groupId = null;
  let userId = null;

  if (body.events && body.events.length > 0) {
    const source = body.events[0].source;
    groupId = source.groupId || null;
    userId = source.userId || null;
  }

  // グループIDをSupabaseに保存
  if (groupId) {
    await fetch('https://dctlirxcwitcupaewiyt.supabase.co/rest/v1/line_groups', {
      method: 'POST',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ group_id: groupId, name: 'スタッフグループ' })
    });
  }

  return res.status(200).json({ status: 'ok', groupId, userId });
}
