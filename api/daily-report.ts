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

function formatUsd(n: number): string {
  const num = Math.round(n || 0);
  if (num < 0) return `-$${pul(Math.abs(num))}`;
  return `$${pul(num)}`;
}

function extractGuruh(hNom: string, hGuruhi?: string): string {
  if (hGuruhi && hGuruhi.trim()) {
    const g = hGuruhi.trim();
    if (/^asosiy\s+(do['’`]?kon|kassa)/i.test(g)) return "Asosiy Do'kon";
    return g;
  }
  if (!hNom) return "Asosiy Do'kon";
  const toza = hNom
    .replace(/\s*\((Naqd|Plastik|Bank|UZS|USD)[^\)]*\)/gi, "")
    .replace(/\s*-\s*(Naqd|Plastik|Bank|UZS|USD)[^\-]*/gi, "")
    .trim();
  if (/^asosiy\s+(do['’`]?kon|kassa)/i.test(toza)) return "Asosiy Do'kon";
  return toza || hNom;
}

export default async function handler(req: any, res: any) {
  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN sozlanmagan.");
    return res.status(500).json({ error: "Missing bot configuration" });
  }

  try {
    // 1. Sana aniqlash (Toshkent vaqti UTC+5 bo'yicha)
    const nowTashkent = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
    const defaultDateStr = `${nowTashkent.getFullYear()}-${String(nowTashkent.getMonth() + 1).padStart(2, "0")}-${String(nowTashkent.getDate()).padStart(2, "0")}`;
    const targetDateStr = (req.query?.date || req.body?.date || "").trim() || defaultDateStr;

    // Toshkent vaqti bo'yicha kunning aniq boshi va oxiri
    const startIso = `${targetDateStr}T00:00:00+05:00`;
    const endIso = `${targetDateStr}T23:59:59.999+05:00`;

    // 1. Savdolar (faqat yakunlangan va aynan shu kungi savdolar)
    const { data: savdolar } = await supabase
      .from("savdolar")
      .select("valyuta, jami_summa, tolangan_summa, qarz_summa")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .eq("holat", "yakunlandi");

    // 2. Rasxodlar (faqat shu kungi chiqimlar)
    const { data: rasxodlar } = await supabase
      .from("rasxodlar")
      .select("valyuta, summa, kategoriya")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .neq("holat", "bekor_qilindi");

    // 3. Qarz to'lovlari (faqat shu kungi tushumlar)
    const { data: qarzTolovlari } = await supabase
      .from("qarz_tolovlari")
      .select("valyuta, summa")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso);

    // 4. Kassa qoldiqlari va faol hisoblar
    const [{ data: kassaBalans }, { data: faolHisoblar }] = await Promise.all([
      supabase.from("view_kassa_balans").select("*"),
      supabase.from("hisoblar").select("*").eq("faol", true),
    ]);

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

    // Faol hisoblar xaritasi
    const hisobMap = new Map<string, any>();
    (faolHisoblar || []).forEach((h: any) => hisobMap.set(h.id, h));

    // Faqat faol hisoblarni olib, guruhlar bo'yicha yig'ish
    type SubSlot = { naqdUZS: number; plastikUZS: number; bankUZS: number; hasBank: boolean; naqdUSD: number };
    const guruhMap = new Map<string, SubSlot>();
    let jamiKassaUZS = 0;
    let jamiKassaUSD = 0;

    (kassaBalans || []).forEach((k: any) => {
      if (hisobMap.size > 0 && !hisobMap.has(k.hisob_id)) return;
      const hObj = hisobMap.get(k.hisob_id);
      const guruhNomi = extractGuruh(k.kassa_nomi, hObj?.guruhi);
      const balans = Number(k.joriy_balans || 0);
      const isUSD = k.valyuta === "USD";

      if (isUSD) jamiKassaUSD += balans;
      else jamiKassaUZS += balans;

      if (!guruhMap.has(guruhNomi)) {
        guruhMap.set(guruhNomi, { naqdUZS: 0, plastikUZS: 0, bankUZS: 0, hasBank: false, naqdUSD: 0 });
      }
      const slot = guruhMap.get(guruhNomi)!;
      if (isUSD) {
        slot.naqdUSD += balans;
      } else if (k.kassa_turi === "plastik") {
        slot.plastikUZS += balans;
      } else if (k.kassa_turi === "bank") {
        slot.bankUZS += balans;
        slot.hasBank = true;
      } else {
        slot.naqdUZS += balans;
      }
    });

    // Guruhlarni tartiblash: 1) Asosiy Do'kon, 2) Balansi borlar, 3) Balansi 0 lar (alifbo bo'yicha)
    const sortedGuruhlar = Array.from(guruhMap.entries()).sort(([nomA, a], [nomB, b]) => {
      const isMainA = nomA === "Asosiy Do'kon";
      const isMainB = nomB === "Asosiy Do'kon";
      if (isMainA && !isMainB) return -1;
      if (!isMainA && isMainB) return 1;

      const faolA = a.naqdUZS !== 0 || a.plastikUZS !== 0 || a.bankUZS !== 0 || a.naqdUSD !== 0;
      const faolB = b.naqdUZS !== 0 || b.plastikUZS !== 0 || b.bankUZS !== 0 || b.naqdUSD !== 0;
      if (faolA && !faolB) return -1;
      if (!faolA && faolB) return 1;

      return nomA.localeCompare(nomB, "uz");
    });

    const asosiyQatorlar: string[] = [];
    const xodimQatorlar: string[] = [];

    for (const [guruhNomi, slot] of sortedGuruhlar) {
      const isMain = guruhNomi === "Asosiy Do'kon";
      const hasNonZero = slot.naqdUZS !== 0 || slot.plastikUZS !== 0 || slot.bankUZS !== 0 || slot.naqdUSD !== 0;

      if (isMain) {
        const subLines: string[] = [
          `💵 Naqd: <b>${pul(slot.naqdUZS)} so'm</b>`,
          `💳 Plastik: <b>${pul(slot.plastikUZS)} so'm</b>`,
        ];
        if (slot.hasBank || slot.bankUZS !== 0) {
          subLines.push(`🏦 Bank: <b>${pul(slot.bankUZS)} so'm</b>`);
        }
        subLines.push(`💲 Dollar: <b>${formatUsd(slot.naqdUSD)}</b>`);

        const formattedSubs = subLines
          .map((line, i) => `   ${i === subLines.length - 1 ? "└" : "├"} ${line}`)
          .join("\n");
        asosiyQatorlar.push(`🏢 <b>${guruhNomi}:</b>\n${formattedSubs}`);
      } else if (hasNonZero) {
        const subLines: string[] = [
          `💵 Naqd: <b>${pul(slot.naqdUZS)} so'm</b>`,
          `💳 Plastik: <b>${pul(slot.plastikUZS)} so'm</b>`,
        ];
        if (slot.hasBank || slot.bankUZS !== 0) {
          subLines.push(`🏦 Bank: <b>${pul(slot.bankUZS)} so'm</b>`);
        }
        subLines.push(`💲 Dollar: <b>${formatUsd(slot.naqdUSD)}</b>`);

        const formattedSubs = subLines
          .map((line, i) => `      ${i === subLines.length - 1 ? "└" : "├"} ${line}`)
          .join("\n");
        xodimQatorlar.push(`   • 👤 <b>${guruhNomi}:</b>\n${formattedSubs}`);
      } else {
        xodimQatorlar.push(`   • 👤 <b>${guruhNomi}:</b> 0 so'm | $0`);
      }
    }

    let kassaMatn = `   📊 <b>Jami balans:</b> <b>${pul(jamiKassaUZS)} so'm</b> | <b>${formatUsd(jamiKassaUSD)}</b>\n`;
    if (asosiyQatorlar.length > 0) {
      kassaMatn += `\n${asosiyQatorlar.join("\n\n")}\n`;
    }
    if (xodimQatorlar.length > 0) {
      kassaMatn += `\n👥 <b>Xodimlar hisoblari:</b>\n${xodimQatorlar.join("\n")}`;
    }

    // Telegram uchun xabar matnini tuzish
    const [yyyy, mm, dd] = targetDateStr.split("-");
    const kun = `${dd}.${mm}.${yyyy}`;
    const soat = nowTashkent.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const katMatn = Object.entries(katMap)
      .map(([k, v]) => `   • ${k}: ${pul(v)} so'm`)
      .join("\n");

    const matn =
      `📊 <b>PROMAX · KUNLIK YAKUNIY HISOBOT</b>\n` +
      `📅 <b>Sana: ${kun} (${soat})</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 <b>SAVDO:</b>\n` +
      `   • Jami savdo: <b>${pul(savdoUZS)} so'm</b>${savdoUSD > 0 ? ` | <b>${formatUsd(savdoUSD)}</b>` : ""}\n` +
      `   • Kassaga tushdi: <b>${pul(naqdUZS)} so'm</b>${naqdUSD > 0 ? ` | <b>${formatUsd(naqdUSD)}</b>` : ""}\n` +
      `   • Qarzga berildi: <b>${pul(qarzBerildiUZS)} so'm</b>${qarzBerildiUSD > 0 ? ` | <b>${formatUsd(qarzBerildiUSD)}</b>` : ""}\n\n` +
      `💳 <b>ESKI QARZDAN TUSHUM:</b>\n` +
      `   • Qaytarilgan qarz: <b>${pul(eskiQarzTushdiUZS)} so'm</b>${eskiQarzTushdiUSD > 0 ? ` | <b>${formatUsd(eskiQarzTushdiUSD)}</b>` : ""}\n\n` +
      `🧾 <b>XARAJATLAR (RASXOD):</b>\n` +
      `   • Jami chiqim: <b>${pul(rasxodUZS)} so'm</b>${rasxodUSD > 0 ? ` | <b>${formatUsd(rasxodUSD)}</b>` : ""}\n` +
      (katMatn ? `${katMatn}\n` : ``) +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>KASSALAR JORIY HOLATI:</b>\n` +
      `${kassaMatn}\n\n` +
      `📱 <i>Batafsil ro'yxat va filtrlash — Mini App ilovasida.</i>`;

    // Adminlarni va guruhni yig'ish
    const targets = new Set<string>();
    if (GROUP_CHAT_ID) targets.add(String(GROUP_CHAT_ID).trim());

    const { data: adminlar } = await supabase.from("xodimlar").select("telegram_id").eq("rol", "admin").eq("faol", true);
    adminlar?.forEach((a) => {
      if (a.telegram_id) targets.add(String(a.telegram_id).trim());
    });

    for (const chatId of targets) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: matn,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📄 PDF shaklida yuklash", callback_data: `dl_daily_pdf:${targetDateStr}` },
              ],
            ],
          },
        }),
      });
    }

    console.log("Kunlik hisobot yuborildi:", targetDateStr);
    return res.status(200).json({ ok: true, message: "Report sent" });
  } catch (err: any) {
    console.error("Hisobot yuborishda xatolik:", err);
    return res.status(500).json({ error: err.message });
  }
}
