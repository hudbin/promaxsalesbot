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
  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN sozlanmagan.");
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

    // Kassa qoldiqlari xaritasi (Dinamik Hisoblar)
    const kassaMatnList: string[] = [];
    kassaBalans?.forEach((k) => {
      let valIcon = k.valyuta === "USD" ? "💲" : "💵";
      if (k.kassa_turi === "plastik") valIcon = "💳";
      if (k.kassa_turi === "bank") valIcon = "🏦";
      const summaPul = k.valyuta === "USD" ? `$${pul(k.joriy_balans || 0)}` : `${pul(k.joriy_balans || 0)} so'm`;
      kassaMatnList.push(`   ${valIcon} ${k.kassa_nomi}: <b>${summaPul}</b>`);
    });
    const kassaMatn = kassaMatnList.length > 0 ? kassaMatnList.join("\n") : "   <i>Hisoblar bo'sh</i>";

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
      `💰 <b>HISOB-KITOB (KASSALAR) JORIY HOLATI:</b>\n` +
      `${kassaMatn}\n\n` +
      `📱 <i>Batafsil ro'yxat va filtrlash — Mini App ilovasida.</i>`;

    // Adminlarni bazadan olish
    const { data: adminlar } = await supabase.from("xodimlar").select("telegram_id").eq("rol", "admin").eq("faol", true);
    let adminList = adminlar?.map((a) => a.telegram_id) || [];
    if (adminList.length === 0) {
      // Agar bazada admin topilmasa, fallback sifatida asosiy guruhga jo'natamiz
      adminList = [GROUP_CHAT_ID];
    }

    for (const chatId of adminList) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: matn,
          parse_mode: "HTML",
        }),
      });
    }

    console.log("Kunlik hisobot guruhga yuborildi:", today);
    return res.status(200).json({ ok: true, message: "Report sent" });
  } catch (err: any) {
    console.error("Hisobot yuborishda xatolik:", err);
    return res.status(500).json({ error: err.message });
  }
}
