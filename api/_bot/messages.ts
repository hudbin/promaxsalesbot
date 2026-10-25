import {
  getSupabase,
  supabase,
  tgPost,
  pul,
  normalizePhone,
  normalizeTolovTuri,
  formatTelegramHtml,
  stripHtml,
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
  buildBalansSozlashCard,
  buildTashqiQarzCard,
  buildBoshqaKirimCard,
} from "./cards";
import {
  checkUserPermission,
  resolveSavdoEntities,
  resolveQarzTolovEntities,
  resolveQarzEslatmaEntities,
  runTovarlarniOptimallashtirish,
  buildOptimizationReport,
} from "./entities";
import {
  sendQarzdorlarPdf,
  sendQarzdorlarExcel,
  sendMijozQarzPdf,
  sendKunlikHisobotPdf,
  sendTashqiQarzlarPdf,
  sendTashqiQarzAktSverkaPdf,
} from "./pdf";
import { getHisobotlarKeyboard } from "./reports";
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
        text: `👑 <b>Tabriklaymiz, ${senderName}!</b>\n\nAdmin paroli to'g'ri tasdiqlandi. Siz PROMAX tizimida <b>Bosh Administrator</b> sifatida ro'yxatdan o'tdingiz!\n\nEndi bot orqali va Mini App'da barcha funksiyalar (kassa, do'kon, xodimlarni tasdiqlash) siz uchun ochiq.\n🆔 Sizning Telegram ID: <code>${senderId}</code>`,
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
      text: `👋 <b>Assalomu alaykum, ${perm.xodim?.ism || senderName}!</b>\n🎭 Roli: <b>${perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>\n\nPROMAX Savdo va Kassa tizimi faol. Siz bu yerda:\n🎙 <b>Ovozli xabar</b> yoki matn orqali tezkor savdo, xarajat va tovar kirimlarini yozishingiz mumkin.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Tushlikka 50 ming, taksiga 30 ming, qadoqlashga 100 ming"</i> (Bir nechta xarajat)\n• <i>"Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"</i> (Savdo)\n• <i>"Murodjon aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Akrom akadan 20 ta velikan vozvrat bo'ldi"</i> (Tovar qaytarish)\n• <i>"Do'konga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)\n\n📊 <i>Hisobotlar menyusi:</i> /hisobotlar\n⚙️ <i>Tizim holatini tekshirish:</i> /status${perm.role === "admin" ? "\n⚖️ <i>Kassa balansini to'g'irlash:</i> /balans_sozlash\n📦 <i>Tovarlarni optimallashtirish (ranglarni modelga birlashtirish):</i> /optimallashtirish" : ""}`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
    return res.status(200).send("OK");
  }

  // 4.1 PROFESSIONAL HISOBOTLAR MENYUSI BUYRUG'I
  const normText = text.trim().toLowerCase();
  const isHisobotlarCmd =
    text === "/hisobotlar" ||
    text === "/hisobot" ||
    text.startsWith("/hisobotlar ") ||
    text.startsWith("/hisobot ") ||
    text.startsWith("/hisobotlar@") ||
    text.startsWith("/hisobot@") ||
    normText === "hisobotlar" ||
    normText === "hisobot" ||
    normText === "hisobotlar menyusi" ||
    normText === "hisobotlar ro'yxati" ||
    normText === "hisobotlar royxati" ||
    normText === "hisobotlar ro'yxatini och" ||
    normText === "hisobotlarni ko'rsat" ||
    normText === "hisobotlarni korsat";

  if (isHisobotlarCmd) {
    const kb = getHisobotlarKeyboard(perm.role);
    const roleTitle = perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi";
    await tgPost("sendMessage", {
      chat_id: chatId,
      text:
        `📊 <b>PROMAX SAVDO VA KASSA HISOBOTLARI</b>\n\n` +
        `👤 Xodim: <b>${perm.xodim?.ism || senderName}</b> (${roleTitle})\n\n` +
        `<i>Quyidagi hisobotlardan birini tanlang. Har bir hisobot uchun bugungi, kechagi va oylik ko'rsatkichlarni ko'rishingiz hamda Excel/PDF formatda yuklab olishingiz mumkin:</i>`,
      parse_mode: "HTML",
      reply_markup: kb,
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
      `• Har bir model bo'yicha jami do'kon qoldig'i yig'iladi va asosiy mahsulot nomiga o'tkaziladi.\n` +
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

  // 5.1 KASSA BALANSINI TO'G'IRLASH (ADMIN)
  const isBalansCmd =
    text === "/balans_sozlash" ||
    text === "/balans_togirla" ||
    text === "/kassa_sozlash" ||
    text.startsWith("/balans_sozlash ") ||
    text.startsWith("/balans_togirla ") ||
    text.startsWith("/kassa_sozlash ") ||
    text.startsWith("/balans_sozlash@") ||
    text.startsWith("/balans_togirla@");

  if (isBalansCmd) {
    if (perm.role !== "admin") {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "⛔️ <i>Kassa balansini to'g'irlash faqat administratorlar uchun ruxsat etilgan.</i>",
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }

    const { data: hisoblarDB } = await getSupabase()
      .from("hisoblar")
      .select("id, nom, turi, valyuta")
      .eq("faol", true);

    const { data: balanslarDB } = await getSupabase()
      .from("view_kassa_balans")
      .select("*");

    const cmdArgs = text.replace(/^\/(balans_sozlash|balans_togirla|kassa_sozlash)(@\w+)?/i, "").trim();
    let yangiBalans = 0;
    if (cmdArgs) {
      const parsedNum = parseFloat(cmdArgs.replace(/[^\d.]/g, ""));
      if (!isNaN(parsedNum) && parsedNum >= 0) {
        yangiBalans = parsedNum;
      }
    }

    if (yangiBalans > 0) {
      const draftId = `bs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const pData = {
        amal: "balans_sozlash",
        yangi_balans: yangiBalans,
        valyuta: "UZS",
        hisob_id: null,
        izoh: "Balans to'g'rilandi (korrektirovka)",
      };
      await getSupabase().from("tranzaksiya_qoralama").insert({
        id: draftId,
        malumot: pData,
        yaratildi: new Date().toISOString(),
      });

      const card = buildBalansSozlashCard(draftId, pData, hisoblarDB || []);
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: card.text,
        parse_mode: "HTML",
        reply_markup: card.keyboard,
      });
      return res.status(200).send("OK");
    }

    let hisoblarRoyxati = "";
    if (balanslarDB && balanslarDB.length > 0) {
      hisoblarRoyxati = balanslarDB
        .map((b: any) => `• <b>${b.kassa_nomi}</b>: <code>${pul(b.joriy_balans)} ${b.valyuta}</code>`)
        .join("\n");
    } else {
      hisoblarRoyxati = "<i>Hisoblar topilmadi.</i>";
    }

    const msg =
      `⚖️ <b>KASSA HISOB BALANSINI SOZLASH</b>\n\n` +
      `<b>Joriy kassa balanslari:</b>\n${hisoblarRoyxati}\n\n` +
      `<i>Balansni to'g'irlash usullari:</i>\n` +
      `1️⃣ <b>Ovozli yoki matnli xabar:</b> Masalan: <i>"Asosiy kassa naqd pulini 50 mln ga to'g'irla"</i> yoki <i>"Plastikda 12 mln so'm qoldi"</i>\n` +
      `2️⃣ <b>Buyruq orqali:</b> <code>/balans_sozlash 50000000</code>`;

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: msg,
      parse_mode: "HTML",
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
    // Tezkor tekshiruv: "qarzdor mijozlar hisoboti excel" yoki shunga o'xshash to'g'ridan-to'g'ri so'rovlar
    const directTextLower = (text || "").toLowerCase().trim();
    if (
      directTextLower === "qarzdor mijozlar hisoboti excel" ||
      directTextLower === "qarzdorlar excel" ||
      directTextLower === "qarzdorlar hisoboti excel" ||
      directTextLower === "qarzdorlar ro'yxati excel" ||
      directTextLower === "qarzdorlar royxati excel" ||
      directTextLower === "/qarzdorlar_excel" ||
      (directTextLower.includes("qarzdor") && directTextLower.includes("excel"))
    ) {
      await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
      await sendQarzdorlarExcel(chatId);
      return res.status(200).send("OK");
    }

    // Tezkor tekshiruv: kunlik hisobot pdf to'g'ridan-to'g'ri so'ralganda
    if (
      directTextLower === "kunlik hisobot pdf" ||
      directTextLower === "bugungi hisobot pdf" ||
      directTextLower === "hisobot pdf" ||
      directTextLower === "/kunlik_pdf"
    ) {
      await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
      await sendKunlikHisobotPdf(chatId);
      return res.status(200).send("OK");
    }

    if (directTextLower === "kechagi hisobot pdf") {
      const kecha = new Date(Date.now() - 24 * 3600 * 1000);
      const kechaStr = kecha.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
      await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
      await sendKunlikHisobotPdf(chatId, kechaStr);
      return res.status(200).send("OK");
    }

    const hisobotPdfDateMatch = directTextLower.match(/(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}|\d{2}\.\d{2})\s*(?:dagi\s*)?hisobot\s*pdf/);
    if (hisobotPdfDateMatch) {
      let rawDate = hisobotPdfDateMatch[1];
      if (rawDate.length === 5) {
        const year = new Date().getFullYear();
        const [d, m] = rawDate.split(".");
        rawDate = `${year}-${m}-${d}`;
      } else if (rawDate.includes(".")) {
        const [d, m, y] = rawDate.split(".");
        rawDate = `${y}-${m}-${d}`;
      }
      await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
      await sendKunlikHisobotPdf(chatId, rawDate);
      return res.status(200).send("OK");
    }

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

    // 7.0 HISOBOTLAR MENYUSI SO'RALGANDA
    if (parsedData && parsedData.amal === "hisobotlar_menyu") {
      const kb = getHisobotlarKeyboard(perm.role);
      const roleTitle = perm.role === "admin" ? "👑 Administrator" : "💼 Sotuvchi";
      await tgPost("sendMessage", {
        chat_id: chatId,
        text:
          `📊 <b>PROMAX SAVDO VA KASSA HISOBOTLARI</b>\n\n` +
          `👤 Xodim: <b>${perm.xodim?.ism || senderName}</b> (${roleTitle})\n\n` +
          `<i>Quyidagi hisobotlardan birini tanlang. Har bir hisobot uchun bugungi, kechagi va oylik ko'rsatkichlarni ko'rishingiz hamda Excel/PDF formatda yuklab olishingiz mumkin:</i>`,
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return res.status(200).send("OK");
    }

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
- KASSA VA HISOBLAR BALANSI:
  * "view_kassa_balans" ustunlari: (hisob_id, kassa_nomi, kassa_turi, valyuta, joriy_balans). Unda "sana_vaqt" ustuni YO'Q!
  * Muayyan kassa yoki karta qoldig'i: SELECT kassa_nomi, kassa_turi, joriy_balans, valyuta FROM view_kassa_balans WHERE kassa_nomi ILIKE '%nom%'
- O'TGAN SANALARNI TAHLIL QILISHDA:
  * "view_kassa_balans" va "view_ai_xulosa" da "sana_vaqt" ustuni YO'Q! Ularga "WHERE sana_vaqt" deb so'rov yozmang!
  * Savdolar uchun: savdolar (id, raqam, sana_vaqt, mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, holat, xodim) WHERE holat != 'bekor_qilindi'
  * Kirim/tushum uchun: kassa_harakatlari (sana_vaqt, amal, summa, valyuta, manba_turi, izoh) WHERE amal = 'kirim'
  * Chiqim/rasxod uchun: rasxodlar (id, sana_vaqt, summa, valyuta, kategoriya, tolov_turi, izoh, xodim) WHERE holat != 'bekor_qilindi'
  * Qarz to'lovlari uchun: qarz_tolovlari (id, sana_vaqt, mijoz_id, summa, valyuta, tolov_turi, xodim)
  * Sana filtri: (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = 'YYYY-MM-DD'
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

        const answerPrompt = `Siz PROMAX ulgurji do'koni uchun professional Shaxsiy Yordamchi (Personal Assistant) va Bosh buxgalter-tahlilchi AIsiz.
Foydalanuvchi savoli: "${text || "[Ovozli xabar]"}"
Bazadan (PostgreSQL) olingan ma'lumotlar: ${JSON.stringify(dbResult || [])}
Bugungi sana: ${bugunStrAns}, Kechagi sana: ${kechaStrAns}

MUHIM QOIDALAR:
1. Agar bazadan ma'lumot bo'sh kelsa ([] yoki null bo'lsa):
   - So'ralgan sana bo'yicha do'konda hech qanday ma'lumot (savdo, kirim yoki chiqim) kiritilmagan bo'lsa, buni aniq va muloyim tushuntiring.
   - Masalan: "Siz so'ragan sana bo'yicha do'konda hech qanday savdo / kirim / chiqim amali kiritilmagan ekan."
2. Agar ma'lumotlar topilgan bo'lsa:
   - Avval qisqacha umumiy xulosa (Jami savdo/kirim/chiqim summasi, to'langan, qarz va h.k.) bering.
   - So'ngra har bir operatsiyani ro'yxat qilib (chek raqami, vaqti, mijoz/kategoriya, summa) tartibli ko'rsating.
   - Pul summasini chiroyli formatlang (masalan: 8 700 000 UZS yoki $200).
3. Formatlash (Telegram HTML):
   - Faqat toza va yopiq Telegram HTML teglari (<b>...</b>, <code>...</code>, <i>...</i>, <blockquote>...</blockquote>) ishlating.
   - Matnda bare '&' belgisini ishlatmang (doimo 'va' deb yozing). Barcha ochilgan teglarni albatta yoping.`;

        const finalAns = await geminiTabiiyJavob(answerPrompt);
        
        await getSupabase().from("ai_chat_history").insert({
          chat_id: chatId,
          role: "model",
          content: finalAns
        });

        const formattedHtml = formatTelegramHtml(finalAns);
        let sendRes = await tgPost("sendMessage", {
          chat_id: chatId,
          text: formattedHtml,
          parse_mode: "HTML",
        });

        if (!sendRes?.ok) {
          console.warn("HTML xabar yuborishda xatolik, tozalangan oddiy matn bilan qayta yuborilmoqda:", sendRes?.error);
          const cleanText = stripHtml(finalAns);
          sendRes = await tgPost("sendMessage", {
            chat_id: chatId,
            text: cleanText,
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
            (parsedData.pdf_soraldi === true || /pdf|fayl|hujjat|akt|sverka/i.test(combinedQueryText)) &&
            (sqlLower.includes("tashqi_qarzlar") || /tashqi.*qarz|bizning.*qarz|biz.*berishimiz|sherik.*qarz/i.test(combinedQueryText))
          ) {
            await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
            const shaxsMatch = cleanSql.match(/shaxs_nomi(?:_norm)?\s+(?:ILIKE|=)\s+'%?([^%']+)%?'/i);
            const shaxsNomi = parsedData.shaxs_nomi || (shaxsMatch && shaxsMatch[1] ? shaxsMatch[1].trim() : null);
            if (shaxsNomi) {
              await sendTashqiQarzAktSverkaPdf(chatId, shaxsNomi, parsedData.sana_boshlanish, parsedData.sana_tugash);
            } else {
              await sendTashqiQarzlarPdf(chatId);
            }
          } else if (
            (parsedData.pdf_soraldi === true || /pdf|fayl|hujjat/i.test(combinedQueryText)) &&
            (/kunlik.*hisobot|bugungi.*hisobot|kechagi.*hisobot/i.test(combinedQueryText) || sqlLower.includes("view_bugungi_hisobot"))
          ) {
            await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
            const dateMatch = cleanSql.match(/['"](\d{4}-\d{2}-\d{2})['"]/);
            const targetDate = parsedData.sana || (dateMatch && dateMatch[1] ? dateMatch[1] : undefined);
            await sendKunlikHisobotPdf(chatId, targetDate);
          } else if (
            !sqlLower.includes("tashqi_qarzlar") &&
            (parsedData.excel_soraldi === true || /excel|xlsx|jadval/i.test(combinedQueryText)) &&
            (sqlLower.includes("view_ai_qarzdorlar") || /qarz|qarzdor/i.test(combinedQueryText))
          ) {
            await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
            await sendQarzdorlarExcel(chatId);
          } else if (
            !sqlLower.includes("tashqi_qarzlar") &&
            (parsedData.pdf_soraldi === true || /pdf|fayl|hujjat/i.test(combinedQueryText)) &&
            (sqlLower.includes("view_ai_qarzdorlar") || /qarz|qarzdor/i.test(combinedQueryText))
          ) {
            await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
            await sendQarzdorlarPdf(chatId);
          }
        }
      } catch (err: any) {
        console.error("AI SQL xatosi:", err);
        const errMsg = err?.message || String(err);
        const rawTextLower = (text || "").toLowerCase();
        const isSanaQuery = /\b(\d{1,2}[-./]\d{1,2}(?:[-./]\d{2,4})?|kecha|o'tgan\s+hafta|o'tgan\s+oy|bugun)\b/i.test(rawTextLower);
        let tushunarliXabar = `Kechirasiz, so'ralgan ma'lumotni tahlil qilishda qiyinchilik yuz berdi.`;

        if (isSanaQuery && (errMsg.includes("column") || errMsg.includes("sana_vaqt") || errMsg.includes("does not exist"))) {
          tushunarliXabar = `Kechirasiz, ushbu sana bo'yicha ma'lumotlarni qidirishda noaniqlik yuz berdi. Iltimos, so'rovingizni aniqroq qilib (masalan: <i>"16.10.2026 savdolar"</i> yoki <i>"16.10.2026 kassa tushumi"</i> deb) yuborib ko'ring.`;
        } else if (/balans|qoldiq|kassa|karta|hisob/i.test(rawTextLower)) {
          tushunarliXabar = `Kechirasiz, so'ralgan kassa yoki karta bo'yicha ma'lumotni aniqlashda qiyinchilik yuz berdi. Iltimos, hisob nomini to'liqroq yozib ko'ring yoki /kassa buyrug'i orqali joriy balanslarni ko'ring.`;
        } else {
          tushunarliXabar = `So'rovingiz bo'yicha tahlil yakunlanmadi. Iltimos, so'rovingizni biroz boshqacharoq yozib ko'ring.`;
        }
        await tgPost("sendMessage", {
          chat_id: chatId,
          text: `⚠️ <b>Tahlil qilishda noaniqlik:</b>\n${tushunarliXabar}`,
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

      // Xavfsiz avto-tuzatish: Agar foydalanuvchi "xarajat" yoki "rasxod" deb yozgan bo'lsa-yu, AI yanglishib "tashqi_qarz" deb olgan bo'lsa
      if (parsedData.amal === "tashqi_qarz") {
        const textLower = (text || "").toLowerCase();
        const hasXarajatWord = /\b(xarajat|rasxod|chiqim)\b/i.test(textLower);
        const hasQarzWord = /\b(qarz|nasiya)\b/i.test(textLower);
        if (hasXarajatWord && !hasQarzWord) {
          parsedData.amal = "rasxod";
          parsedData.jami_summa = Number(parsedData.summa) || Number(parsedData.jami_summa) || 0;
          parsedData.kategoriya = parsedData.maqsad || "Shaxsiy";
          let izohMatni = "";
          if (parsedData.shaxs_nomi) {
            izohMatni = `${parsedData.shaxs_nomi}ga shaxsiyga yoziladi`;
          }
          if (parsedData.izoh && !izohMatni.includes(parsedData.izoh)) {
            izohMatni = izohMatni ? `${izohMatni} (${parsedData.izoh})` : parsedData.izoh;
          }
          parsedData.izoh = izohMatni || text || "Shaxsiy xarajat";
        }
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

      // QARZ EXCEL
      if (parsedData.amal === "qarz_excel") {
        await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
        await sendQarzdorlarExcel(chatId);
        return res.status(200).send("OK");
      }

      // TASHQI QARZ PDF (HAMKORLAR BILAN AKT-SVERKA YOKI UMUMIY BALANS)
      if (parsedData.amal === "tashqi_qarz_pdf") {
        await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
        if (parsedData.shaxs_nomi && String(parsedData.shaxs_nomi).trim()) {
          await sendTashqiQarzAktSverkaPdf(chatId, String(parsedData.shaxs_nomi).trim(), parsedData.sana_boshlanish, parsedData.sana_tugash);
        } else {
          await sendTashqiQarzlarPdf(chatId);
        }
        return res.status(200).send("OK");
      }

      // KUNLIK YAKUNIY HISOBOT PDF
      if (parsedData.amal === "kunlik_hisobot_pdf") {
        await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
        const targetDate = parsedData.sana || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
        await sendKunlikHisobotPdf(chatId, targetDate);
        return res.status(200).send("OK");
      }

      // BALANS SOZLASH (KORREKTIROVKA)
      if (parsedData.amal === "balans_sozlash") {
        if (perm.role !== "admin") {
          await tgPost("sendMessage", {
            chat_id: chatId,
            text: "⛔️ <i>Kassa balansini to'g'irlash faqat administratorlar uchun ruxsat etilgan.</i>",
            parse_mode: "HTML",
          });
          return res.status(200).send("OK");
        }

        const { data: hisoblarDB } = await getSupabase()
          .from("hisoblar")
          .select("id, nom, turi, valyuta")
          .eq("faol", true);

        if (parsedData.hisob_id) {
          const { data: vb } = await getSupabase()
            .from("view_kassa_balans")
            .select("joriy_balans, valyuta, kassa_nomi")
            .eq("hisob_id", parsedData.hisob_id)
            .maybeSingle();

          parsedData.joriy_balans = Number(vb?.joriy_balans || 0);
          if (vb?.valyuta) parsedData.valyuta = vb.valyuta;
          if (vb?.kassa_nomi) parsedData.hisob_nomi = vb.kassa_nomi;
        }

        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const card = buildBalansSozlashCard(draftId, parsedData, hisoblarDB || []);

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

      // BOSHQA KIRIM (DAROMAD / XIZMATLAR UCHUN TUSHGAN PUL)
      if (parsedData.amal === "boshqa_kirim") {
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase()
          .from("hisoblar")
          .select("id, nom, turi, valyuta")
          .eq("faol", true);

        const card = buildBoshqaKirimCard(draftId, parsedData, hisoblarDB || []);

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

      // TANISHLAR QARZI (TASHQI QARZ) AMALI
      if (parsedData.amal === "tashqi_qarz") {
        await getSupabase().from("tranzaksiya_qoralama").insert({
          id: draftId,
          malumot: parsedData,
          yaratildi: new Date().toISOString(),
        });

        const { data: hisoblarDB } = await getSupabase()
          .from("hisoblar")
          .select("id, nom, turi, valyuta")
          .eq("faol", true);

        const card = buildTashqiQarzCard(draftId, parsedData, hisoblarDB || []);

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
        preview = `📦 <b>TOVAR KIRIMI (DO'KON) ANIQLANDI</b>\n\n` +
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
        text: `🤖 <b>Xabardan moliyaviy yoki savdo/do'kon amali aniqlanmadi.</b>\n\nIltimos, aniqroq yozing yoki gapiring.\n\n<i>Masalan:</i>\n• <i>"Ovqatlanishga 75 ming naqd ketdi"</i> (Xarajat)\n• <i>"Tushlikka 50 ming, taksiga 30 ming, internetga 100 ming"</i> (Bir nechta xarajat)\n• <i>"Akrom akaga 50 ta velikan 100$ ga berdim, 40$ naqd berdi"</i> (Savdo)\n• <i>"Murod aka 500$ qarzini berdi"</i> (Qarz to'lovi)\n• <i>"Do'konga yangi tovar keldi: Velikan uzun, 200 dona, tannarxi 1.5$, sotish narxi 2$"</i> (Tovar kirimi)`,
        parse_mode: "HTML",
      });
      return res.status(200).send("OK");
    }
  }

  return res.status(200).send("OK");
}
