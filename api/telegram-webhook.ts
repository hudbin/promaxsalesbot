// netlify/functions/telegram-webhook.ts
// PROMAX B2B TELEGRAM WEBHOOK: GEMINI AI VOICE/TEXT PARSER + SUPABASE

import { createClient } from "@supabase/supabase-js";

// Muhit o'zgaruvchilari
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI_API_KEYS = Array.from(
  new Set(
    [
      ...(process.env.GEMINI_API_KEYS || "").split(","),
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_BACKUP,
    ]
      .map((k) => k?.trim())
      .filter(Boolean)
  )
) as string[];
const GEMINI_API_KEY = GEMINI_API_KEYS[0] || "";
const GEMINI_MODELS = Array.from(
  new Set(
    [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      process.env.GEMINI_MODEL,
      "gemini-3.8-flash",
      "gemini-2.5-flash",
    ].filter(Boolean)
  )
) as string[];
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

// Yordamchi: Markdown formatdagi matnni Telegram HTML ga xavfsiz o'tkazish
function formatTelegramHtml(text: string): string {
  if (!text) return "";
  let out = text;

  // 1. **qalin** yoki __qalin__ -> <b>qalin</b>
  out = out.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.*?)__/g, "<b>$1</b>");

  // 2. ```kod``` -> <pre>kod</pre>
  out = out.replace(/```(?:html|sql|json)?\s*([\s\S]*?)```/gi, "<pre>$1</pre>");

  // 3. `kod` -> <code>kod</code>
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. *qiya* -> <i>qiya</i> (so'z boshida yoki qator boshida)
  out = out.replace(/(?<=^|\s)\*([^*]+)\*(?=\s|$|[.,!?:])/g, "<i>$1</i>");

  // 5. > Iqtibos (Quote) -> <blockquote>Iqtibos</blockquote>
  out = out.replace(/^>\s?(.*)$/gm, "<blockquote>$1</blockquote>");

  return out;
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

Quyidagi 5 ta amal turidan birini aniqlang:
1. "savdo": Mahsulot sotildi yoki mijozga tovar berildi.
2. "rasxod": Xarajat qilindi (ovqatlanish/tushlik/obed, taksi, elektr, ijara, ro'zg'or, oylik va h.k.).
3. "qarz_tolov": Mijoz eski qarzini to'ladi / qaytardi.
4. "tovar_kirim": Omborga yangi tovar keldi, kirim qilindi yoki mahsulot qoldig'i kiritildi.
5. "savol": Foydalanuvchi bazadagi holat, hisobot, qarzlar, qoldiqlarga doir ma'lumot so'ramoqda (tranzaksiya kiritmayapti).

JSON strukturasi 1-4 amallar uchun:
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

JSON strukturasi "savol" amali uchun (Buxgalteriya bazasidan javob qidirish):
{
  "amal": "savol",
  "sql": "SELECT ... FROM ...",
  "izoh": "Siz yaratgan so'rov nimani anglatishini qisqacha izohi"
}

Agar "savol" bo'lsa, javob topish uchun Postgres SQL (SELECT) yozishingiz SHART. Jadvallar tuzilishi:
- tovarlar (id, nom, model, birlik, tannarx, narx_optom, valyuta, qoldiq, faol)
- mijozlar (id, nom, telefon, qarz_uzs, qarz_usd)
- savdolar (id, raqam, sana_vaqt, mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa)
- rasxodlar (id, sana_vaqt, summa, valyuta, kategoriya, izoh)
- qarz_tolovlari (id, sana_vaqt, mijoz_id, summa, valyuta)

Qoidalar:
- Faqat va faqat SELECT so'rov yozing. So'rovni 1 qatorda, ikki qo'shtirnoq ichiga olib yozing.
- Hozirgi vaqtni olish uchun \`now()\` yoki \`CURRENT_DATE\` ishlating.
- Agar valyuta aytilmasa yoki "so'm", "ming", "mln" bo'lsa -> valyuta: "UZS", kassa_turi: "naqd_uzs" (agar plastik aytilmasa).
- Agar "dollar", "$", "yashil" aytilsa -> valyuta: "USD", kassa_turi: "naqd_usd".
- Agar savdoda qarzga berilgan bo'lsa, tolangan_summa = naqd berilgani, qolgani avtomatik qarz bo'ladi.
- Agar "obedga 60 ming ketdi" yoki "ovqatlanishga 60 ming ketdi" deyilsa: amal: "rasxod", kategoriya: "Ovqatlanish", jami_summa: 60000, valyuta: "UZS", kassa_turi: "naqd_uzs".
- Agar "Akrom akaga 50 ta velikan 100 dollarga berdim, 40 dollar berdi" bo'lsa: amal: "savdo", mijoz_nomi: "Akrom aka", valyuta: "USD", jami_summa: 100, tolangan_summa: 40, tolov_turi: "naqd", kassa_turi: "naqd_usd", qatorlar: [{"nom": "velikan", "soni": 50, "narx": 2}].
- Agar omborga tovar kelgani, kirim bo'lgani, yangi tovar qo'shilishi aytilsa:
  amal: "tovar_kirim", tovar_nomi: "...", soni: 200, tannarx: 1.5, narx_optom: 2.0, valyuta: "USD", birlik: "dona", jami_summa: 300.
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

  return await callGeminiJson(contents);
}

// Yordamchi: Gemini API ga so'rov yuborish (Ko'p akkauntli va barcha modellar bo'yicha zaxira bilan)
async function callGeminiRaw(contents: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (GEMINI_API_KEYS.length === 0) {
    return {
      ok: false,
      error: "Google Gemini API kaliti (GEMINI_API_KEY) kiritilmagan. Iltimos, Netlify Environment Variables ga qo'shing.",
    };
  }

  let oxirgiXato = "";

  // 1-bosqich: Eng yaxshi modeldan boshlab tekshiramiz
  for (const model of GEMINI_MODELS) {
    // 2-bosqich: Har bir model uchun 1-kalit, keyin 2-zaxira kalitni sinab ko'ramiz
    for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex++) {
      const apiKey = GEMINI_API_KEYS[keyIndex];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        });

        const data = await resp.json();
        if (data?.error) {
          const errMsg = data.error.message || JSON.stringify(data.error);
          oxirgiXato = errMsg;
          console.warn(`[Gemini Fallback] Model ${model} (Kalit #${keyIndex + 1}) xato berdi (${resp.status}): ${errMsg}`);
          continue;
        }

        const javob = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (javob) {
          return { ok: true, text: javob };
        }
      } catch (e: any) {
        oxirgiXato = e?.message || "Ulanish xatosi";
        console.warn(`[Gemini Fallback] Model ${model} (Kalit #${keyIndex + 1}) ulanish xatosi:`, oxirgiXato);
      }
    }
  }

  return {
    ok: false,
    error: oxirgiXato || "Barcha Gemini API kalitlari va zaxira modellari band yoki limit tugagan.",
  };
}

