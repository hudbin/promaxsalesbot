import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN || "";
  const GROUP_CHAT_ID = (process.env.TELEGRAM_GROUP_ID || "").trim();
  const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "580858047";
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const SUPABASE_KEY = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "Missing BOT_TOKEN" });
  }

  const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { text, chat_id } = body;
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    // Xabar yuboriladigan barcha manzillar (Guruh + Adminlar + ixtiyoriy chat_id)
    const targets = new Set<string>();

    if (GROUP_CHAT_ID) {
      targets.add(GROUP_CHAT_ID);
    }

    if (chat_id) {
      targets.add(String(chat_id).trim());
    }

    if (ADMIN_TELEGRAM_ID) {
      ADMIN_TELEGRAM_ID.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => targets.add(id));
    }

    // Bazadagi faol adminlarga ham yuborish
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: dbAdmins } = await supabase
          .from("xodimlar")
          .select("telegram_id")
          .eq("rol", "admin")
          .eq("faol", true);

        if (dbAdmins) {
          dbAdmins.forEach((a: any) => {
            if (a.telegram_id) {
              targets.add(String(a.telegram_id).trim());
            }
          });
        }
      } catch (e) {
        console.warn("notify.ts: DB adminlarni olishda xato:", e);
      }
    }

    await Promise.allSettled(
      Array.from(targets).map((targetId) =>
        fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: targetId,
            text,
            parse_mode: "HTML",
          }),
        })
      )
    );

    return res.status(200).json({ ok: true, sentTo: Array.from(targets).length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
