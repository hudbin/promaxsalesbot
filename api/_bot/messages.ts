import {
  getSupabase,
  supabase,
  tgPost,
  pul,
  normalizePhone,
  normalizeTolovTuri,
  formatTelegramHtml,
  ADMIN_SECRET_KEY,
  ADMIN_TELEGRAM_ID,
  GROUP_CHAT_ID,
  GEMINI_API_KEYS,
  GEMINI_MODELS,
  GEMINI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BOT_TOKEN,
} from "./config";
import {
  buildSavdoCard,
  buildRasxodCard,
  buildMultiRasxodCard,
  buildQarzTolovCard,
  buildVozvratCard,
  buildQarzEslatmaCard,
} from "./cards";
import {
  checkUserPermission,
  resolveSavdoEntities,
  resolveQarzTolovEntities,
  resolveQarzEslatmaEntities,
  runTovarlarniOptimallashtirish,
  buildOptimizationReport,
} from "./entities";
import { sendQarzdorlarPdf, sendMijozQarzPdf } from "./pdf";
import { geminiTahlil, geminiTabiiyJavob } from "./gemini";

export async function handleMessage(message: any, res: any): Promise<any> {
  const chatId = message.chat.id;
  const fromUser = message.from;
  const senderId = fromUser?.id;
  const senderName = `${fromUser?.first_name || ""} ${fromUser?.last_name || ""}`.trim() || "Foydalanuvchi";
  const senderUsername = fromUser?.username ? `@${fromUser.username}` : "";
  const text = (message.text || message.caption || "").trim();
  const voice = message.voice || message.audio;
  const contact = message.contact;

  // 1. BOSH ADMIN BOOTSTRAP PAROLI (/admin_parol <parol>)
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
        await getSupabase().from("xodimlar").insert({
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

  // 2. KONTAKT (TELEFON RAQAM) KELGANDA YOKI MATNDA FAQAT TELEFON RAQAM YUBORILGANDA
  let rawPhoneNumber = contact?.phone_number;
  if (!rawPhoneNumber && text && !text.startsWith("/")) {
    const hasLetters = /[a-zA-Zа-яА-ЯёЁўқғҳЎҚҒҲ]/i.test(text);
    if (!hasLetters) {
      const cleanDigits = text.replace(/[^\d+]/g, "");
      if (
        (cleanDigits.startsWith("+998") && cleanDigits.length === 13) ||
        (cleanDigits.startsWith("998") && cleanDigits.length === 12) ||
        (/^(90|91|93|94|95|97|98|99|33|88|77|50|55|71)\d{7}$/.test(cleanDigits))
      ) {
        rawPhoneNumber = cleanDigits;
      }
    }
  }

  if (rawPhoneNumber) {
    const phone = normalizePhone(rawPhoneNumber);
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
    await getSupabase().from("tranzaksiya_qoralama").insert({
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

    const adminTargets = new Set<string>();
    if (ADMIN_TELEGRAM_ID) {
      ADMIN_TELEGRAM_ID.split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .forEach((id: string) => adminTargets.add(id));
    }

    try {
      const { data: dbAdmins } = await supabase
        .from("xodimlar")
        .select("telegram_id")
        .eq("rol", "admin")
        .eq("faol", true);

      if (dbAdmins) {
        for (const a of dbAdmins) {
          if (a.telegram_id) adminTargets.add(String(a.telegram_id));
        }
      }
    } catch (err) {
      console.error("DB adminlarni olishda xato:", err);
    }

    if (adminTargets.size === 0 && !GROUP_CHAT_ID) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>Tizimda hali administrator tayinlanmagan.</b>\n\nAgar siz do'kon egasi bo'lsangiz, botga <code>/admin_parol promax2026</code> buyrug'ini yuboring va bosh administrator huquqini oling.`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true },
      });
      return res.status(200).send("OK");
    }

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

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `⏳ <b>Ruxsat so'rovingiz qabul qilindi!</b>\n\nTelefon raqamingiz (<code>${phone}</code>) administratorga yuborildi. Administrator tasdiqlashi bilan sizga xabar keladi.`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return res.status(200).send("OK");
  }

  // 3. FOYDALANUVCHI RUXSATINI TEKSHIRISH (WHITELIST CHECK)
  const perm = await checkUserPermission(senderId);

  if (!perm.isAllowed) {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `⛔️ <b>Assalomu alaykum! PROMAX Savdo va Kassa tizimiga xush kelibsiz.</b>\n\nUshbu tizim faqat ro'yxatdan o'tgan do'kon xodimlari uchun mo'ljallangan.\n\nKirish uchun quyidagi <b>"📲 Telefon raqamimni yuborish"</b> tugmasini bosing yoki o'z telefon raqamingizni yozib yuboring (masalan: <code>+998901234567</code>).\n\n🆔 <i>Sizning Telegram ID:</i> <code>${senderId}</code>\n🔑 <i>Agar bosh admin bo'lsangiz: <code>/admin_parol &lt;parol&gt;</code> buyrug'ini yuboring.</i>`,
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

  // 4. RUXSATLI XODIM BUYRUQLARI
  const isStartCmd = text === "/start" || text.startsWith("/start ") || text.startsWith("/start@");
  const isStatusCmd = text === "/status" || text.startsWith("/status ") || text.startsWith("/status@") || text === "/tekshir";

  if (isStartCmd) {
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `👋 <b>Assalomu alaykum, ${perm.xodim?.ism || senderName}!</b>\n🎭 Roli: <b>${perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>\n\nPROMAX Savdo va Kassa tizimi faol. Siz bu yerda:\n🎙 <b>Ovozli xabar</b> yoki matn orqali tezkor savdo, xarajat va tovar kirimlarini yozishingiz mumkin.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Tushlikka 50 ming, taksiga 30 ming, qadoqlashga 100 ming"</i> (Bir nechta xarajat)\n• <i>"Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"</i> (Savdo)\n• <i>"Murodjon aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Akrom akadan 20 ta velikan vozvrat bo'ldi"</i> (Tovar qaytarish)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)\n\n⚙️ <i>Tizim holatini tekshirish:</i> /status${perm.role === "admin" ? "\n📦 <i>Tovarlarni optimallashtirish (ranglarni modelga birlashtirish):</i> /optimallashtirish" : ""}`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return res.status(200).send("OK");
  }

  if (isStatusCmd) {
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
      (!isGeminiSet ? `⚠️ <i>Gemini AI ishlashi uchun aistudio.google.com dan bepul kalit olib Netlify/Vercel'ga qo'shing.</i>` : `✅ AI ovozli va matnli xabarlarni qabul qilishga tayyor! (Kunlik limitlar himoyalangan)`);

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: statusMsg,
      parse_mode: "HTML",
    });
    return res.status(200).send("OK");
  }

  // 5. TOVARLARNI OPTIMALLASHTIRISH (ADMIN)
  const normText = text.trim().toLowerCase();
  const isOptCmd =
    text === "/optimallashtirish" ||
    text === "/birlashtirish" ||
    text.startsWith("/optimallashtirish ") ||
    text.startsWith("/birlashtirish ") ||
    text === "/optimize" ||
    normText === "tovarlarni optimallashtir" ||
    normText === "tovarlarni birlashtir";

  if (isOptCmd) {
    if (perm.role !== "admin") {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "⛔️ <i>Kechirasiz, tovarlarni birlashtirish va optimallashtirish faqat administrator uchun ruxsat etilgan.</i>",
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }

    if (text.includes("confirm") || text.includes("tasdiq") || text.includes("hozir")) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "⏳ <b>Tovarlar bazasi tahlil qilinmoqda va birlashtirilmoqda...</b>\n\n<i>Har bir model bo'yicha ranglar qoldig'i hisoblanmoqda, iltimos kuting...</i>",
        parse_mode: "HTML",
      });

      const optResult = await runTovarlarniOptimallashtirish();
      const reportText = buildOptimizationReport(optResult);

      await tgPost("sendMessage", {
        chat_id: chatId,
        text: reportText,
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }

    const optConfirmMsg =
      `📦 <b>TOVARLAR BAZASINI OPTIMALLASHTIRISH</b>\n\n` +
      `Ushbu amal bazadagi bir xil modelga tegishli barcha turli rangdagi mahsulotlarni bitta asosiy modelga birlashtiradi:\n` +
      `• Har bir model bo'yicha jami ombor qoldig'i yig'iladi va asosiy mahsulot nomiga o'tkaziladi.\n` +
      `• Rangli dublikatlar arxivlanadi (<code>faol = false</code>).\n` +
      `• Tarixiy savdo cheklariga ziyon yetmaydi.\n\n` +
      `<i>Birlashtirishni boshlaymizmi?</i>`;

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: optConfirmMsg,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Ha, birlashtirilsin", callback_data: "opt:run" }],
          [{ text: "❌ Bekor qilish", callback_data: "cn:opt" }],
        ],
      },
    });
    return res.status(200).send("OK");
  }

  // 6. OVOZLI YOKI MATNLI XABARLARNI GEMINI AI ORQALI TAHLIL QILISH
  let geminiRes: { ok: boolean; data?: any; error?: string } | null = null;

  if (voice) {
    await tgPost("sendChatAction", { chat_id: chatId, action: "record_voice" });
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: "🎙 <i>Ovoz eshitilmoqda va tahlil qilinmoqda...</i>",
      parse_mode: "HTML",
    });

    try {
      const fileInfo = await tgPost("getFile", { file_id: voice.file_id });
      const filePath = fileInfo.result?.file_path;
      if (filePath) {
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        const audioRes = await fetch(fileUrl);
        const arrayBuffer = await audioRes.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        geminiRes = await geminiTahlil("", base64Audio, voice.mime_type || "audio/ogg", chatId);
        
        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "user",
          content: "[Ovozli xabar yuborildi]"
        });
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
    await tgPost("sendChatAction", { chat_id: chatId, action: "typing" });
    await getSupabase().from("ai_chat_history").insert({
      chat_id: chatId,
      role: "user",
      content: text
    });
    geminiRes = await geminiTahlil(text, undefined, undefined, chatId);
  }

  // 7. GEMINI JAVOBINI QAYTA ISHLASH
  if (geminiRes) {
    if (!geminiRes.ok) {
      const isMissingKey = !GEMINI_API_KEY;
      const isHighDemand = geminiRes.error?.toLowerCase().includes("high demand") || geminiRes.error?.includes("503");

      let maslahat = "";
      if (isMissingKey) {
        maslahat = "<i>Eslatma:</i> aistudio.google.com dan bepul <b>GEMINI_API_KEY</b> olib, Netlify/Vercel Dashboard -> Environment variables ga kiriting.";
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

    // 7.1 SAVOL / TAHLIL / SQL SO'ROVI
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

        while (cleanSql.endsWith(";")) {
          cleanSql = cleanSql.slice(0, -1).trim();
        }

        if (!cleanSql.toLowerCase().startsWith("select") && !cleanSql.toLowerCase().startsWith("with")) {
          throw new Error("Xavfsizlik cheklovi: faqat SELECT so'rovlariga ruxsat berilgan.");
        }

        let { data: dbResult, error: dbErr } = await getSupabase().rpc("fn_execute_readonly_sql", {
          sql_query: cleanSql,
        });

        if (dbErr) {
          console.warn("AI SQL xatosi, Gemini orqali qayta urinish:", dbErr.message);
          const fixPrompt = `Siz yozgan Postgres SQL so'rov xatolik berdi: "${dbErr.message}".
Foydalanuvchi savoli: "${text || "[Ovozli xabar]"}"
Noto'g'ri SQL: "${cleanSql}"

DIQQAT TIZIM QOIDALARI:
- savdolar jadvali ustunlari: (id, raqam, sana_vaqt, mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, kassa_turi, holat, xodim)
- Ustun nomi: tolov_turi ('naqd', 'plastik', 'perechisleniya')
- Do'konning bugungi savdo oboroti: "view_bugungi_hisobot" yoki "view_ai_xulosa"
- Kassa sandig'idagi naqd pul balansi: "view_kassa_balans"
Iltimos, FAQAT to'g'rilangan toza SELECT SQL yozing (hech qanday izohsiz, markdown'siz):`;

          const correctedSqlRaw = await geminiTabiiyJavob(fixPrompt);
          if (correctedSqlRaw) {
            let fixedSql = correctedSqlRaw.replace(/```(?:sql)?/gi, "").replace(/```/g, "").trim();
            while (fixedSql.endsWith(";")) fixedSql = fixedSql.slice(0, -1).trim();
            if (fixedSql.toLowerCase().startsWith("select") || fixedSql.toLowerCase().startsWith("with")) {
              const retryRun = await getSupabase().rpc("fn_execute_readonly_sql", { sql_query: fixedSql });
              if (!retryRun.error) {
                dbResult = retryRun.data;
                dbErr = null;
              }
            }
          }
        }

        if (dbErr) throw dbErr;

        const nowTashkentAns = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
        const bugunStrAns = nowTashkentAns.toISOString().slice(0, 10);
        const kechaDateAns = new Date(nowTashkentAns);
        kechaDateAns.setDate(kechaDateAns.getDate() - 1);
        const kechaStrAns = kechaDateAns.toISOString().slice(0, 10);

        const answerPrompt = `Siz PROMAX ulgurji do'koni uchun professional Shaxsiy Yordamchi (Personal Assistant) va buxgalter-tahlilchi AIsiz.
Foydalanuvchi savoli: "${text || "[Ovozli xabar]"}"
Bazadan (PostgreSQL) olingan ma'lumotlar: ${JSON.stringify(dbResult || [])}
Bugungi sana: ${bugunStrAns}, Kechagi sana: ${kechaStrAns}

DIQQAT:
- Agar bazadan ma'lumot bo'sh kelsa ([] yoki null bo'lsa):
  * Agar savol kechagi yoki ma'lum bir kundagi xarajatlar/savdolar haqida bo'lsa: "Kecha (${kechaStrAns}) kuni do'konda hech qanday xarajat (chiqim) kiritilmagan ekan." deb aniq tushuntiring.
  * Agar so'ralgan mijoz yoki tovar topilmagan bo'lsa: "Kechirasiz, so'ralgan mijoz/tovar nomi bo'yicha aniq moslik topilmadi." deb tushuntiring.
- Raqamlarni chiroyli va o'qishli formatda taqdim eting.
- Toza Telegram HTML (<b>, <i>, <code>, <blockquote>) ishlating.`;

        const finalAns = await geminiTabiiyJavob(answerPrompt);
        
        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: finalAns
        });

        const formattedHtml = formatTelegramHtml(finalAns);
        const sendRes = await tgPost("sendMessage", {
          chat_id: chatId,
          text: formattedHtml,
          parse_mode: "HTML",
        });

        if (!sendRes?.ok) {
          await tgPost("sendMessage", {
            chat_id: chatId,
            text: finalAns,
          });
        }

        // PDF talab qilingan bo'lsa
        const sqlLower = cleanSql.toLowerCase();
        const izohLower = (parsedData.izoh || "").toLowerCase();
        const textLower = (text || "").toLowerCase();
        const combinedQueryText = `${textLower} ${izohLower}`;

        const isMijozOrQarzQuery =
          parsedData.pdf_soraldi === true ||
          sqlLower.includes("fn_mijoz_qarz_tarixiy") ||
          sqlLower.includes("fn_ai_mijoz_qidirish") ||
          sqlLower.includes("mijozlar") ||
          sqlLower.includes("view_ai_qarzdorlar") ||
          sqlLower.includes("qarz_tolovlari") ||
          /qarz|qarzdor|hisobot|akt|sverka|pdf|fayl|mijoz/i.test(combinedQueryText);

        if (isMijozOrQarzQuery && !sqlLower.includes("view_ai_xulosa") && !sqlLower.includes("view_bugungi_hisobot")) {
          let topilganMijozId: string | null = null;
          if (Array.isArray(dbResult) && dbResult.length === 1) {
            const row = dbResult[0];
            if (row.mijoz_id) topilganMijozId = String(row.mijoz_id);
            else if (row.id && (row.qarz_uzs !== undefined || row.nom !== undefined || sqlLower.includes("mijoz"))) {
              topilganMijozId = String(row.id);
            } else if (row.nom && (row.qarz_uzs !== undefined || sqlLower.includes("mijoz"))) {
              topilganMijozId = String(row.nom);
            }
          } else if (Array.isArray(dbResult) && dbResult.length > 1) {
            const uniqueMijozIds = Array.from(new Set(dbResult.map((r: any) => r.mijoz_id).filter(Boolean)));
            if (uniqueMijozIds.length === 1) {
              topilganMijozId = String(uniqueMijozIds[0]);
            }
          }

          if (!topilganMijozId) {
            const fnHistMatch = cleanSql.match(/fn_mijoz_qarz_tarixiy(?:_nom)?\(\s*'([^']+)'/i);
            const fnMatch = cleanSql.match(/fn_ai_mijoz_qidirish\(\s*'([^']+)'\s*\)/i);
            const ilikeMatch = cleanSql.match(/nom\s+ILIKE\s+'%([^%']+)%'/i);
            if (fnHistMatch && fnHistMatch[1]) topilganMijozId = fnHistMatch[1].trim();
            else if (fnMatch && fnMatch[1]) topilganMijozId = fnMatch[1].trim();
            else if (ilikeMatch && ilikeMatch[1]) topilganMijozId = ilikeMatch[1].trim();
            else if (parsedData.mijoz_nomi) topilganMijozId = String(parsedData.mijoz_nomi).trim();
          }

          if (topilganMijozId) {
            const pdfTalabQilindi =
              parsedData.pdf_soraldi === true ||
              /pdf|fayl|akt|sverka|hujjat/i.test(combinedQueryText);

            if (pdfTalabQilindi || /qarz.*(akt|sverka|fayl)/i.test(combinedQueryText)) {
              await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
              await sendMijozQarzPdf(chatId, topilganMijozId, parsedData.sana_boshlanish, parsedData.sana_tugash);
            }
          } else if (
            sqlLower.includes("view_ai_qarzdorlar") ||
            (/pdf|fayl|hisobot|ro'yxat|royxat/i.test(combinedQueryText) && /qarz|qarzdor/i.test(combinedQueryText))
          ) {
            await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
            await sendQarzdorlarPdf(chatId);
          }
        }
      } catch (err: any) {
        console.error("AI SQL xatosi:", err);
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `❌ <b>Tahlil qilishda xatolik:</b>\n<code>${err.message}</code>`,
          parse_mode: "HTML",
        });
      }
      return res.status(200).send("OK");
    }

    // 7.2 TRANZAKSIYALAR (SAVDO, VOZVRAT, RASXOD, KO'P RASXOD, QARZ, KIRIM)
    if (parsedData && parsedData.amal) {
      parsedData.tolov_turi = normalizeTolovTuri(parsedData.tolov_turi);
      const draftId = Math.random().toString(36).substring(2, 10);

      // Agar amal "rasxod" bo'lib, lekin ichida bir nechta xarajat qaytgan bo'lsa -> "kop_rasxod" ga o'tkazish
      if (parsedData.amal === "rasxod" && Array.isArray(parsedData.xarajatlar) && parsedData.xarajatlar.length > 1) {
        parsedData.amal = "kop_rasxod";
      }

      // SAVDO AMALI
      if (parsedData.amal === "savdo") {
        await resolveSavdoEntities(parsedData);
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
        const card = buildSavdoCard(draftId, parsedData, hisoblarDB || []);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // TOVAR VOZVRAT
      if (parsedData.amal === "tovar_vozvrat") {
        await resolveSavdoEntities(parsedData);
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const card = buildVozvratCard(draftId, parsedData);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // QARZ TO'LOVI
      if (parsedData.amal === "qarz_tolov") {
        await resolveQarzTolovEntities(parsedData);
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
        const card = buildQarzTolovCard(draftId, parsedData, hisoblarDB || []);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // YAGONA RASXOD AMALI
      if (parsedData.amal === "rasxod") {
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
        const card = buildRasxodCard(draftId, parsedData, hisoblarDB || []);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // BIR NECHTA RASXODLAR (KO'P RASXOD) AMALI
      if (parsedData.amal === "kop_rasxod") {
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
        const card = buildMultiRasxodCard(draftId, parsedData, hisoblarDB || []);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // QARZ ESLATMASI
      if (parsedData.amal === "qarz_eslatma") {
        await resolveQarzEslatmaEntities(parsedData);
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const card = buildQarzEslatmaCard(draftId, parsedData);

        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: card.text.replace(/<[^>]+>/g, ""),
        });

        await tgPost("sendMessage", {
          chat_id: chatId,
          text: card.text,
          parse_mode: "HTML",
          reply_markup: card.keyboard,
        });
        return res.status(200).send("OK");
      }

      // QARZ PDF
      if (parsedData.amal === "qarz_pdf") {
        await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
        if (parsedData.mijoz_nomi && String(parsedData.mijoz_nomi).trim()) {
          await sendMijozQarzPdf(chatId, String(parsedData.mijoz_nomi).trim(), parsedData.sana_boshlanish, parsedData.sana_tugash);
        } else {
          await sendQarzdorlarPdf(chatId);
        }
        return res.status(200).send("OK");
      }

      // TOVAR KIRIMI VA PUL O'TKAZMA
      await getSupabase().from("tranzaksiya_qoralama").insert({
        id: draftId,
        malumot: parsedData,
        yaratildi: new Date().toISOString(),
      });

      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom");
      const getHisobNom = (id: string) => hisoblarDB?.find((h: any) => h.id === id)?.nom || id || "Kiritilmagan";

      let preview = "";
      if (parsedData.amal === "tovar_kirim") {
        const jamiTannarx = (parsedData.soni || 0) * (parsedData.tannarx || 0);
        preview = `📦 <b>TOVAR KIRIMI (OMBOR) ANIQLANDI</b>\n\n` +
          `🏷 Tovar: <b>${parsedData.tovar_nomi || "Yangi tovar"}</b>\n` +
          `🔢 Kirim soni: <b>+${parsedData.soni || 0} ${parsedData.birlik || "dona"}</b>\n` +
          (parsedData.tannarx ? `💲 Tannarxi: <b>${pul(parsedData.tannarx)} ${parsedData.valyuta}</b>\n` : "") +
          (parsedData.narx_optom ? `💰 Sotish (optom) narxi: <b>${pul(parsedData.narx_optom)} ${parsedData.valyuta}</b>\n` : "") +
          (jamiTannarx > 0 ? `💵 Jami partiya tannarxi: <b>${pul(jamiTannarx)} ${parsedData.valyuta}</b>\n` : "") +
          (parsedData.izoh ? `💬 Izoh: ${parsedData.izoh}\n` : "");
      } else if (parsedData.amal === "pul_otkazma") {
        preview = `🔄 <b>PUL O'TKAZMA (TRANSFER) ANIQLANDI</b>\n\n` +
          `💰 Summa: <b>${pul(parsedData.jami_summa)} ${parsedData.valyuta}</b>\n` +
          `📤 Qayerdan: <b>${getHisobNom(parsedData.chiqim_hisob_id)}</b>\n` +
          `📥 Qayerga: <b>${getHisobNom(parsedData.kirim_hisob_id)}</b>\n` +
          (parsedData.izoh ? `💬 Izoh: ${parsedData.izoh}\n` : "");
      }

      preview += `\n<i>Ma'lumot to'g'ri bo'lsa, tasdiqlang:</i>`;

      await getSupabase().from("ai_chat_history").insert({
        chat_id: chatId,
        role: "model",
        content: preview.replace(/<[^>]+>/g, '')
      });

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
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `🤖 <b>Xabardan moliyaviy yoki ombor amali aniqlanmadi.</b>\n\nIltimos, aniqroq yozing yoki gapiring.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Tushlikka 50 ming, taksiga 30 ming, internetga 100 ming"</i> (Bir nechta xarajat)\n• <i>"Akrom akaga 50 ta velikan 100$ ga berdim, 40$ naqd berdi"</i> (Savdo)\n• <i>"Murod aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Omborga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)`,
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }
  }

  return res.status(200).send("OK");
}
