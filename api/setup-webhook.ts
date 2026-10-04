// api/setup-webhook.ts
// Ushbu endpoint Vercel'dagi haqiqiy BOT_TOKEN orqali Telegram Webhook'ni bir martada ulab beradi

export default async function handler(req: any, res: any) {
  const BOT_TOKEN = process.env.BOT_TOKEN || "";
  const VERCEL_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL 
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` 
    : "https://promaxsalesbot.vercel.app";

  if (!BOT_TOKEN) {
    return res.status(400).json({
      ok: false,
      error: "Vercel muhitida BOT_TOKEN topilmadi! Iltimos, Vercel Settings -> Environment Variables bo'limini tekshiring.",
    });
  }

  const webhookUrl = `${VERCEL_URL}/api/telegram-webhook`;

  try {
    // 1. Bot haqida ma'lumot olish (GetMe)
    const meRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const meData = await meRes.json();

    if (!meData.ok) {
      return res.status(400).json({
        ok: false,
        error: "Telegram API bot tokenini qabul qilmadi. Vercel'dagi BOT_TOKEN to'g'riligini tekshiring.",
        telegramResponse: meData,
      });
    }

    // 2. Webhook'ni Vercel ga ulash (setWebhook)
    const setRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: true, // Qotib qolgan eski loop xabarlarni tozalash
        allowed_updates: ["message", "edited_message", "callback_query"],
      }),
    });
    const setData = await setRes.json();

    // 3. Mini App menyu tugmasini ulash
    let menuData: any = null;
    try {
      const menuRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_button: {
            type: "web_app",
            text: "🛍 Do'kon (Mini App)",
            web_app: { url: VERCEL_URL },
          },
        }),
      });
      menuData = await menuRes.json();
    } catch (e: any) {
      menuData = { error: e.message };
    }

    return res.status(200).json({
      ok: true,
      message: "🎉 Tabriklaymiz! Telegram Webhook muvaffaqiyatli ulandi!",
      bot: {
        id: meData.result.id,
        nomi: meData.result.first_name,
        username: `@${meData.result.username}`,
      },
      webhookUrl: webhookUrl,
      telegramWebhookNatijasi: setData,
      menuButtonNatijasi: menuData,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: "Kutilmagan xatolik yuz berdi: " + err.message,
    });
  }
}
