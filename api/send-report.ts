import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function pul(n: number): string {
  return Math.round(n || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "BOT_TOKEN sozlanmagan" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      boshlanishSana,
      tugashSana,
      hisobotTuri = "hammasi",
      telegram_user_id,
      yuborishJoyi = "shaxsiy",
    } = body;

    if (!boshlanishSana || !tugashSana) {
      return res.status(400).json({ error: "Sana oralig'i ko'rsatilmadi" });
    }

    const startIso = `${boshlanishSana}T00:00:00Z`;
    const endIso = `${tugashSana}T23:59:59Z`;

    // 1. Savdolar
    const { data: savdolar, error: savdoErr } = await supabase
      .from("savdolar")
      .select("*, mijoz:mijozlar(nom, telefon)")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: true });

    if (savdoErr) throw savdoErr;

    // 2. Rasxodlar
    const { data: rasxodlar, error: rasxodErr } = await supabase
      .from("rasxodlar")
      .select("*")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: true });

    if (rasxodErr) throw rasxodErr;

    // 3. Qarz to'lovlari
    const { data: qarzTolovlari, error: qarzErr } = await supabase
      .from("qarz_tolovlari")
      .select("*, mijoz:mijozlar(nom, telefon)")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: true });

    if (qarzErr) throw qarzErr;

    // 4. Kassa qoldiqlari
    const { data: kassaBalans } = await supabase.from("view_kassa_balans").select("*");

    // Hisob-kitoblar
    let jamiSavdoUZS = 0, jamiSavdoUSD = 0;
    let tushganNaqdUZS = 0, tushganNaqdUSD = 0;
    let berilganQarzUZS = 0, berilganQarzUSD = 0;

    savdolar?.forEach((s) => {
      const jami = Number(s.jami_summa || 0);
      const tolangan = Number(s.tolangan_summa || 0);
      const qarz = Number(s.qarz_summa || 0);

      if (s.valyuta === "USD") {
        jamiSavdoUSD += jami;
        tushganNaqdUSD += tolangan;
        berilganQarzUSD += qarz;
      } else {
        jamiSavdoUZS += jami;
        tushganNaqdUZS += tolangan;
        berilganQarzUZS += qarz;
      }
    });

    let jamiChiqimUZS = 0, jamiChiqimUSD = 0;
    const rasxodKategoriyaMap: Record<string, number> = {};

    rasxodlar?.forEach((r) => {
      const s = Number(r.summa || 0);
      if (r.valyuta === "USD") {
        jamiChiqimUSD += s;
      } else {
        jamiChiqimUZS += s;
        rasxodKategoriyaMap[r.kategoriya] = (rasxodKategoriyaMap[r.kategoriya] || 0) + s;
      }
    });

    let qaytganQarzUZS = 0, qaytganQarzUSD = 0;
    qarzTolovlari?.forEach((q) => {
      const s = Number(q.summa || 0);
      if (q.valyuta === "USD") qaytganQarzUSD += s;
      else qaytganQarzUZS += s;
    });

    const kassaMap: Record<string, number> = {};
    kassaBalans?.forEach((k) => {
      kassaMap[k.kassa_turi] = Number(k.joriy_balans || 0);
    });

    // Excel yaratish
    const wb = XLSX.utils.book_new();

    // 1-VARAQ: Xulosa
    const xulosaData = [
      ["PROMAX B2B STORE - MOLIYAVIY HISOBOT"],
      ["Davr:", `${boshlanishSana} dan ${tugashSana} gacha`],
      ["Tuzilgan vaqt:", new Date().toLocaleString("ru-RU")],
      [],
      ["KO'RSATKICH", "SO'M (UZS)", "DOLLAR (USD)"],
      ["Jami Savdo aylanmasi", jamiSavdoUZS, jamiSavdoUSD],
      ["Kassaga kelib tushgan to'lovlar", tushganNaqdUZS, tushganNaqdUSD],
      ["Mijozlarga berilgan qarz (nasiya)", berilganQarzUZS, berilganQarzUSD],
      ["Eski qarzlardan qaytgan to'lov", qaytganQarzUZS, qaytganQarzUSD],
      ["Jami Xarajatlar (Chiqim)", jamiChiqimUZS, jamiChiqimUSD],
      ["Sof Kassa Farqi (Tushum - Chiqim)", (tushganNaqdUZS + qaytganQarzUZS) - jamiChiqimUZS, (tushganNaqdUSD + qaytganQarzUSD) - jamiChiqimUSD],
      [],
      ["XARAJATLAR TAQSIMOTI (KATEGORIYALAR BO'YICHA):"],
      ...Object.entries(rasxodKategoriyaMap).map(([kat, sum]) => [kat, sum]),
      [],
      ["JORIY KASSA QOLDIG'I:"],
      ["Naqd so'm kassasi", kassaMap["naqd_uzs"] || 0],
      ["Naqd dollar kassasi", kassaMap["naqd_usd"] || 0],
      ["Plastik karta kassasi", kassaMap["plastik_uzs"] || 0],
      ["Bank hisob raqami", kassaMap["bank_uzs"] || 0],
    ];
    const wsXulosa = XLSX.utils.aoa_to_sheet(xulosaData);
    XLSX.utils.book_append_sheet(wb, wsXulosa, "Umumiy Xulosa");

    // 2-VARAQ: Savdolar (agar tanlangan bo'lsa)
    if (hisobotTuri === "hammasi" || hisobotTuri === "savdolar") {
      const savdoQatorlari = (savdolar || []).map((s) => ({
        "Chek #": s.raqam ? `#${s.raqam}` : "-",
        "Sana va Vaqt": new Date(s.sana_vaqt).toLocaleString("ru-RU"),
        "Mijoz": s.mijoz?.nom || "Noma'lum xaridor",
        "Telefon": s.mijoz?.telefon || "-",
        "Xodim": s.xodim || "-",
        "Jami Summa": Number(s.jami_summa || 0),
        "To'langan": Number(s.tolangan_summa || 0),
        "Qarz (Nasiya)": Number(s.qarz_summa || 0),
        "Valyuta": s.valyuta,
        "To'lov turi": s.tolov_turi || "-",
        "Kassa": s.kassa_turi || "-",
        "Holat": s.holat,
        "Izoh": s.izoh || "",
      }));
      const wsSavdo = XLSX.utils.json_to_sheet(savdoQatorlari);
      XLSX.utils.book_append_sheet(wb, wsSavdo, "Savdolar");
    }

    // 3-VARAQ: Xarajatlar (agar tanlangan bo'lsa)
    if (hisobotTuri === "hammasi" || hisobotTuri === "chiqimlar") {
      const rasxodQatorlari = (rasxodlar || []).map((r) => ({
        "ID": r.id,
        "Sana va Vaqt": new Date(r.sana_vaqt).toLocaleString("ru-RU"),
        "Kategoriya": r.kategoriya,
        "Summa": Number(r.summa || 0),
        "Valyuta": r.valyuta,
        "To'lov turi": r.tolov_turi || "-",
        "Kassa": r.kassa_turi || "-",
        "Xodim": r.xodim || "-",
        "Izoh": r.izoh || "",
      }));
      const wsRasxod = XLSX.utils.json_to_sheet(rasxodQatorlari);
      XLSX.utils.book_append_sheet(wb, wsRasxod, "Xarajatlar");
    }

    // 4-VARAQ: Qarz To'lovlari (agar tanlangan bo'lsa)
    if (hisobotTuri === "hammasi" || hisobotTuri === "qarzlar") {
      const qarzQatorlari = (qarzTolovlari || []).map((q) => ({
        "ID": q.id,
        "Sana va Vaqt": new Date(q.sana_vaqt).toLocaleString("ru-RU"),
        "Mijoz": q.mijoz?.nom || "Noma'lum",
        "Telefon": q.mijoz?.telefon || "-",
        "Summa": Number(q.summa || 0),
        "Valyuta": q.valyuta,
        "To'lov turi": q.tolov_turi || "-",
        "Kassa": q.kassa_turi || "-",
        "Xodim": q.xodim || "-",
        "Izoh": q.izoh || "",
      }));
      const wsQarz = XLSX.utils.json_to_sheet(qarzQatorlari);
      XLSX.utils.book_append_sheet(wb, wsQarz, "Qarz To'lovlari");
    }

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const filename = `PROMAX_Hisobot_${boshlanishSana}_${tugashSana}.xlsx`;

    // Telegram Caption
    const caption =
      `📊 <b>PROMAX MOLIYAVIY HISOBOT (EXCEL)</b>\n` +
      `📅 <b>Davr:</b> ${boshlanishSana} dan ${tugashSana} gacha\n\n` +
      `🛒 <b>Jami Savdo:</b> ${pul(jamiSavdoUZS)} so'm ${jamiSavdoUSD > 0 ? `| $${pul(jamiSavdoUSD)}` : ""}\n` +
      `💵 <b>Kassaga Tushum:</b> ${pul(tushganNaqdUZS)} so'm ${tushganNaqdUSD > 0 ? `| $${pul(tushganNaqdUSD)}` : ""}\n` +
      `⏳ <b>Nasiya (Qarz):</b> ${pul(berilganQarzUZS)} so'm ${berilganQarzUSD > 0 ? `| $${pul(berilganQarzUSD)}` : ""}\n` +
      `💳 <b>Eski Qarzlardan:</b> ${pul(qaytganQarzUZS)} so'm ${qaytganQarzUSD > 0 ? `| $${pul(qaytganQarzUSD)}` : ""}\n` +
      `💸 <b>Jami Chiqim:</b> ${pul(jamiChiqimUZS)} so'm ${jamiChiqimUSD > 0 ? `| $${pul(jamiChiqimUSD)}` : ""}\n\n` +
      `📎 <i>To'liq tafsilotlar ilova qilingan Excel faylida jamlangan.</i>`;

    // Qayerga yuborish: Foydalanuvchiga yoki Guruhga
    let targetChatId = GROUP_CHAT_ID;
    let yuborildiJoy = "Guruhga";

    if (yuborishJoyi === "shaxsiy" && telegram_user_id) {
      targetChatId = String(telegram_user_id);
      yuborildiJoy = "Shaxsiy Telegramingizga";
    }

    const sendDoc = async (chatId: string) => {
      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      formData.append("document", blob, filename);

      const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
        method: "POST",
        body: formData,
      });
      return await resp.json();
    };

    let tgRes = await sendDoc(targetChatId);

    // Agar shaxsiy chatga yuborishda xato bo'lsa (masalan foydalanuvchi botga /start bosmagan bo'lsa), guruhga yuboramiz
    if (!tgRes.ok && targetChatId !== GROUP_CHAT_ID && GROUP_CHAT_ID) {
      console.warn("Shaxsiy chatga yuborilmadi, guruhga yuborilmoqda:", tgRes.description);
      tgRes = await sendDoc(GROUP_CHAT_ID);
      yuborildiJoy = "Guruhga (shaxsiy botingiz faol bo'lmagani uchun)";
    }

    if (!tgRes.ok) {
      throw new Error(tgRes.description || "Telegramga fayl yuborishda xatolik yuz berdi");
    }

    return res.status(200).json({
      ok: true,
      message: `Hisobot ${yuborildiJoy} muvaffaqiyatli yuborildi!`,
      jamiSavdoUZS,
      jamiSavdoUSD,
      tushganNaqdUZS,
      jamiChiqimUZS,
      berilganQarzUZS,
      qaytganQarzUZS,
      savdolarSoni: savdolar?.length || 0,
      chiqimlarSoni: rasxodlar?.length || 0,
    });
  } catch (err: any) {
    console.error("send-report xatosi:", err);
    return res.status(500).json({ error: err.message || "Server xatosi" });
  }
}
