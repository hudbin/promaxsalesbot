// api/daily-report.ts
// PROMAX B2B STORE: KUNLIK 21:00 HISOBOTI (VERCEL CRON & API)

import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = process.env.BOT_TOKEN || "8909794013:AAEJB9hhM3OpIQoKRYlyML-gDodXgOgGDn0";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function pul(n: number): string {
  return Math.round(n || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

export default async function handler(req: any, res: any) {
  if (!BOT_TOKEN || !GROUP_CHAT_ID) {
    console.error("BOT_TOKEN yoki TELEGRAM_GROUP_ID sozlanmagan.");
    return res.status(500).json({ error: "Missing bot configuration" });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    // 1. Bugungi savdolar
    const { data: savdolar } = await supabase
      .from("savdolar")
      .select("valyuta, jami_summa, tolangan_summa, qarz_summa")
      .gte("sana_vaqt", `${today}T00:00:00Z`)
      .eq("holat", "yakunlandi");

    // 2. Bugungi rasxodlar
    const { data: rasxodlar } = await supabase
      .from("rasxodlar")
      .select("valyuta, summa, kategoriya")
      .gte("sana_vaqt", `${today}T00:00:00Z`)
      .eq("holat", "faol");

    // 3. Bugungi qarz to'lovlari
    const { data: qarzTolovlari } = await supabase
      .from("qarz_tolovlari")
      .select("valyuta, summa")
      .gte("sana_vaqt", `${today}T00:00:00Z`);

    // 4. Kassa qoldiqlari
    const { data: kassaBalans } = await supabase.from("view_kassa_balans").select("*");

    // Hisob-kitoblar
    let savdoUZS = 0, savdoUSD = 0, naqdUZS = 0, naqdUSD = 0, qarzBerildiUZS = 0, qarzBerildiUSD = 0;
    savdolar?.forEach((s) => {
      if (s.valyuta === "USD") {
        savdoUSD += Number(s.jami_summa || 0);
        naqdUSD += Number(s.tolangan_summa || 0);
        qarzBerildiUSD += Number(s.qarz_summa || 0);
      } else {
        savdoUZS += Number(s.jami_summa || 0);
        naqdUZS += Number(s.tolangan_summa || 0);
        qarzBerildiUZS += Number(s.qarz_summa || 0);
      }
    });

    let rasxodUZS = 0, rasxodUSD = 0;
    const katMap: Record<string, number> = {};
    rasxodlar?.forEach((r) => {
      if (r.valyuta === "USD") {
        rasxodUSD += Number(r.summa || 0);
      } else {
        rasxodUZS += Number(r.summa || 0);
        katMap[r.kategoriya] = (katMap[r.kategoriya] || 0) + Number(r.summa || 0);
      }
    });

    let eskiQarzTushdiUZS = 0, eskiQarzTushdiUSD = 0;
    qarzTolovlari?.forEach((q) => {
      if (q.valyuta === "USD") eskiQarzTushdiUSD += Number(q.summa || 0);
      else eskiQarzTushdiUZS += Number(q.summa || 0);
    });

    // Kassa qoldiqlari xaritasi
    const kassaMap: Record<string, number> = {};
    kassaBalans?.forEach((k) => {
      kassaMap[k.kassa_turi] = Number(k.joriy_balans || 0);
    });

    // Telegram uchun xabar matnini tuzish
    const kun = new Date().toLocaleDateString("ru-RU");
    const katMatn = Object.entries(katMap)
      .map(([k, v]) => `   • ${k}: ${pul(v)} so'm`)
      .join("\n");

    const matn =
      `📊 <b>PROMAX · KUNLIK YAKUNIY HISOBOT</b>\n` +
      `📅 <b>Sana: ${kun} (21:00)</b>\n\n` +
      `🛒 <b>SAVDO:</b>\n` +
      `   • Jami savdo: <b>${pul(savdoUZS)} so'm</b> ${savdoUSD > 0 ? `| <b>$${pul(savdoUSD)}</b>` : ""}\n` +
      `   • Kassaga tushdi: <b>${pul(naqdUZS)} so'm</b> ${naqdUSD > 0 ? `| <b>$${pul(naqdUSD)}</b>` : ""}\n` +
      `   • Qarzga berildi: <b>${pul(qarzBerildiUZS)} so'm</b> ${qarzBerildiUSD > 0 ? `| <b>$${pul(qarzBerildiUSD)}</b>` : ""}\n\n` +
      `💳 <b>ESKI QARZDAN TUSHUM:</b>\n` +
      `   • Qaytarilgan qarz: <b>${pul(eskiQarzTushdiUZS)} so'm</b> ${eskiQarzTushdiUSD > 0 ? `| <b>$${pul(eskiQarzTushdiUSD)}</b>` : ""}\n\n` +
      `🧾 <b>XARAJATLAR (RASXOD):</b>\n` +
      `   • Jami chiqim: <b>${pul(rasxodUZS)} so'm</b> ${rasxodUSD > 0 ? `| <b>$${pul(rasxodUSD)}</b>` : ""}\n` +
      (katMatn ? `${katMatn}\n\n` : `\n`) +
      `💰 <b>KASSA QOLDIG'I (JORIY HOLAT):</b>\n` +
      `   💵 Naqd so'm: <b>${pul(kassaMap["naqd_uzs"] || 0)} so'm</b>\n` +
      `   💲 Naqd dollar: <b>$${pul(kassaMap["naqd_usd"] || 0)}</b>\n` +
      `   💳 Plastik karta: <b>${pul(kassaMap["plastik_uzs"] || 0)} so'm</b>\n` +
      `   🏦 Bank hisobi: <b>${pul(kassaMap["bank_uzs"] || 0)} so'm</b>\n\n` +
      `📱 <i>Batafsil ro'yxat va filtrlash — Mini App ilovasida.</i>`;

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: GROUP_CHAT_ID,
        text: matn,
        parse_mode: "HTML",
      }),
    });

    console.log("Kunlik hisobot guruhga yuborildi:", today);
    return res.status(200).json({ ok: true, message: "Report sent" });
  } catch (err: any) {
    console.error("Hisobot yuborishda xatolik:", err);
    return res.status(500).json({ error: err.message });
  }
}
