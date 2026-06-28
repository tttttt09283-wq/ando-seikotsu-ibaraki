const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // 翌日の日付（JST）
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setDate(jst.getDate() + 1);
  const tomorrow = jst.toISOString().split('T')[0];
  const tomorrowJP = `${jst.getMonth()+1}月${jst.getDate()}日`;

  // 翌日の予約でline_user_idがあるものを取得
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, patient_name, time, menu, line_user_id')
    .eq('date', tomorrow)
    .not('line_user_id', 'is', null);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const results = await Promise.all(
    bookings.map(async (booking) => {
      // 問診票URL（予約IDをパラメータに）
      const intakeUrl = `https://ando-seikotsu-ibaraki.vercel.app/intake.html?id=${booking.id}`;
      // QRコード画像URL（Google Charts API）
      const qrUrl = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(intakeUrl)}&choe=UTF-8`;

      const messages = [
        {
          type: 'text',
          text: `【あんど整骨院 香里園駅前院】\n明日のご予約のリマインドです。\n\n📅 日時：${tomorrowJP} ${booking.time}\n🏥 メニュー：${booking.menu}\n\nご来院の際は下記のQRコードをスタッフにご提示ください。\nご来院をお待ちしております！`
        },
        {
          type: 'image',
          originalContentUrl: qrUrl,
          previewImageUrl: qrUrl
        }
      ];

      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          to: booking.line_user_id,
          messages,
        }),
      });

      return { patient: booking.patient_name, status: response.status };
    })
  );

  return res.status(200).json({ sent: results.length, results });
};