// JSON qaytaruvchi yordamchi
async function callGeminiJson(contents: any[]): Promise<{ ok: boolean; data?: any; error?: string }> {
  const res = await callGeminiRaw(contents);
  if (!res.ok || !res.text) {
    return { ok: false, error: res.error };
  }

  try {
    const tozalangan = res.text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(tozalangan);
    return { ok: true, data: parsed };
  } catch (err: any) {
    return { ok: false, error: "AI javobini JSON formatida o'qib bo'lmadi: " + res.text };
  }
}

// Yordamchi: Gemini'dan tabiiy tilda javob olish (Text-to-Text)
async function geminiTabiiyJavob(prompt: string): Promise<string> {
  const res = await callGeminiRaw([{ parts: [{ text: prompt }] }]);
  if (!res.ok || !res.text) {
    return "Kechirasiz, sun'iy intellekt tahlil qilishda qiyinchilikka uchradi: " + (res.error || "");
  }
  return res.text;
}

// -----------------------------------------------------------------------------
// WEBHOOK ASOSIY HANDLER
// -----------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res.status(200).send("Promax Bot Webhook Active on Vercel");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let update: any;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).send("Invalid JSON");
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
        return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
    }
  }

  // 2. MATN, OVOZ YOKI KONTAKT KELGANDA
  const message = update.message;
  if (!message) return res.status(200).send("No message");
  if (message.from?.is_bot) return res.status(200).send("OK");

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
      return res.status(200).send("OK");
    } else {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `❌ <i>Admin paroli noto'g'ri.</i>`,
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
        return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
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
    return res.status(200).send("OK");
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
    return res.status(200).send("OK");
  }

  // 2.4 RUXSATLI XODIM BUYRUQLARI
  if (text === "/start") {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `👋 <b>Assalomu alaykum, ${perm.xodim?.ism || senderName}!</b>\n🎭 Roli: <b>${perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>\n\nPROMAX Savdo va Kassa tizimi faol. Siz bu yerda:\n🎙 <b>Ovozli xabar</b> yoki matn orqali tezkor savdo, xarajat va tovar kirimlarini yozishingiz mumkin.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"</i> (Savdo)\n• <i>"Murodjon aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)\n\n⚙️ <i>Tizim holatini tekshirish:</i> /status`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return res.status(200).send("OK");
  }

  if (text === "/status" || text === "/tekshir") {
    let botUsername = "Faol";
    try {
      const me = await tgPost("getMe", {});
      if (me?.result?.username) {
        botUsername = `@${me.result.username}`;
      }
    } catch {}

    const isGeminiSet = GEMINI_API_KEYS.length > 0;
    const isSupabaseSet = !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
    const isGroupSet = !!GROUP_CHAT_ID;

    const statusMsg = `🔍 <b>PROMAX TIZIM HOLATI:</b>\n\n` +
      `🤖 <b>Telegram Bot:</b> ✅ Faol (${botUsername})\n` +
      `👤 <b>Sizning profilingiz:</b> ✅ Ruxsat berilgan (${perm.role === "admin" ? "👑 Admin" : "💼 Sotuvchi"})\n` +
      `🆔 <b>Telegram ID:</b> <code>${senderId}</code>\n` +
      `🧠 <b>Google Gemini AI:</b> ${isGeminiSet ? `✅ Ulangan (${GEMINI_API_KEYS.length} ta API kalit, ${GEMINI_MODELS.length} ta zaxira model)` : "❌ Kiritilmagan (GEMINI_API_KEY yo'q)"}\n` +
      `🗄 <b>Supabase Baza:</b> ${isSupabaseSet ? "✅ Ulangan" : "❌ Kiritilmagan (SUPABASE_URL yo'q)"}\n` +
      `👥 <b>Guruh xabarnomasi:</b> ${isGroupSet ? `✅ Guruh ID: <code>${GROUP_CHAT_ID}</code>` : "⚠️ Sozlanmagan"}\n\n` +
      (!isGeminiSet ? `⚠️ <i>Gemini AI ishlashi uchun aistudio.google.com dan bepul kalit olib Netlify'ga qo'shing.</i>` : `✅ AI ovozli va matnli xabarlarni qabul qilishga tayyor! (Kunlik limitlar himoyalangan)`);

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: statusMsg,
      parse_mode: "HTML",
    });
    return res.status(200).send("OK");
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
        return res.status(200).send("OK");
      }
    } catch (err: any) {
      console.error("Audio yuklash xatosi:", err);
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Ovozli xabarni yuklashda xatolik: ${err?.message || err}`,
      });
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
    }

    const parsedData = geminiRes.data;

    if (parsedData && parsedData.amal === "savol") {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `🔍 <i>Tahlil qilinmoqda...</i>\n<code>${parsedData.izoh || "Ma'lumotlar o'qilmoqda"}</code>`,
        parse_mode: "HTML",
      });

      try {
        let cleanSql = (parsedData.sql || "")
          .replace(/```sql/gi, "")
          .replace(/```/g, "")
          .trim();

        // Oxiridagi nuqta-vergul (;) larni tozalash (subquery xato bermasligi uchun)
        while (cleanSql.endsWith(";")) {
          cleanSql = cleanSql.slice(0, -1).trim();
        }

        if (!cleanSql.toLowerCase().startsWith("select") && !cleanSql.toLowerCase().startsWith("with")) {
          throw new Error("Xavfsizlik cheklovi: faqat SELECT so'rovlariga ruxsat berilgan.");
        }

        const { data: dbResult, error: dbErr } = await supabase.rpc("fn_execute_readonly_sql", {
          sql_query: cleanSql,
        });

        if (dbErr) throw dbErr;

        const answerPrompt = `Siz PROMAX ulgurji do'koni uchun professional buxgalter-tahlilchi AIsiz.
Foydalanuvchi savoli: "${text}"
Bazadan (PostgreSQL) olingan ma'lumotlar: ${JSON.stringify(dbResult || [])}

JAVOBNI TELEGRAM CHATI UCHUN JUDA CHIROYLI, ESTETIK VA TARTIBLI FORMATLANG:
1. EMOJILARDAN UNUMLI VA MAZMUNLI FOYDALANING:
   - 📦 Tovarlar va ombor mahsulotlari
   - 💰, 💵 Narxlar, summalar va kassa
   - ⚠️ Kamomad, minus qoldiq yoki katta qarz ogohlantirishlari
   - 📊 Statistika, xulosa va hisobotlar
   - 👤 Mijozlar va sotuvchilar
   - 📈, 📉 O'sish yoki pasayish
2. TELEGRAM HTML FORMATIDAN FOYDALANING:
   - Sarlavha va asosiy nomlar: <b>Qalin matn</b>
   - Barcha raqamlar, sonlar va summalar: <code>180 dona</code>, <code>55 000 so'm</code>, <code>$25</code>
   - Qo'shimcha tushuntirish va izohlar: <i>Qiya matn</i>
   - Muhim ogohlantirishlar (masalan minus qoldiq, qarzdorlik) va yakuniy xulosalar: <blockquote>⚠️ Ogohlantirish yoki asosiy xulosa matni</blockquote>
3. Ro'yxatni chiroyli tartiblang, har bir band orasida qator tashlang.
4. Markdown (** yoki *) belgilarini ishlatmang, faqat toza Telegram HTML (<b>, <i>, <code>, <blockquote>) ishlating.`;

        const finalAns = await geminiTabiiyJavob(answerPrompt);
        const formattedHtml = formatTelegramHtml(finalAns);

        const sendRes = await tgPost("sendMessage", {
          chat_id: chatId,
          text: formattedHtml,
          parse_mode: "HTML",
        });

        // Agar HTML teglarda kutilmagan xato bo'lsa, xavfsiz holda oddiy matn qilib yuboramiz
        if (!sendRes?.ok) {
          await tgPost("sendMessage", {
            chat_id: chatId,
            text: finalAns,
          });
        }
      } catch (err: any) {
        console.error("AI SQL xatosi:", err);
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `❌ <b>Tahlil qilishda xatolik:</b>\n<code>${err.message}</code>\n\n<i>Maslahat:</i> Savolni soddaroq yoki boshqa so'zlar bilan berib ko'ring (masalan: <i>"Bugun qancha savdo bo'ldi?"</i> yoki <i>"Qaysi mijozlar qarzdor?"</i>).`,
          parse_mode: "HTML",
        });
      }
      return res.status(200).send("OK");
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
      return res.status(200).send("OK");
    } else {
      // Moliyaviy amal aniqlanmadi
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `🤖 <b>Xabardan moliyaviy yoki ombor amali aniqlanmadi.</b>\n\nIltimos, aniqroq yozing yoki gapiring.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Akrom akaga 50 ta velikan 100$ ga berdim, 40$ naqd berdi"</i> (Savdo)\n• <i>"Murod aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)`,
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }
  }

  return res.status(200).send("OK");
}
