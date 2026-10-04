// netlify/functions/telegram-webhook.ts
// PROMAX B2B TELEGRAM WEBHOOK: GEMINI AI VOICE/TEXT PARSER + SUPABASE

import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Muhit o'zgaruvchilari
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID || "";
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "";
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "promax2026";

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

// Yordamchi: Telefon raqamni standart formatga keltirish (+998901234567)
function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    if (digits.length === 12 && digits.startsWith("998")) {
      digits = "+" + digits;
    } else if (digits.length === 9) {
      digits = "+998" + digits;
    } else {
      digits = "+" + digits;
    }
  }
  return digits;
}

// Yordamchi: Foydalanuvchi ruxsatini tekshirish
async function checkUserPermission(
  telegramId?: number | string
): Promise<{ isAllowed: boolean; role: string; xodim?: any }> {
  if (!telegramId) return { isAllowed: false, role: "" };
  const idStr = String(telegramId);

  // 1. Netlify muhit o'zgaruvchisidagi ADMIN_TELEGRAM_ID
  if (ADMIN_TELEGRAM_ID) {
    const adminIds = ADMIN_TELEGRAM_ID.split(",").map((s) => s.trim());
    if (adminIds.includes(idStr)) {
      return { isAllowed: true, role: "admin" };
    }
  }

  // 2. Supabase xodimlar jadvali
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const numId = Number(telegramId);
      const { data: x } = await supabase
        .from("xodimlar")
        .select("*")
        .eq("telegram_id", !isNaN(numId) ? numId : telegramId)
        .eq("faol", true)
        .maybeSingle();

      if (x) {
        return { isAllowed: true, role: x.rol || "sotuvchi", xodim: x };
      }
    } catch (e) {
      console.error("Xodim ruxsatini tekshirish xatosi:", e);
    }
  }

  return { isAllowed: false, role: "" };
}

