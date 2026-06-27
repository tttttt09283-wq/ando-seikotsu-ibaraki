const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setDate(jst.getDate() + 1);
  const tomorrow = jst.toISOString().split('T')[0];

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('patient_name, time, menu, line_user_id')
    .eq('date', tomorrow)
    .not('line_user_id', 'is', null);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const results = await Promise.all(
    bookings.map(async (booking) => {
      const message = `【あんど整骨院 香里園駅前院】\n明日のご予約のリマインドです。\n\n📅 時間：${booking.time}\n🏥 メニュー：${booking.menu}\n\nご来院をお待ちしております！\nご不明な点はお電話ください。`;

      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          to: booking.line_user_id,
          messages: [{ type: 'text', text: message }],
        }),
      });

      return { patient: booking.patient_name, status: response.status };
    })
  );

  return res.status(200).json({ sent: results.length, results });
};
