import { pul, formatTelegramHtml } from "./config";

// -----------------------------------------------------------------------------
// SAVDO KARTASI
// -----------------------------------------------------------------------------
export function buildSavdoCard(draftId: string, p: any, hisoblar: any[] = []): { text: string; keyboard: any } {
  // 1. Agar mijoz bir nechta bo'lib noaniq bo'lsa
  if (p.mijozStatus === "ambiguous") {
    const text = `🔍 <b>MIJOZNI ANIQLASHTIRISH (1-bosqich)</b>\n\n` +
      `Siz kiritgan <i>"${p.mijoz_nomi}"</i> bo'yicha bazada bir nechta mijoz topildi. Qaysi birini tanlaysiz?`;
    const buttons: any[] = (p.mijozCandidates || []).map((c: any) => [
      { text: `👤 ${c.nom}${c.manzil ? ` (${c.manzil})` : ""}`, callback_data: `pk:m:${draftId}:${c.id}` },
    ]);
    buttons.push([
      { text: `➕ Yangi mijoz ochish: "${p.mijoz_nomi}"`, callback_data: `pk:m:${draftId}:new` },
    ]);
    buttons.push([
      { text: `🛒 Chakana mijoz sifatida saqlash`, callback_data: `pk:m:${draftId}:none` },
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 2. Agar mijoz bazada umuman topilmagan bo'lsa
  if (p.mijozStatus === "not_found") {
    const text = `👤 <b>MIJOZ TOPILMADI (1-bosqich)</b>\n\n` +
      `Bazada <i>"${p.mijoz_nomi}"</i> ismli mijoz topilmadi. Qanday davom etamiz?`;
    const buttons = [
      [{ text: `➕ Yangi mijoz sifatida ochish`, callback_data: `pk:m:${draftId}:new` }],
      [{ text: `🛒 Chakana mijoz sifatida yozish`, callback_data: `pk:m:${draftId}:none` }],
      [{ text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` }],
    ];
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 3. Agar tovarlardan birortasi noaniq bo'lsa
  const ambIndex = (p.qatorlar || []).findIndex((it: any) => it.status === "ambiguous");
  if (ambIndex >= 0) {
    const it = p.qatorlar[ambIndex];
    const text = `📦 <b>MAHSULOT MODELINI TANLANG (${ambIndex + 1}/${p.qatorlar.length})</b>\n\n` +
      `👤 <b>Mijoz:</b> <b>${p.selectedMijoz?.nom || "Chakana"}</b>\n` +
      `Siz aytgan <i>"${it.nom}"</i> (${it.soni} dona × ${pul(it.narx)}) bo'yicha quyidagi modellar mavjud:`;
    const buttons: any[] = (it.candidates || []).map((c: any) => [
      { text: `🏷 ${c.nom} (Do'konda: ${c.qoldiq} ${c.birlik || "dona"})`, callback_data: `pk:t:${draftId}:${ambIndex}:${c.id}` },
    ]);
    buttons.push([
      { text: `✍️ O'z nomi bilan qoldirish ("${it.nom}")`, callback_data: `pk:t:${draftId}:${ambIndex}:free` },
    ]);
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 4. Barcha noaniqliklar hal bo'ldi -> 2-BOSQICH (YAKUNIY TASDIQLASH KARTASI)
  const jami = (p.qatorlar || []).reduce(
    (sum: number, it: any) => sum + (Number(it.soni) || 0) * (Number(it.narx) || 0),
    0
  ) || Number(p.jami_summa) || 0;
  const tolangan = Number(p.tolangan_summa) || 0;
  const qarz = Math.max(0, jami - tolangan);
  const valyuta = p.valyuta || "UZS";

  // AGAR TO'LOV BOR BO'LSA (tolangan > 0) VA HISOB TANLANMAGAN BO'LSA -> FOYDALANUVCHIDAN SO'RAYMIZ!
  if (tolangan > 0 && !p.hisob_id) {
    const text = `📥 <b>PUL QAYSI HISOBGA TUSHDI? (Kirim)</b>\n\n` +
      `👤 <b>Mijoz:</b> <b>${p.selectedMijoz?.nom || "Chakana"}</b>\n` +
      `💵 <b>To'langan summa:</b> <b>${pul(tolangan)} ${valyuta}</b>\n\n` +
      `❓ Ushbu to'lov qaysi kassa / hisobga kirim qilinsin?`;

    const mosHisoblar = (hisoblar || []).filter((h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI");
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);
    const buttons: any[] = list.map((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      return [{ text: `${icon} ${h.nom}`, callback_data: `pk:sh:${draftId}:${h.id}` }];
    });
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  let itemsText = "";
  (p.qatorlar || []).forEach((it: any, i: number) => {
    const s = (Number(it.soni) || 0) * (Number(it.narx) || 0);
    const birlik = it.birlik || "dona";
    itemsText += `  ${i + 1}️⃣ <b>${it.aniq_nom || it.nom}</b>: <code>${it.soni} ${birlik}</code> × <code>${pul(it.narx)}</code> = <code>${pul(s)} ${valyuta}</code>\n`;
    if (it.qoldiq !== undefined && it.qoldiq !== null) {
      itemsText += `      <i>📉 Do'konda: ${it.qoldiq} ${birlik} ➔ qoladi: ${Math.max(0, it.qoldiq - it.soni)} ${birlik}</i>\n`;
    }
  });

  const hisobNomi = hisoblar.find((h: any) => h.id === p.hisob_id)?.nom || p.hisob_id || "Kassa";

  let text = `🛒 <b>SAVDO YAKUNIY TASDIQLASH (2-bosqich)</b>\n\n` +
    `👤 <b>Mijoz:</b> <b>${p.selectedMijoz?.nom || "Chakana"}</b>\n` +
    (itemsText ? `📦 <b>Mahsulotlar (${(p.qatorlar || []).length} ta):</b>\n${itemsText}\n` : "") +
    `💰 <b>Jami savdo:</b> <b>${pul(jami)} ${valyuta}</b>\n` +
    `💵 <b>Naqd to'landi:</b> <b>${pul(tolangan)} ${valyuta}</b>\n` +
    (tolangan > 0 ? `📥 <b>Kirim hisobi:</b> <b>${hisobNomi}</b>\n` : "") +
    `📝 <b>Nasiya / Qarz:</b> <b>${pul(qarz)} ${valyuta}</b>\n`;

  if (qarz > 0 && p.selectedMijoz) {
    const joriyQarz = Number(valyuta === "USD" ? p.selectedMijoz.qarz_usd : p.selectedMijoz.qarz_uzs) || 0;
    text += `📂 <b>Mijozning eski umumiy qarzi:</b> <b>${pul(joriyQarz)} ${valyuta}</b>\n`;
    text += `📊 <b>Mijozning yangi umumiy qarzi:</b> <b>${pul(joriyQarz + qarz)} ${valyuta}</b>\n`;
  }

  text += `\n<i>Ma'lumotlar to'g'ri bo'lsa, tasdiqlang:</i>`;

  const buttons = [
    [
      { text: "✅ Tasdiqlash va Bazaga yozish", callback_data: `cf:${draftId}` },
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// YAGONA CHIQIM (RASXOD) KARTASI
// -----------------------------------------------------------------------------
export function buildRasxodCard(draftId: string, p: any, hisoblar: any[] = []): { text: string; keyboard: any } {
  const valyuta = p.valyuta || "UZS";
  const summa = Number(p.jami_summa) || 0;

  // 1. Agar hisob aniqlanmagan bo'lsa -> FOYDALANUVCHIDAN HISOBNI SO'RAYMIZ!
  if (!p.hisob_id) {
    const text = `📤 <b>XARAJAT QAYSI HISOBDAN CHIQDI?</b>\n\n` +
      `💵 <b>Summa:</b> <b>${pul(summa)} ${valyuta}</b>\n` +
      `📂 <b>Kategoriya:</b> <b>${p.kategoriya || "Boshqa"}</b>\n` +
      (p.izoh ? `💬 <b>Izoh:</b> <i>${p.izoh}</i>\n` : "") +
      `\n❓ Ushbu xarajat qaysi kassa / hisobdan chiqim qilinsin?`;

    const mosHisoblar = (hisoblar || []).filter((h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI");
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);
    const buttons: any[] = list.map((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      return [{ text: `${icon} ${h.nom}`, callback_data: `pk:rh:${draftId}:${h.id}` }];
    });
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 2. Hisob tanlangan -> YAKUNIY TASDIQLASH
  const hisobNomi = hisoblar.find((h: any) => h.id === p.hisob_id)?.nom || p.hisob_id || "Kassa";
  const text = `🧾 <b>XARAJAT (RASXOD) TASDIQLASH</b>\n\n` +
    `💵 <b>Summa:</b> <b>${pul(summa)} ${valyuta}</b>\n` +
    `📂 <b>Kategoriya:</b> <b>${p.kategoriya || "Boshqa"}</b>\n` +
    `💳 <b>Chiqim hisobi:</b> <b>${hisobNomi}</b>\n` +
    (p.izoh ? `💬 <b>Izoh:</b> <i>${p.izoh}</i>\n` : "") +
    `\n<i>Ma'lumot to'g'ri bo'lsa, tasdiqlang:</i>`;

  const buttons = [
    [
      { text: "✅ Tasdiqlash", callback_data: `cf:${draftId}` },
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// BIR NECHTA CHIQIM (KO'P RASXOD) KARTASI
// -----------------------------------------------------------------------------
export function buildMultiRasxodCard(draftId: string, p: any, hisoblar: any[] = []): { text: string; keyboard: any } {
  const valyuta = p.valyuta || "UZS";
  const xarajatlar: any[] = Array.isArray(p.xarajatlar) ? p.xarajatlar : [];
  const jamiSumma = xarajatlar.reduce((s: number, it: any) => s + (Number(it.summa) || 0), 0) || Number(p.jami_summa) || 0;

  // 1. Agar bitta aniq element uchun hisob tanlash faol bo'lsa (p.pickIndex !== undefined)
  if (typeof p.pickIndex === "number" && p.pickIndex >= 0 && p.pickIndex < xarajatlar.length) {
    const curItem = xarajatlar[p.pickIndex];
    const text = `📤 <b>${p.pickIndex + 1}-XARAJAT CHIQIM HISOBINI TANLANG:</b>\n\n` +
      `📂 Kategoriya: <b>${curItem.kategoriya || "Boshqa"}</b>\n` +
      `💵 Summa: <b>${pul(curItem.summa)} ${valyuta}</b>\n` +
      (curItem.izoh ? `💬 Izoh: <i>${curItem.izoh}</i>\n` : "") +
      `\n❓ Ushbu xarajat qaysi kassa/hisobdan chiqim qilinsin?`;

    const mosHisoblar = (hisoblar || []).filter((h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI");
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);
    const buttons: any[] = list.map((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      return [{ text: `${icon} ${h.nom}`, callback_data: `pk:mrh_item:${draftId}:${p.pickIndex}:${h.id}` }];
    });
    buttons.push([
      { text: `⬅️ Orqaga`, callback_data: `pk:mrh_back:${draftId}` },
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 2. Hisoblar holatini tekshirish
  const unassignedCount = xarajatlar.filter((it: any) => !it.hisob_id).length;

  // Agar ba'zi xarajatlarda hisob tanlanmagan bo'lsa
  if (unassignedCount > 0) {
    let royxatMatni = "";
    xarajatlar.forEach((it: any, i: number) => {
      const hNom = hisoblar.find((h: any) => h.id === it.hisob_id)?.nom;
      const hText = hNom ? `💳 <b>${hNom}</b>` : `⚠️ <i>Belgilanmagan</i>`;
      royxatMatni += `  ${i + 1}️⃣ <b>${it.kategoriya || "Boshqa"}</b>: <code>${pul(it.summa)} ${valyuta}</code>\n      └ Chiqim: ${hText}${it.izoh ? ` <i>(${it.izoh})</i>` : ""}\n`;
    });

    const text = `📤 <b>BIR NECHTA XARAJAT: HISOB TANLASH</b>\n\n` +
      `Siz kiritgan xarajatlar (${xarajatlar.length} ta):\n` +
      `${royxatMatni}\n` +
      `📊 <b>Jami xarajat:</b> <b>${pul(jamiSumma)} ${valyuta}</b>\n\n` +
      `❓ <b>Xarajatlar qaysi hisobdan chiqim qilinsin?</b>\n` +
      `<i>(Barchasiga bitta hisobni biriktirish yoki har biriga alohida tanlash mumkin)</i>`;

    const mosHisoblar = (hisoblar || []).filter((h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI");
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);

    const buttons: any[] = [];
    // Barchasiga bitta hisob
    list.forEach((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      buttons.push([
        { text: `${icon} Barchasiga: ${h.nom}`, callback_data: `pk:mrh_all:${draftId}:${h.id}` },
      ]);
    });

    // Har biriga alohida tanlash
    buttons.push([
      { text: `🔀 Har biriga alohida hisob tanlash`, callback_data: `pk:mrh_pick_each:${draftId}:0` },
    ]);
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);

    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 3. BARCHA XARAJATLARNING HISOBLARI ANIQ -> YAKUNIY TASDIQLASH
  let finalRoyxat = "";
  xarajatlar.forEach((it: any, i: number) => {
    const hNom = hisoblar.find((h: any) => h.id === it.hisob_id)?.nom || "Kassa";
    finalRoyxat += `  ${i + 1}️⃣ <b>${it.kategoriya || "Boshqa"}</b>: <code>${pul(it.summa)} ${valyuta}</code>\n      └ 💳 <b>${hNom}</b>${it.izoh ? ` <i>(${it.izoh})</i>` : ""}\n`;
  });

  const text = `🧾 <b>BIR NECHTA XARAJATNI TASDIQLASH</b>\n\n` +
    `Kiritilayotgan xarajatlar (${xarajatlar.length} ta):\n` +
    `${finalRoyxat}\n` +
    `📊 <b>JAMI XARAJAT:</b> <b>${pul(jamiSumma)} ${valyuta}</b>\n\n` +
    `<i>Barcha ma'lumotlar to'g'ri bo'lsa, tasdiqlang:</i>`;

  const buttons = [
    [
      { text: "✅ Barchasini tasdiqlash", callback_data: `cf:${draftId}` },
      { text: "🔄 Hisoblarni o'zgartirish", callback_data: `pk:mrh_reset:${draftId}` },
    ],
    [
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// QARZ TO'LOVI KARTASI
// -----------------------------------------------------------------------------
export function buildQarzTolovCard(draftId: string, p: any, hisoblar: any[] = []): { text: string; keyboard: any } {
  if (p.mijozStatus === "ambiguous") {
    const text = `🔍 <b>QARZ TO'LOVI: MIJOZNI TANLANG</b>\n\n` +
      `Siz aytgan <i>"${p.mijoz_nomi}"</i> bo'yicha bir nechta mijoz topildi:`;
    const buttons: any[] = (p.mijozCandidates || []).map((c: any) => [
      { text: `👤 ${c.nom} (Qarzi: ${pul(c.qarz_uzs)} UZS)`, callback_data: `pk:qm:${draftId}:${c.id}` },
    ]);
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  const valyuta = p.valyuta || "UZS";
  const summa = Number(p.jami_summa) || 0;
  const m = p.selectedMijoz;
  const joriyQarz = m ? Number(valyuta === "USD" ? m.qarz_usd : m.qarz_uzs) || 0 : 0;
  const qolganQarz = Math.max(0, joriyQarz - summa);

  // AGAR HISOB TANLANMAGAN BO'LSA -> FOYDALANUVCHIDAN HISOBNI SO'RAYMIZ!
  if (!p.hisob_id) {
    const text = `📥 <b>QARZ TO'LOVI QAYSI HISOBGA TUSHDI?</b>\n\n` +
      `👤 <b>Mijoz:</b> <b>${m?.nom || p.mijoz_nomi || "Noma'lum"}</b>\n` +
      `💵 <b>To'lov summasi:</b> <b>${pul(summa)} ${valyuta}</b>\n\n` +
      `❓ Pul qaysi kassa / hisobga kirim qilinsin?`;

    const mosHisoblar = (hisoblar || []).filter((h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI");
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);
    const buttons: any[] = list.map((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      return [{ text: `${icon} ${h.nom}`, callback_data: `pk:qh:${draftId}:${h.id}` }];
    });
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  const hisobNomi = hisoblar.find((h: any) => h.id === p.hisob_id)?.nom || p.hisob_id || "Kassa";

  let text = `💳 <b>QARZ TO'LOVI ANIQLANDI</b>\n\n` +
    `👤 <b>Mijoz:</b> <b>${m?.nom || p.mijoz_nomi || "Noma'lum"}</b>\n` +
    `💵 <b>To'lov summasi:</b> <b>${pul(summa)} ${valyuta}</b>\n` +
    `📥 <b>Kirim hisobi:</b> <b>${hisobNomi}</b>\n`;

  if (m) {
    text += `📊 <b>Eski qarz:</b> ${pul(joriyQarz)} ${valyuta}\n` +
      `📉 <b>To'lovdan keyingi qarz:</b> <b>${pul(qolganQarz)} ${valyuta}</b>\n`;
  }

  text += `\n<i>Ma'lumot to'g'ri bo'lsa, tasdiqlang:</i>`;

  const buttons = [
    [
      { text: "✅ To'lovni qabul qilish", callback_data: `cf:${draftId}` },
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// VOZVRAT (TOVAR QAYTARISH) KARTASI
// -----------------------------------------------------------------------------
export function buildVozvratCard(draftId: string, p: any): { text: string; keyboard: any } {
  if (p.mijozStatus === "ambiguous") {
    const text = `🔍 <b>VOZVRAT: MIJOZNI ANIQLASHTIRISH</b>\n\n` +
      `Siz kiritgan <i>"${p.mijoz_nomi}"</i> bo'yicha bazada bir nechta mijoz topildi. Qaysi biri tovar qaytardi?`;
    const buttons: any[] = (p.mijozCandidates || []).map((c: any) => [
      { text: `👤 ${c.nom}${c.manzil ? ` (${c.manzil})` : ""}`, callback_data: `pk:m:${draftId}:${c.id}` },
    ]);
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  const valyuta = p.valyuta || "UZS";
  const jami = (p.qatorlar || []).reduce(
    (sum: number, it: any) => sum + (Number(it.soni) || 0) * (Number(it.narx) || 0),
    0
  ) || Number(p.jami_summa) || 0;

  const m = p.selectedMijoz;
  const joriyQarz = m ? Number(valyuta === "USD" ? m.qarz_usd : m.qarz_uzs) || 0 : 0;
  const qolganQarz = Math.max(0, joriyQarz - jami);

  let itemsText = "";
  (p.qatorlar || []).forEach((it: any, i: number) => {
    const s = (Number(it.soni) || 0) * (Number(it.narx) || 0);
    const birlik = it.birlik || "dona";
    itemsText += `  ${i + 1}️⃣ <b>${it.aniq_nom || it.nom}</b>: <code>${it.soni} ${birlik}</code> × <code>${pul(it.narx)}</code> = <code>${pul(s)} ${valyuta}</code>\n`;
    if (it.qoldiq !== undefined && it.qoldiq !== null) {
      itemsText += `      <i>📈 Do'konda: ${it.qoldiq} ${birlik} ➔ qoladi: ${it.qoldiq + it.soni} ${birlik} (+qaytariladi)</i>\n`;
    }
  });

  let text = `↩️ <b>TOVAR QAYTARISH (VOZVRAT) TASDIQLASH</b>\n\n` +
    `👤 <b>Mijoz:</b> <b>${m?.nom || p.mijoz_nomi || "Chakana"}</b>\n` +
    (itemsText ? `📋 <b>Qaytarilgan mahsulotlar:</b>\n${itemsText}\n` : "") +
    `💰 <b>Jami qaytarilgan summa:</b> <b>${pul(jami)} ${valyuta}</b>\n`;

  if (m) {
    text += `📂 <b>Mijozning eski umumiy qarzi:</b> ${pul(joriyQarz)} ${valyuta}\n` +
      `📉 <b>Vozvratdan keyingi qarzi:</b> <b>${pul(qolganQarz)} ${valyuta}</b>\n`;
  }

  if (p.izoh) text += `💬 <b>Izoh:</b> <i>${p.izoh}</i>\n`;
  text += `\n❓ <i>Ushbu qaytarish tasdiqlansinmi? (Mijoz qarzi kamayadi, tovar do'konga qaytadi)</i>`;

  const buttons = [
    [
      { text: "✅ Vozvratni tasdiqlash", callback_data: `cf:${draftId}` },
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// QARZ ESLATMASI KARTASI
// -----------------------------------------------------------------------------
export function buildQarzEslatmaCard(draftId: string, p: any): { text: string; keyboard: any } {
  if (p.mijozStatus === "ambiguous") {
    const text = `🔍 <b>QARZ ESLATMASI: MIJOZNI TANLANG</b>\n\n` +
      `Siz aytgan <i>"${p.mijoz_nomi}"</i> bo'yicha bir nechta mijoz topildi:`;
    const buttons: any[] = (p.mijozCandidates || []).map((c: any) => [
      { text: `👤 ${c.nom} (Qarzi: ${pul(c.qarz_uzs)} UZS)`, callback_data: `pk:em:${draftId}:${c.id}` },
    ]);
    buttons.push([
      { text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` },
    ]);
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  const m = p.selectedMijoz;
  if (!m) {
    const text = `⚠️ <b>MIJOZ TOPILMADI</b>\n\n` +
      `Siz aytgan <i>"${p.mijoz_nomi || "Noma'lum"}"</i> ismli mijoz bazadan topilmadi.`;
    const buttons = [
      [{ text: `❌ Bekor qilish`, callback_data: `cn:${draftId}` }],
    ];
    return { text, keyboard: { inline_keyboard: buttons } };
  }

  const qarzUzs = Number(m.qarz_uzs || 0);
  const qarzUsd = Number(m.qarz_usd || 0);

  let qarzMatn = "";
  if (qarzUzs > 0) qarzMatn += `🔹 ${pul(qarzUzs)} so'm\n`;
  if (qarzUsd > 0) qarzMatn += `🔹 $${pul(qarzUsd)}\n`;

  const standartMatn =
    `Assalomu alaykum, hurmatli ${m.nom}!\n\n` +
    `PROMAX Store do'konimizdan joriy hisobingiz bo'yicha qarzingiz:\n` +
    `${qarzMatn || "0 so'm\n"}\n` +
    `Iltimos, imkon qadar to'lovni amalga oshirishingizni so'raymiz.\n\n` +
    `Hurmat bilan, PROMAX Store!`;

  const finalMatn = p.xabar_matni || standartMatn;

  // Telegram linkini tayyorlash
  let tgDestination = "";
  let tgLabel = "";
  if (m.telegram) {
    let cleanTg = m.telegram.trim();
    if (cleanTg.startsWith("https://t.me/")) cleanTg = cleanTg.replace("https://t.me/", "");
    if (cleanTg.startsWith("http://t.me/")) cleanTg = cleanTg.replace("http://t.me/", "");
    if (cleanTg.startsWith("t.me/")) cleanTg = cleanTg.replace("t.me/", "");
    cleanTg = cleanTg.replace(/^@/, "");

    if (cleanTg.startsWith("+") || /^\d+$/.test(cleanTg)) {
      const phoneDigits = cleanTg.replace(/[^\d]/g, "");
      tgDestination = `https://t.me/+${phoneDigits}?text=${encodeURIComponent(finalMatn)}`;
    } else {
      tgDestination = `https://t.me/${cleanTg}?text=${encodeURIComponent(finalMatn)}`;
    }
    tgLabel = `@${cleanTg}`;
  } else if (m.telefon) {
    const phoneDigits = m.telefon.replace(/[^\d]/g, "");
    tgDestination = `https://t.me/+${phoneDigits}?text=${encodeURIComponent(finalMatn)}`;
    tgLabel = m.telefon;
  }

  let text = `📩 <b>QARZ ESLATMASI TAYYORLANDI</b>\n\n` +
    `👤 <b>Mijoz:</b> <b>${m.nom}</b>\n` +
    `💵 <b>Umumiy qarzi:</b> ${qarzUzs > 0 ? `<b>${pul(qarzUzs)} so'm</b> ` : ""}${qarzUsd > 0 ? `<b>$${pul(qarzUsd)}</b>` : ""}\n` +
    `📱 <b>Aloqa:</b> ${tgLabel ? `<b>${tgLabel}</b>` : "<i>(Telegram yoki telefon topilmadi)</i>"}\n\n` +
    `✉️ <b>Yuboriladigan xabar:</b>\n` +
    `<blockquote>${formatTelegramHtml(finalMatn)}</blockquote>\n\n` +
    `<i>Xabarni mijozga shaxsan yuborish uchun quyidagi tasdiqlash tugmasini bosing:</i>`;

  const buttons: any[] = [];
  if (m?.id) {
    buttons.push([
      { text: "📄 Qarz Tarixi (PDF Akt-Sverka)", callback_data: `pdf:m:${m.id}` },
    ]);
  }
  if (tgDestination) {
    buttons.push([
      { text: "📲 Telegram orqali yuborish (Tasdiqlash)", url: tgDestination },
    ]);
  }
  buttons.push([
    { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
  ]);

  return { text, keyboard: { inline_keyboard: buttons } };
}

// -----------------------------------------------------------------------------
// BALANS SOZLASH (KORREKTIROVKA) KARTASI
// -----------------------------------------------------------------------------
export function buildBalansSozlashCard(
  draftId: string,
  p: any,
  hisoblar: any[] = []
): { text: string; keyboard: any } {
  const valyuta = p.valyuta || "UZS";
  const yangiBalans = Number(p.yangi_balans) || 0;

  // 1. Agar hisob tanlanmagan bo'lsa -> Admin hisobni tanlaydi
  if (!p.hisob_id) {
    const mosHisoblar = (hisoblar || []).filter(
      (h: any) => h.valyuta === valyuta || h.valyuta === "BARCHASI"
    );
    const list = mosHisoblar.length > 0 ? mosHisoblar : (hisoblar || []);

    const text =
      `⚖️ <b>HISOBNI TANLANG (Balansni to'g'irlash)</b>\n\n` +
      `🎯 Yangi kiritilgan balans: <b>${pul(yangiBalans)} ${valyuta}</b>\n` +
      (p.izoh ? `📝 Izoh: <i>${formatTelegramHtml(p.izoh)}</i>\n\n` : "\n") +
      `❓ Qaysi hisobning qoldig'ini ushbu summaga to'g'irlamoqchisiz?`;

    const buttons: any[] = list.map((h: any) => {
      let icon = "💵";
      if (h.valyuta === "USD") icon = "💲";
      if (h.turi === "plastik") icon = "💳";
      if (h.turi === "bank") icon = "🏦";
      return [{ text: `${icon} ${h.nom}`, callback_data: `bs:sh:${draftId}:${h.id}` }];
    });
    buttons.push([{ text: "❌ Bekor qilish", callback_data: `cn:${draftId}` }]);

    return { text, keyboard: { inline_keyboard: buttons } };
  }

  // 2. Hisob tanlangan -> Yakuniy tasdiqlash kartasi
  const tanlanganHisob = hisoblar.find((h: any) => h.id === p.hisob_id);
  const hisobNomi = tanlanganHisob?.nom || p.hisob_nomi || "Kassa";
  const joriyBalans = Number(p.joriy_balans) || 0;
  const farq = yangiBalans - joriyBalans;

  let farqMatn = "";
  if (farq > 0) {
    farqMatn = `📈 <b>Farq (Kirim):</b> <code>+${pul(farq)} ${valyuta}</code>`;
  } else if (farq < 0) {
    farqMatn = `📉 <b>Farq (Chiqim):</b> <code>-${pul(Math.abs(farq))} ${valyuta}</code>`;
  } else {
    farqMatn = `⚖️ <b>Farq:</b> <code>0 ${valyuta} (Balans allaqachon teng)</code>`;
  }

  const text =
    `⚖️ <b>KASSA BALANSINI TO'G'IRLASH (KORREKTIROVKA)</b>\n\n` +
    `🏦 <b>Hisob:</b> <b>${hisobNomi}</b>\n` +
    `📊 <b>Tizimdagi joriy balans:</b> <code>${pul(joriyBalans)} ${valyuta}</code>\n` +
    `🎯 <b>Yangi real balans:</b> <b>${pul(yangiBalans)} ${valyuta}</b>\n` +
    `${farqMatn}\n` +
    (p.izoh ? `📝 <b>Izoh:</b> <i>${formatTelegramHtml(p.izoh)}</i>\n\n` : "\n") +
    `<i>Ushbu amal hisob qoldig'ini haqiqiy holatga moslaydi va buxgalteriya audit-trail tarixini yaratadi. Tasdiqlaysizmi?</i>`;

  const buttons = [
    [
      { text: "✅ Tasdiqlash", callback_data: `cf:${draftId}` },
      { text: "❌ Bekor qilish", callback_data: `cn:${draftId}` },
    ],
    [{ text: "🔄 Boshqa hisobni tanlash", callback_data: `bs:ch:${draftId}` }],
  ];

  return { text, keyboard: { inline_keyboard: buttons } };
}

