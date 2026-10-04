// netlify/functions/telegram-webhook.ts
// PROMAX B2B TELEGRAM WEBHOOK: GEMINI AI VOICE/TEXT PARSER + SUPABASE

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Muhit o'zgaruvchilari
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Yordamchi: Telegram API ga xabar yuborish
async function tgPost(method: string, body: Record<string, any>) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// Yordamchi: Pulni chiroyli formatlash (1 500 000)
function pul(n: number): string {
  return Math.round(n || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

// -----------------------------------------------------------------------------
// GEMINI AI TAHLILCHISI (O'zbek tilidagi matn va audio xabarlar)
// -----------------------------------------------------------------------------
async function geminiTahlil(matn: string, audioBase64?: string, mimeType?: string) {
  const prompt = `
Siz ulgurji va chakana savdo (B2B) do'koni uchun buxgalter yordamchi AI hisoblanasiz.
Foydalanuvchi do'kon sotuvchisi yoki rahbari (40+ yosh). Ular sizga o'zbek tilida (lotin yoki kirill) matn yoki ovozli xabar yuboradi.

Xabardan tranzaksiyani aniqlab, FAQAT toza JSON formatida javob bering. Hech qanday markdown (\`\`\`json) yoki ortiqcha so'z qo'shmang!

Quyidagi 3 ta amal turidan birini aniqlang:
1. "savdo": Mahsulot sotildi yoki mijozga tovar berildi.
2. "rasxod": Xarajat qilindi (obed/tushlik, taksi, elektr, ijara, ro'zg'or, oylik va h.k.).
3. "qarz_tolov": Mijoz eski qarzini to'ladi / qaytardi.

JSON strukturasi quyidagicha bo'lishi SHART:
{
  "amal": "savdo" | "rasxod" | "qarz_tolov",
  "valyuta": "UZS" | "USD",
  "jami_summa": 0.0,
  "tolangan_summa": 0.0,
  "tolov_turi": "naqd" | "plastik" | "perechisleniya",
  "kassa_turi": "naqd_uzs" | "naqd_usd" | "plastik_uzs" | "bank_uzs",
  "mijoz_nomi": "Mijoz ismi yoki do'koni" (agar savdo yoki qarz to'lovi bo'lsa, aks holda null),
  "kategoriya": "Obed" | "Taksi" | "Elektr" | "Ijara" | "Oylik" | "Boshqa" (agar rasxod bo'lsa),
  "izoh": "Qisqa tushuntirish",
  "qatorlar": [
    {
      "nom": "Tovar nomi",
      "soni": 1.0,
      "narx": 0.0
    }
  ]
}

Qoidalar:
- Agar valyuta aytilmasa yoki "so'm", "ming", "mln" bo'lsa -> valyuta: "UZS", kassa_turi: "naqd_uzs" (agar plastik aytilmasa).
- Agar "dollar", "$", "yashil" aytilsa -> valyuta: "USD", kassa_turi: "naqd_usd".
- Agar savdoda qarzga berilgan bo'lsa, tolangan_summa = naqd berilgani, qolgani avtomatik qarz bo'ladi.
- Agar "obedga 60 ming ketdi" deyilsa: amal: "rasxod", kategoriya: "Obed", jami_summa: 60000, valyuta: "UZS", kassa_turi: "naqd_uzs".
- Agar "Akrom akaga 50 ta velikan 100 dollarga berdim, 40 dollar berdi" bo'lsa: amal: "savdo", mijoz_nomi: "Akrom aka", valyuta: "USD", jami_summa: 100, tolangan_summa: 40, tolov_turi: "naqd", kassa_turi: "naqd_usd", qatorlar: [{"nom": "velikan", "soni": 50, "narx": 2}].
`;

  const contents: any[] = [];
  const parts: any[] = [{ text: prompt }];

  if (audioBase64 && mimeType) {
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: audioBase64,
      },
    });
  } else if (matn) {
    parts.push({ text: `Foydalanuvchi xabari: "${matn}"` });
  }

  contents.push({ parts });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  const data = await resp.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Gemini JSON parse xatosi:", rawText);
    return null;
  }
}

