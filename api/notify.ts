export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID;
  const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  if (!BOT_TOKEN || !GROUP_CHAT_ID) {
    return res.status(500).json({ error: "Missing Telegram Config" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { text } = body;
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: GROUP_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