// -----------------------------------------------------------------------------
// GEMINI AI TAHLILCHISI (O'zbek tilidagi matn va audio xabarlar)
// -----------------------------------------------------------------------------
async function geminiTahlil(
  matn: string,
  audioBase64?: string,
  mimeType?: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!GEMINI_API_KEY) {
    return {
      ok: false,
      error: "Google Gemini API kaliti (GEMINI_API_KEY) kiritilmagan. Iltimos, Netlify Environment Variables ga qo'shing.",
    };
  }

  const prompt = `
Siz ulgurji va chakana savdo (B2B) do'koni uchun buxgalter yordamchi AI hisoblanasiz.
Foydalanuvchi do'kon sotuvchisi yoki rahbari (40+ yosh). Ular sizga o'zbek tilida (lotin yoki kirill) matn yoki ovozli xabar yuboradi.

Xabardan tranzaksiyani aniqlab, FAQAT toza JSON formatida javob bering. Hech qanday markdown (\`\`\`json) yoki ortiqcha so'z qo'shmang!

Quyidagi 4 ta amal turidan birini aniqlang:
1. "savdo": Mahsulot sotildi yoki mijozga tovar berildi.
2. "rasxod": Xarajat qilindi (ovqatlanish/tushlik/obed, taksi, elektr, ijara, ro'zg'or, oylik va h.k.).
3. "qarz_tolov": Mijoz eski qarzini to'ladi / qaytardi.
4. "tovar_kirim": Omborga yangi tovar keldi, kirim qilindi yoki mahsulot qoldig'i kiritildi.

JSON strukturasi quyidagicha bo'lishi SHART:
{
  "amal": "savdo" | "rasxod" | "qarz_tolov" | "tovar_kirim",
  "valyuta": "UZS" | "USD",
  "jami_summa": 0.0,
  "tolangan_summa": 0.0,
  "tolov_turi": "naqd" | "plastik" | "perechisleniya",
  "kassa_turi": "naqd_uzs" | "naqd_usd" | "plastik_uzs" | "bank_uzs",
  "mijoz_nomi": "Mijoz ismi yoki do'koni" (agar savdo yoki qarz to'lovi bo'lsa, aks holda null),
  "kategoriya": "Ovqatlanish" | "Taksi" | "Elektr" | "Ijara" | "Oylik" | "Boshqa" (agar rasxod bo'lsa),
  "tovar_nomi": "Tovar nomi" (agar tovar_kirim bo'lsa),
  "soni": 0.0 (agar tovar_kirim bo'lsa),
  "tannarx": 0.0 (agar tovar_kirim bo'lsa),
  "narx_optom": 0.0 (agar tovar_kirim bo'lsa),
  "birlik": "dona" | "metr" | "pachka" | "kg" (agar tovar_kirim bo'lsa, default: "dona"),
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
- Agar "obedga 60 ming ketdi" yoki "ovqatlanishga 60 ming ketdi" deyilsa: amal: "rasxod", kategoriya: "Ovqatlanish", jami_summa: 60000, valyuta: "UZS", kassa_turi: "naqd_uzs".
- Agar "Akrom akaga 50 ta velikan 100 dollarga berdim, 40 dollar berdi" bo'lsa: amal: "savdo", mijoz_nomi: "Akrom aka", valyuta: "USD", jami_summa: 100, tolangan_summa: 40, tolov_turi: "naqd", kassa_turi: "naqd_usd", qatorlar: [{"nom": "velikan", "soni": 50, "narx": 2}].
- Agar omborga tovar kelgani, kirim bo'lgani, yangi tovar qo'shilishi aytilsa (masalan: "Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5 dollar, sotish narxi 2 dollar"):
  amal: "tovar_kirim", tovar_nomi: "Velikan uzun", soni: 200, tannarx: 1.5, narx_optom: 2.0, valyuta: "USD", birlik: "dona", jami_summa: 300.
`;

  const contents: any[] = [];
  const parts: any[] = [{ text: prompt }];

  if (audioBase64) {
    // Telegram audio formati: toza audio/ogg
    const cleanMimeType = (mimeType || "audio/ogg").split(";")[0].trim();
    parts.push({
      inlineData: {
        mimeType: cleanMimeType,
        data: audioBase64,
      },
    });
  } else if (matn) {
    parts.push({ text: `Foydalanuvchi xabari: "${matn}"` });
  }

  contents.push({ parts });

  let lastError = "";

  // 3 martagacha qayta urinish (agar serverda vaqtinchalik yuklama bo'lsa)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      const data = await resp.json();
      if (data?.error) {
        const errMsg = data.error.message || JSON.stringify(data.error);
        lastError = errMsg;
        const isRetryable =
          errMsg.toLowerCase().includes("high demand") ||
          resp.status === 503 ||
          resp.status === 429;

        if (isRetryable && attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 1500));
          continue;
        }
        return { ok: false, error: errMsg };
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return { ok: true, data: parsed };
    } catch (e: any) {
      lastError = e?.message || "Bog'lanish xatosi";
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1200));
        continue;
      }
    }
  }

  return { ok: false, error: lastError || "Google AI serverlarida vaqtinchalik yuqori yuklama. Iltimos, yana bir bor urinib ko'ring." };
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
      } else if (p.amal === "tovar_kirim") {
        // Omborga tovar kirimi / yangi tovar qo'shish
        const tovarNomi = (p.tovar_nomi || "").trim();
        if (!tovarNomi) {
          javobMatn = `⚠️ Tovar nomi aniqlanmadi.`;
        } else {
          const { data: mavjud } = await supabase
            .from("tovarlar")
            .select("*")
            .ilike("nom", tovarNomi)
            .limit(1)
            .maybeSingle();

          let yangiQoldiq = p.soni || 0;

          if (mavjud) {
            yangiQoldiq = (mavjud.qoldiq || 0) + (p.soni || 0);
            await supabase
              .from("tovarlar")
              .update({
                qoldiq: yangiQoldiq,
                tannarx: p.tannarx > 0 ? p.tannarx : mavjud.tannarx,
                narx_optom: p.narx_optom > 0 ? p.narx_optom : mavjud.narx_optom,
                valyuta: p.valyuta || mavjud.valyuta,
                faol: true,
              })
              .eq("id", mavjud.id);

            javobMatn = `✅ <b>OMBORGA TOVAR QO'SHILDI</b>\n\n` +
              `📦 Tovar: <b>${mavjud.nom}</b>\n` +
              `➕ Kirim soni: <b>+${p.soni} ${p.birlik || mavjud.birlik || "dona"}</b>\n` +
              `📊 Ombordagi yangi qoldiq: <b>${yangiQoldiq} ${mavjud.birlik || "dona"}</b>\n` +
              (p.tannarx > 0 ? `💲 Yangi tannarx: <b>${pul(p.tannarx)} ${p.valyuta || mavjud.valyuta}</b>\n` : "") +
              (p.narx_optom > 0 ? `💰 Yangi sotish narxi: <b>${pul(p.narx_optom)} ${p.valyuta || mavjud.valyuta}</b>\n` : "") +
              `✍️ Kiritdi: <b>${fromName}</b>`;
          } else {
            await supabase.from("tovarlar").insert({
              nom: tovarNomi,
              model: p.model || tovarNomi,
              birlik: p.birlik || "dona",
              qoldiq: p.soni || 0,
              tannarx: p.tannarx || 0,
              narx_optom: p.narx_optom || 0,
              valyuta: p.valyuta || "UZS",
              faol: true,
            });

            javobMatn = `✅ <b>YANGI TOVAR OMBORGA KIRITILDI</b>\n\n` +
              `📦 Tovar: <b>${tovarNomi}</b>\n` +
              `🔢 Soni: <b>${p.soni} ${p.birlik || "dona"}</b>\n` +
              (p.tannarx > 0 ? `💲 Tannarx: <b>${pul(p.tannarx)} ${p.valyuta}</b>\n` : "") +
              (p.narx_optom > 0 ? `💰 Sotish (optom) narxi: <b>${pul(p.narx_optom)} ${p.valyuta}</b>\n` : "") +
              `✍️ Kiritdi: <b>${fromName}</b>`;
          }
        }
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

    // 1.2 XODIM RUXSATINI TASDIQLASH (xod:appr:draftId:role)
    if (data.startsWith("xod:appr:")) {
      const parts = data.split(":");
      const draftId = parts[2];
      const role = parts[3] || "sotuvchi";

      const { data: draft } = await supabase
        .from("tranzaksiya_qoralama")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();

      if (!draft || !draft.malumot) {
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
        return { statusCode: 200, body: "OK" };
      }

      const req = draft.malumot;

      // xodimlar jadvaliga qo'shish yoki yangilash
      const { data: mavjudXodim } = await supabase
        .from("xodimlar")
        .select("id")
        .or(`telegram_id.eq.${req.telegram_id},telefon.eq.${req.telefon}`)
        .maybeSingle();

      if (mavjudXodim) {
        await supabase
          .from("xodimlar")
          .update({
            telegram_id: req.telegram_id,
            ism: req.ism,
            telefon: req.telefon,
            telegram_username: req.username || null,
            rol: role,
            faol: true,
          })
          .eq("id", mavjudXodim.id);
      } else {
        await supabase.from("xodimlar").insert({
          telegram_id: req.telegram_id,
          ism: req.ism,
          telefon: req.telefon,
          telegram_username: req.username || null,
          rol: role,
          faol: true,
        });
      }

      // Admindagi xabarni yangilash
      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: `✅ <b>Xodim tasdiqlandi!</b>\n\n👤 <b>Ism:</b> ${req.ism} ${req.username || ""}\n📞 <b>Tel:</b> <code>${req.telefon}</code>\n🎭 <b>Roli:</b> <b>${role === "admin" ? "👑 Admin" : "💼 Sotuvchi"}</b>\n✍️ <b>Tasdiqladi:</b> ${fromName}`,
        parse_mode: "HTML",
      });

      // Xodimning o'ziga xushxabar yuborish
      await tgPost("sendMessage", {
        chat_id: req.telegram_id,
        text: `🎉 <b>Assalomu alaykum, ${req.ism}!</b>\n\nAdministrator sizga PROMAX tizimidan foydalanish uchun ruxsat berdi.\n🎭 Sizning rolingiz: <b>${role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>.\n\nEndi botga ovozli/matnli xabar yuborishingiz yoki do'kon Mini App ilovasidan to'liq foydalanishingiz mumkin!`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true },
      });

      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xodim muvaffaqiyatli qabul qilindi!" });
      return { statusCode: 200, body: "OK" };
    }

    // 1.3 XODIM RUXSATINI RAD ETISH (xod:rej:draftId)
    if (data.startsWith("xod:rej:")) {
      const parts = data.split(":");
      const draftId = parts[2];

      const { data: draft } = await supabase
        .from("tranzaksiya_qoralama")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();

      if (draft && draft.malumot) {
        await tgPost("sendMessage", {
          chat_id: draft.malumot.telegram_id,
          text: `❌ <b>Kechirasiz, administrator ruxsat so'rovingizni rad etdi.</b>\n\nSavollar bo'lsa, do'kon ma'muriyati bilan bog'laning.`,
          parse_mode: "HTML",
        });
      }

      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: `❌ <i>Xodimning ruxsat so'rovi rad etildi.</i>`,
        parse_mode: "HTML",
      });
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Rad etildi" });
      return { statusCode: 200, body: "OK" };
    }
  }

  // 2. MATN, OVOZ YOKI KONTAKT KELGANDA
  const message = update.message;
  if (!message) return { statusCode: 200, body: "No message" };

  const chatId = message.chat.id;
  const fromUser = message.from;
  const senderId = fromUser?.id;
  const senderName = `${fromUser?.first_name || ""} ${fromUser?.last_name || ""}`.trim() || "Foydalanuvchi";
  const senderUsername = fromUser?.username ? `@${fromUser.username}` : "";
  const text = (message.text || message.caption || "").trim();
  const voice = message.voice || message.audio;
  const contact = message.contact;

  // 2.1 BOSH ADMIN BOOTSTRAP PAROLI (/admin_parol <parol>)
  if (text.startsWith("/admin_parol")) {
    const kiritilganParol = text.replace(/^\/admin_parol(@\w+)?/i, "").trim();
    if (kiritilganParol && kiritilganParol === ADMIN_SECRET_KEY) {
      const numSenderId = Number(senderId);
      const { data: mavjud } = await supabase
        .from("xodimlar")
        .select("id")
        .eq("telegram_id", !isNaN(numSenderId) ? numSenderId : senderId)
        .maybeSingle();

      if (mavjud) {
        await supabase
          .from("xodimlar")
          .update({ ism: senderName, telegram_username: senderUsername, rol: "admin", faol: true })
          .eq("id", mavjud.id);
      } else {
        await supabase.from("xodimlar").insert({
          telegram_id: !isNaN(numSenderId) ? numSenderId : senderId,
          ism: senderName,
          telegram_username: senderUsername,
          rol: "admin",
          faol: true,
        });
      }

      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `👑 <b>Tabriklaymiz, ${senderName}!</b>\n\nAdmin paroli to'g'ri tasdiqlandi. Siz PROMAX tizimida <b>Bosh Administrator</b> sifatida ro'yxatdan o'tdingiz!\n\nEndi bot orqali va Mini App'da barcha funksiyalar (kassa, ombor, xodimlarni tasdiqlash) siz uchun ochiq.\n🆔 Sizning Telegram ID: <code>${senderId}</code>`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true },
      });
      return { statusCode: 200, body: "OK" };
    } else {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `❌ <i>Admin paroli noto'g'ri.</i>`,
        parse_mode: "HTML",
      });
      return { statusCode: 200, body: "OK" };
    }
  }

  // 2.2 KONTAKT (TELEFON RAQAM) KELGANDA
  if (contact) {
    const phone = normalizePhone(contact.phone_number);
    const last9 = phone.slice(-9);
    const numSenderId = Number(senderId);

    // 1. Allaqachon telegram_id bo'yicha mavjudmi?
    const { data: borXodim } = await supabase
      .from("xodimlar")
      .select("*")
      .eq("telegram_id", !isNaN(numSenderId) ? numSenderId : senderId)
      .maybeSingle();

    if (borXodim) {
      if (borXodim.faol) {
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Siz allaqachon tizimda ro'yxatdan o'tgansiz!</b>\n\n👤 Ism: <b>${borXodim.ism}</b>\n🎭 Roli: <b>${borXodim.rol === "admin" ? "👑 Admin" : "💼 Sotuvchi"}</b>\n\nOvozli yoki matnli xabarlar yuborishingiz va Mini App'dan to'liq foydalanishingiz mumkin.`,
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
      } else {
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `⛔️ <b>Sizning profilingiz administrator tomonidan to'xtatilgan.</b>\n\nQayta faollashtirish uchun do'kon ma'muriyatiga murojaat qiling.\n🆔 Sizning ID: <code>${senderId}</code>`,
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
      }
      return { statusCode: 200, body: "OK" };
    }

    // 2. Admin oldindan kiritib qo'ygan telefon raqam bormi?
    const { data: matched } = await supabase
      .from("xodimlar")
      .select("*")
      .or(`telefon.eq.${phone},telefon.ilike.%${last9}`)
      .maybeSingle();

    if (matched) {
      if (!matched.faol) {
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `⛔️ <b>Ushbu telefon raqamiga tegishli profil administrator tomonidan to'xtatilgan.</b>\n\nQayta faollashtirish uchun ma'muriyatga murojaat qiling.`,
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
        return { statusCode: 200, body: "OK" };
      }

      // Bog'lash va faollashtirish
      await supabase
        .from("xodimlar")
        .update({
          telegram_id: !isNaN(numSenderId) ? numSenderId : senderId,
          telegram_username: senderUsername,
          faol: true,
        })
        .eq("id", matched.id);

      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `🎉 <b>Xush kelibsiz, ${matched.ism}!</b>\n\nTelefon raqamingiz (<code>${phone}</code>) orqali shaxsingiz muvaffaqiyatli tasdiqlandi!\n🎭 Roli: <b>${matched.rol === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>.\n\nEndi bot va do'kon Mini App'idan to'liq foydalanishingiz mumkin!`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true },
      });
      return { statusCode: 200, body: "OK" };
    }

    // 3. Notanish raqam -> Bazaga so'rov yozish va barcha Adminlarga xabar yuborish
    const draftId = `xod_${Math.random().toString(36).substring(2, 9)}`;
    await supabase.from("tranzaksiya_qoralama").insert({
      id: draftId,
      malumot: {
        amal: "xodim_sorov",
        telegram_id: senderId,
        ism: senderName,
        telefon: phone,
        username: senderUsername,
      },
      yaratildi: new Date().toISOString(),
    });

    const adminMsg = `🔔 <b>YANGI XODIM TIZIMGA KIRISHGA RUXSAT SO'RAMOQDA:</b>\n\n` +
      `👤 <b>Ismi:</b> ${senderName} ${senderUsername}\n` +
      `📞 <b>Telefon:</b> <code>${phone}</code>\n` +
      `🆔 <b>Telegram ID:</b> <code>${senderId}</code>\n\n` +
      `<i>Ushbu xodimga qanday rol bermoqchisiz?</i>`;

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "💼 Sotuvchi sifatida qabul qilish", callback_data: `xod:appr:${draftId}:sotuvchi` },
        ],
        [
          { text: "👑 Admin sifatida qabul qilish", callback_data: `xod:appr:${draftId}:admin` },
        ],
        [
          { text: "❌ Rad etish", callback_data: `xod:rej:${draftId}` },
        ],
      ],
    };

    // Barcha adminlarning Telegram ID larini yig'ish (Env + Supabase xodimlar)
    const adminTargets = new Set<string>();

    if (ADMIN_TELEGRAM_ID) {
      ADMIN_TELEGRAM_ID.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((id) => adminTargets.add(id));
    }

    try {
      const { data: dbAdmins } = await supabase
        .from("xodimlar")
        .select("telegram_id")
        .eq("rol", "admin")
        .eq("faol", true);

      if (dbAdmins) {
        for (const a of dbAdmins) {
          if (a.telegram_id) {
            adminTargets.add(String(a.telegram_id));
          }
        }
      }
    } catch (err) {
      console.error("DB adminlarni olishda xato:", err);
    }

    // Agar tizimda umuman bitta ham admin yo'q bo'lsa
    if (adminTargets.size === 0 && !GROUP_CHAT_ID) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>Tizimda hali administrator tayinlanmagan.</b>\n\nAgar siz do'kon egasi bo'lsangiz, botga <code>/admin_parol promax2026</code> buyrug'ini yuboring va bosh administrator huquqini oling.`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true },
      });
      return { statusCode: 200, body: "OK" };
    }

    // Barcha adminlarga tasdiqlash xabarnomasini yuborish
    for (const aId of adminTargets) {
      try {
        await tgPost("sendMessage", {
          chat_id: aId,
          text: adminMsg,
          parse_mode: "HTML",
          reply_markup: adminKeyboard,
        });
      } catch (err) {
        console.error(`Adminga (${aId}) yuborishda xato:`, err);
      }
    }

    // Guruhga yuborish (agar guruh sozlangan bo'lsa)
    if (GROUP_CHAT_ID) {
      try {
        await tgPost("sendMessage", {
          chat_id: GROUP_CHAT_ID,
          text: adminMsg,
          parse_mode: "HTML",
          reply_markup: adminKeyboard,
        });
      } catch (err) {
        console.error("Guruhga yuborishda xato:", err);
      }
    }

    // Xodimga xabar
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `⏳ <b>Ruxsat so'rovingiz qabul qilindi!</b>\n\nTelefon raqamingiz (<code>${phone}</code>) administratorga yuborildi. Administrator tasdiqlashi bilan sizga xabar keladi.`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return { statusCode: 200, body: "OK" };
  }

  // 2.3 FOYDALANUVCHI RUXSATINI TEKSHIRISH (WHITELIST CHECK)
  const perm = await checkUserPermission(senderId);

  // Agar ruxsati bo'lmasa -> Kirishni to'xtatish va kontakt so'rash
  if (!perm.isAllowed) {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `⛔️ <b>Assalomu alaykum! PROMAX Savdo va Kassa tizimiga xush kelibsiz.</b>\n\nUshbu tizim faqat ro'yxatdan o'tgan do'kon xodimlari uchun mo'ljallangan.\n\nKirish uchun quyidagi <b>"📲 Telefon raqamimni yuborish"</b> tugmasini bosing yoki administrator bilan bog'laning.\n\n🆔 <i>Sizning Telegram ID:</i> <code>${senderId}</code>\n🔑 <i>Agar bosh admin bo'lsangiz: <code>/admin_parol &lt;parol&gt;</code> buyrug'ini yuboring.</i>`,
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          [{ text: "📲 Telefon raqamimni yuborish (Ruxsat olish)", request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return { statusCode: 200, body: "OK" };
  }

  // 2.4 RUXSATLI XODIM BUYRUQLARI
  if (text === "/start") {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `👋 <b>Assalomu alaykum, ${perm.xodim?.ism || senderName}!</b>\n🎭 Roli: <b>${perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>\n\nPROMAX Savdo va Kassa tizimi faol. Siz bu yerda:\n🎙 <b>Ovozli xabar</b> yoki matn orqali tezkor savdo, xarajat va tovar kirimlarini yozishingiz mumkin.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"</i> (Savdo)\n• <i>"Murodjon aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)\n\n⚙️ <i>Tizim holatini tekshirish:</i> /status`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return { statusCode: 200, body: "OK" };
  }

  if (text === "/status" || text === "/tekshir") {
    let botUsername = "Faol";
    try {
      const me = await tgPost("getMe", {});
      if (me?.result?.username) {
        botUsername = `@${me.result.username}`;
      }
    } catch {}

    const isGeminiSet = !!GEMINI_API_KEY && GEMINI_API_KEY.length > 5;
    const isSupabaseSet = !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
    const isGroupSet = !!GROUP_CHAT_ID;

    const statusMsg = `🔍 <b>PROMAX TIZIM HOLATI:</b>\n\n` +
      `🤖 <b>Telegram Bot:</b> ✅ Faol (${botUsername})\n` +
      `👤 <b>Sizning profilingiz:</b> ✅ Ruxsat berilgan (${perm.role === "admin" ? "👑 Admin" : "💼 Sotuvchi"})\n` +
      `🆔 <b>Telegram ID:</b> <code>${senderId}</code>\n` +
      `🧠 <b>Google Gemini AI:</b> ${isGeminiSet ? `✅ Ulangan (${GEMINI_MODEL})` : "❌ Kiritilmagan (GEMINI_API_KEY yo'q)"}\n` +
      `🗄 <b>Supabase Baza:</b> ${isSupabaseSet ? "✅ Ulangan" : "❌ Kiritilmagan (SUPABASE_URL yo'q)"}\n` +
      `👥 <b>Guruh xabarnomasi:</b> ${isGroupSet ? `✅ Guruh ID: <code>${GROUP_CHAT_ID}</code>` : "⚠️ Sozlanmagan"}\n\n` +
      (!isGeminiSet ? `⚠️ <i>Gemini AI ishlashi uchun aistudio.google.com dan bepul kalit olib Netlify'ga qo'shing.</i>` : `✅ AI ovozli va matnli xabarlarni qabul qilishga tayyor!`);

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: statusMsg,
      parse_mode: "HTML",
    });
    return { statusCode: 200, body: "OK" };
  }

  // Ovozli yoki Moliyaviy matn kelganda -> Gemini AI ga uzatish
  let geminiRes: { ok: boolean; data?: any; error?: string } | null = null;

  if (voice) {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: "🎙 <i>Ovoz eshitilmoqda va tahlil qilinmoqda...</i>",
      parse_mode: "HTML",
    });

    try {
      // Telegramdan audio faylni yuklab olish
      const fileInfo = await tgPost("getFile", { file_id: voice.file_id });
      const filePath = fileInfo.result?.file_path;
      if (filePath) {
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        const audioRes = await fetch(fileUrl);
        const arrayBuffer = await audioRes.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        geminiRes = await geminiTahlil("", base64Audio, voice.mime_type || "audio/ogg");
      } else {
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Ovozli faylni Telegramdan yuklab bo'lmadi.",
        });
        return { statusCode: 200, body: "OK" };
      }
    } catch (err: any) {
      console.error("Audio yuklash xatosi:", err);
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ovozli xabarni yuklashda xatolik: ${err?.message || err}`,
      });
      return { statusCode: 200, body: "OK" };
    }
  } else if (text && !text.startsWith("/")) {
    geminiRes = await geminiTahlil(text);
  }

  if (geminiRes) {
    if (!geminiRes.ok) {
      const isMissingKey = !GEMINI_API_KEY;
      const isHighDemand = geminiRes.error?.toLowerCase().includes("high demand") || geminiRes.error?.includes("503");

      let maslahat = "";
      if (isMissingKey) {
        maslahat = "<i>Eslatma:</i> aistudio.google.com dan bepul <b>GEMINI_API_KEY</b> olib, Netlify Dashboard -> Environment variables ga kiriting.";
      } else if (isHighDemand) {
        maslahat = "<i>Google serverlarida vaqtinchalik yuqori yuklama kuzatildi. Iltimos, 5-10 soniya kutib xabaringizni qayta yuboring.</i>";
      } else {
        maslahat = "<i>Iltimos, qayta urinib ko'ring yoki /status buyrug'ini tekshiring.</i>";
      }

      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>AI TAHLIL XATOSI:</b>\n${geminiRes.error}\n\n${maslahat}`,
        parse_mode: "HTML",
      });
      return { statusCode: 200, body: "OK" };
    }

    const parsedData = geminiRes.data;

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
      } else if (parsedData.amal === "tovar_kirim") {
        const jamiTannarx = (parsedData.soni || 0) * (parsedData.tannarx || 0);
        preview = `📦 <b>TOVAR KIRIMI (OMBOR) ANIQLANDI</b>\n\n` +
          `🏷 Tovar: <b>${parsedData.tovar_nomi || "Yangi tovar"}</b>\n` +
          `🔢 Kirim soni: <b>+${parsedData.soni || 0} ${parsedData.birlik || "dona"}</b>\n` +
          (parsedData.tannarx ? `💲 Tannarxi: <b>${pul(parsedData.tannarx)} ${parsedData.valyuta}</b>\n` : "") +
          (parsedData.narx_optom ? `💰 Sotish (optom) narxi: <b>${pul(parsedData.narx_optom)} ${parsedData.valyuta}</b>\n` : "") +
          (jamiTannarx > 0 ? `💵 Jami partiya tannarxi: <b>${pul(jamiTannarx)} ${parsedData.valyuta}</b>\n` : "") +
          (parsedData.izoh ? `💬 Izoh: ${parsedData.izoh}\n` : "");
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
    } else {
      // Moliyaviy amal aniqlanmadi
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `🤖 <b>Xabardan moliyaviy yoki ombor amali aniqlanmadi.</b>\n\nIltimos, aniqroq yozing yoki gapiring.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Akrom akaga 50 ta velikan 100$ ga berdim, 40$ naqd berdi"</i> (Savdo)\n• <i>"Murod aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)`,
        parse_mode: "HTML",
      });
      return { statusCode: 200, body: "OK" };
    }
  }

  return { statusCode: 200, body: "OK" };
};