// -----------------------------------------------------------------------------
// WEBHOOK ASOSIY HANDLER
// -----------------------------------------------------------------------------
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST" || !event.body) {
    return { statusCode: 200, body: "Promax Bot Webhook Active" };
  }

  let update: any;
  try {
    update = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // 1. TUGMA BOSILGANDA (CALLBACK QUERY - TASDIQLASH / BEKOR QILISH)
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data || "";
    const chatId = cq.message?.chat?.id;
    const msgId = cq.message?.message_id;
    const fromName = `${cq.from?.first_name || ""} ${cq.from?.last_name || ""}`.trim() || "Xodim";

    if (data.startsWith("cf:")) {
      // Tasdiqlash bosildi
      const draftId = data.replace("cf:", "");
      // Supabase'dan vaqtinchalik qoralama tranzaksiyani olish
      const { data: draft } = await supabase
        .from("tranzaksiya_qoralama")
        .select("*")
        .eq("id", draftId)
        .single();

      if (!draft) {
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bu amal muddati o'tgan yoki topilmadi." });
        return { statusCode: 200, body: "OK" };
      }

      const p = draft.malumot;
      let javobMatn = "";

      if (p.amal === "rasxod") {
        await supabase.rpc("fn_rasxod_yaratish", {
          p_summa: p.jami_summa,
          p_valyuta: p.valyuta || "UZS",
          p_kategoriya: p.kategoriya || "Boshqa",
          p_tolov_turi: p.tolov_turi || "naqd",
          p_kassa_turi: p.kassa_turi || "naqd_uzs",
          p_izoh: p.izoh || "",
          p_xodim: fromName,
          p_telegram_user_id: cq.from?.id,
        });
        javobMatn = `✅ <b>RASXOD SAQLANDI</b>\n\n💵 Summa: <b>${pul(p.jami_summa)} ${p.valyuta}</b>\n📂 Kategoriya: <b>${p.kategoriya}</b>\n✍️ Kiritdi: <b>${fromName}</b>`;
      } else if (p.amal === "qarz_tolov") {
        // Mijozni topish yoki yaratish
        let mijozId = null;
        if (p.mijoz_nomi) {
          const { data: m } = await supabase
            .from("mijozlar")
            .select("id")
            .ilike("nom", `%${p.mijoz_nomi}%`)
            .limit(1)
            .single();
          mijozId = m?.id;
        }

        if (mijozId) {
          await supabase.rpc("fn_qarz_tolov_yaratish", {
            p_mijoz_id: mijozId,
            p_summa: p.jami_summa,
            p_valyuta: p.valyuta || "UZS",
            p_tolov_turi: p.tolov_turi || "naqd",
            p_kassa_turi: p.kassa_turi || "naqd_uzs",
            p_izoh: p.izoh || "",
            p_xodim: fromName,
            p_telegram_user_id: cq.from?.id,
          });
          javobMatn = `✅ <b>QARZ TO'LOVI QABUL QILINDI</b>\n\n👤 Mijoz: <b>${p.mijoz_nomi}</b>\n💵 Summa: <b>${pul(p.jami_summa)} ${p.valyuta}</b>\n✍️ Qabul qildi: <b>${fromName}</b>`;
        } else {
          javobMatn = `⚠️ Mijoz topilmadi (${p.mijoz_nomi}). Iltimos, mijozlar bo'limidan tekshiring.`;
        }
      } else if (p.amal === "savdo") {
        // Savdo
        let mijozId = null;
        if (p.mijoz_nomi) {
          const { data: m } = await supabase
            .from("mijozlar")
            .select("id")
            .ilike("nom", `%${p.mijoz_nomi}%`)
            .limit(1)
            .single();
          mijozId = m?.id;
        }

        await supabase.rpc("fn_savdo_yaratish", {
          p_mijoz_id: mijozId,
          p_valyuta: p.valyuta || "UZS",
          p_tolangan: p.tolangan_summa || 0,
          p_tolov_turi: p.tolov_turi || "naqd",
          p_kassa_turi: p.kassa_turi || "naqd_uzs",
          p_izoh: p.izoh || "",
          p_xodim: fromName,
          p_telegram_user_id: cq.from?.id,
          p_qatorlar: p.qatorlar || [],
        });

        const qarz = Math.max(0, (p.jami_summa || 0) - (p.tolangan_summa || 0));
        javobMatn = `✅ <b>SAVDO SAQLANDI</b>\n\n👤 Mijoz: <b>${p.mijoz_nomi || "Chakana"}</b>\n💰 Jami: <b>${pul(p.jami_summa)} ${p.valyuta}</b>\n💵 To'landi: <b>${pul(p.tolangan_summa)} ${p.valyuta}</b>\n📝 Qarzga: <b>${pul(qarz)} ${p.valyuta}</b>\n✍️ Sotuvchi: <b>${fromName}</b>`;
      }

      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: javobMatn,
        parse_mode: "HTML",
      });

      // Guruhga ham xabar yuborish
      if (GROUP_CHAT_ID && String(GROUP_CHAT_ID) !== String(chatId)) {
        await tgPost("sendMessage", {
          chat_id: GROUP_CHAT_ID,
          text: javobMatn,
          parse_mode: "HTML",
        });
      }

      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Muvaffaqiyatli saqlandi!" });
      return { statusCode: 200, body: "OK" };
    }

    if (data.startsWith("cn:")) {
      // Bekor qilish
      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: "❌ <i>Amal bekor qilindi. Baza o'zgartirilmadi.</i>",
        parse_mode: "HTML",
      });
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bekor qilindi" });
      return { statusCode: 200, body: "OK" };
    }
  }

  // 2. MATN YOKI OVOZLI XABAR KELGANDA
  const message = update.message;
  if (!message) return { statusCode: 200, body: "No message" };

  const chatId = message.chat.id;
  const text = message.text || message.caption || "";
  const voice = message.voice || message.audio;

  // Buyruqlar (/start, /hisobot)
  if (text === "/start") {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `👋 <b>Assalomu alaykum! PROMAX Savdo va Kassa tizimiga xush kelibsiz.</b>\n\nSiz bu yerda:\n🎙 <b>Ovozli xabar</b> yoki matn orqali tezkor savdo va xarajatlarni yozishingiz mumkin.\n\n<i>Masalan:</i>\n• "Obedga 75 ming naqd ketdi"\n• "Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"\n• "Murodjon aka 500$ qarzini berdi"\n\nPastdagi menyu orqali Mini App ilovasini ochishingiz mumkin.`,
      parse_mode: "HTML",
    });
    return { statusCode: 200, body: "OK" };
  }

  // Ovozli yoki Moliyaviy matn kelganda -> Gemini AI ga uzatish
  let parsedData: any = null;

  if (voice) {
    await tgPost("sendMessage", { chat_id: chatId, text: "🎙 <i>Ovoz eshitilmoqda va tahlil qilinmoqda...</i>", parse_mode: "HTML" });
    try {
      // Telegramdan audio faylni yuklab olish
      const fileInfo = await tgPost("getFile", { file_id: voice.file_id });
      const filePath = fileInfo.result?.file_path;
      if (filePath) {
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        const audioRes = await fetch(fileUrl);
        const arrayBuffer = await audioRes.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        parsedData = await geminiTahlil("", base64Audio, voice.mime_type || "audio/ogg");
      }
    } catch (err) {
      console.error("Audio yuklash xatosi:", err);
    }
  } else if (text && !text.startsWith("/")) {
    parsedData = await geminiTahlil(text);
  }

  if (parsedData && parsedData.amal) {
    // Vaqtinchalik qoralama sifatida saqlash (UUID bilan)
    const draftId = Math.random().toString(36).substring(2, 10);
    await supabase.from("tranzaksiya_qoralama").insert({
      id: draftId,
      malumot: parsedData,
      yaratildi: new Date().toISOString(),
    });

    // 1-bosqichli Tasdiqlash Kartochkasi
    let preview = "";
    if (parsedData.amal === "rasxod") {
      preview = `🧾 <b>XARAJAT (RASXOD) ANIQLANDI</b>\n\n` +
        `💵 Summa: <b>${pul(parsedData.jami_summa)} ${parsedData.valyuta}</b>\n` +
        `📂 Kategoriya: <b>${parsedData.kategoriya || "Boshqa"}</b>\n` +
        `💳 To'lov: <b>${parsedData.tolov_turi || "Naqd"}</b>\n` +
        (parsedData.izoh ? `💬 Izoh: ${parsedData.izoh}\n` : "");
    } else if (parsedData.amal === "qarz_tolov") {
      preview = `💳 <b>QARZ TO'LOVI ANIQLANDI</b>\n\n` +
        `👤 Mijoz: <b>${parsedData.mijoz_nomi || "Noma'lum"}</b>\n` +
        `💵 To'lov: <b>${pul(parsedData.jami_summa)} ${parsedData.valyuta}</b>\n` +
        `💳 Kassa: <b>${parsedData.tolov_turi || "Naqd"}</b>\n`;
    } else if (parsedData.amal === "savdo") {
      const qarz = Math.max(0, (parsedData.jami_summa || 0) - (parsedData.tolangan_summa || 0));
      preview = `🛒 <b>SAVDO ANIQLANDI</b>\n\n` +
        `👤 Mijoz: <b>${parsedData.mijoz_nomi || "Chakana"}</b>\n` +
        `💰 Jami: <b>${pul(parsedData.jami_summa)} ${parsedData.valyuta}</b>\n` +
        `💵 Naqd to'landi: <b>${pul(parsedData.tolangan_summa)} ${parsedData.valyuta}</b>\n` +
        `📝 Qarzga: <b>${pul(qarz)} ${parsedData.valyuta}</b>\n`;
    }

    preview += `\n<i>Ma'lumot to'g'ri bo'lsa, tasdiqlang:</i>`;

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: preview,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `cf:${draftId}` },
            { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
          ],
        ],
      },
    });
    return { statusCode: 200, body: "OK" };
  }

  return { statusCode: 200, body: "OK" };
};
