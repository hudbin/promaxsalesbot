import { getSupabase, tgPost, pul, TELEGRAM_API } from "./config";
import * as XLSX from "xlsx";

// =============================================================================
// PROMAX B2B STORE: PROFESSIONAL HISOBOTLAR TIZIMI
// =============================================================================

export type ReportType = "naqd" | "plastik" | "qarz" | "savdo" | "rasxod" | "xulosa";
export type ReportPeriod = "bugun" | "kecha" | "oy";

// 1. SANA ORALIG'INI ANIQ TOSHKEN VAQTI BO'YICHA HISOBLASH
export function getReportDateRange(period: ReportPeriod): {
  startIso: string;
  endIso: string;
  title: string;
  label: string;
  dateStr: string;
} {
  const nowTashkent = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const pad = (n: number) => String(n).padStart(2, "0");

  if (period === "kecha") {
    const yesterday = new Date(nowTashkent);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    return {
      startIso: `${yStr}T00:00:00+05:00`,
      endIso: `${yStr}T23:59:59.999+05:00`,
      title: `Kecha (${pad(yesterday.getDate())}.${pad(yesterday.getMonth() + 1)}.${yesterday.getFullYear()})`,
      label: "Kecha",
      dateStr: yStr,
    };
  } else if (period === "oy") {
    const y = nowTashkent.getFullYear();
    const m = nowTashkent.getMonth() + 1;
    const startStr = `${y}-${pad(m)}-01`;
    const todayStr = `${y}-${pad(m)}-${pad(nowTashkent.getDate())}`;
    return {
      startIso: `${startStr}T00:00:00+05:00`,
      endIso: `${todayStr}T23:59:59.999+05:00`,
      title: `Bu oy (01.${pad(m)} — ${pad(nowTashkent.getDate())}.${pad(m)}.${y})`,
      label: "Bu oy",
      dateStr: `${startStr}_${todayStr}`,
    };
  } else {
    // bugun
    const todayStr = `${nowTashkent.getFullYear()}-${pad(nowTashkent.getMonth() + 1)}-${pad(nowTashkent.getDate())}`;
    return {
      startIso: `${todayStr}T00:00:00+05:00`,
      endIso: `${todayStr}T23:59:59.999+05:00`,
      title: `Bugun (${pad(nowTashkent.getDate())}.${pad(nowTashkent.getMonth() + 1)}.${nowTashkent.getFullYear()})`,
      label: "Bugun",
      dateStr: todayStr,
    };
  }
}

// 2. ASOSIY HISOBOTLAR INLINE MENYUSI
export function getHisobotlarKeyboard(role: string = "sotuvchi") {
  if (role === "admin") {
    return {
      inline_keyboard: [
        [
          { text: "💵 Naqd pul kirimlari", callback_data: "rpt:v:naqd:bugun" },
          { text: "💳 Plastik karta kirimlari", callback_data: "rpt:v:plastik:bugun" },
        ],
        [
          { text: "📒 Qarzga (Nasiya) hisoboti", callback_data: "rpt:v:qarz:bugun" },
          { text: "🛒 Savdo hisoboti", callback_data: "rpt:v:savdo:bugun" },
        ],
        [
          { text: "💸 Rasxodlar (Xarajatlar)", callback_data: "rpt:v:rasxod:bugun" },
          { text: "📊 Kunlik umumiy xulosa", callback_data: "rpt:v:xulosa:bugun" },
        ],
      ],
    };
  }

  // Sotuvchi uchun (Rasxodlar va Xulosa yashirilgan)
  return {
    inline_keyboard: [
      [
        { text: "💵 Naqd pul kirimlari", callback_data: "rpt:v:naqd:bugun" },
        { text: "💳 Plastik karta kirimlari", callback_data: "rpt:v:plastik:bugun" },
      ],
      [
        { text: "🛒 Savdo hisoboti", callback_data: "rpt:v:savdo:bugun" },
        { text: "📒 Qarzga (Nasiya) hisoboti", callback_data: "rpt:v:qarz:bugun" },
      ],
    ],
  };
}

// 3. HISOBOT OSTIDAGI HARAKAT TUGMALARI (NAVIGATSIYA, EXCEL, PDF)
export function getReportActionsKeyboard(
  type: ReportType,
  currentPeriod: ReportPeriod,
  role: string = "sotuvchi"
) {
  const periodRow: any[] = [];
  if (currentPeriod !== "bugun") {
    periodRow.push({ text: "📅 Bugun", callback_data: `rpt:v:${type}:bugun` });
  }
  if (currentPeriod !== "kecha") {
    periodRow.push({ text: "📅 Kecha", callback_data: `rpt:v:${type}:kecha` });
  }
  if (currentPeriod !== "oy") {
    periodRow.push({ text: "📅 Bu oy", callback_data: `rpt:v:${type}:oy` });
  }

  const exportRow = [
    { text: "📊 Excel (.xlsx)", callback_data: `rpt:xl:${type}:${currentPeriod}` },
    { text: "📄 PDF", callback_data: `rpt:pdf:${type}:${currentPeriod}` },
  ];

  const keyboard = [
    periodRow,
    exportRow,
    [{ text: "🔙 Hisobotlar menyusi", callback_data: "rpt:menu" }],
  ];

  return { inline_keyboard: keyboard };
}

// Vaqtni formatlash (14:35)
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// =============================================================================
// 4.1 NAQD PUL KIRIMLARI HISOBOTI
// =============================================================================
export async function buildNaqdReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const [
    { data: savdolar },
    { data: qarzTolovlari },
    { data: boshqaKirimlar },
    { data: kassaKirimlar },
  ] = await Promise.all([
    client
      .from("savdolar")
      .select("id, raqam, sana_vaqt, valyuta, tolangan_summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
      .eq("holat", "yakunlandi")
      .gt("tolangan_summa", 0)
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("qarz_tolovlari")
      .select("id, sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("boshqa_kirimlar")
      .select("id, sana_vaqt, valyuta, summa, kategoriya, manba_nomi, hisob:hisoblar(nom, turi)")
      .neq("holat", "bekor_qilindi")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("kassa_harakatlari")
      .select("id, sana_vaqt, valyuta, summa, manba_turi, izoh, hisob:hisoblar(nom, turi)")
      .eq("amal", "kirim")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
  ]);

  // Faqat naqd to'lovlarni ajratamiz
  const isNaqd = (item: any) => {
    const tTuri = String(item.tolov_turi || "").toLowerCase();
    const hTuri = String(item.hisob?.turi || "").toLowerCase();
    const hNom = String(item.hisob?.nom || "").toLowerCase();
    if (tTuri === "plastik" || tTuri === "bank" || tTuri === "perechisleniya") return false;
    if (hTuri === "plastik" || hTuri === "bank") return false;
    if (hNom.includes("plastik") || hNom.includes("bank") || hNom.includes("karta")) return false;
    return true;
  };

  let savdoNaqdUzs = 0, savdoNaqdUsd = 0, savdoSoni = 0;
  (savdolar || []).filter(isNaqd).forEach((s: any) => {
    const sum = Number(s.tolangan_summa || 0);
    if (s.valyuta === "USD") savdoNaqdUsd += sum;
    else savdoNaqdUzs += sum;
    savdoSoni++;
  });

  let qarzNaqdUzs = 0, qarzNaqdUsd = 0, qarzSoni = 0;
  (qarzTolovlari || []).filter(isNaqd).forEach((q: any) => {
    const sum = Number(q.summa || 0);
    if (q.valyuta === "USD") qarzNaqdUsd += sum;
    else qarzNaqdUzs += sum;
    qarzSoni++;
  });

  let boshqaNaqdUzs = 0, boshqaNaqdUsd = 0, boshqaSoni = 0;
  (boshqaKirimlar || []).filter(isNaqd).forEach((b: any) => {
    const sum = Number(b.summa || 0);
    if (b.valyuta === "USD") boshqaNaqdUsd += sum;
    else boshqaNaqdUzs += sum;
    boshqaSoni++;
  });

  const jamiNaqdUzs = savdoNaqdUzs + qarzNaqdUzs + boshqaNaqdUzs;
  const jamiNaqdUsd = savdoNaqdUsd + qarzNaqdUsd + boshqaNaqdUsd;
  const jamiTranzaksiyalar = savdoSoni + qarzSoni + boshqaSoni;

  let text = `💵 <b>NAQD PUL KIRIMLARI HISOBOTI</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `💰 <b>JAMI NAQD KIRIM:</b>\n`;
  text += `🇺🇿 <b>${pul(jamiNaqdUzs)} so'm</b>\n`;
  if (jamiNaqdUsd > 0) {
    text += `💵 <b>$${pul(jamiNaqdUsd)}</b>\n`;
  }
  text += `🧾 <i>Tranzaksiyalar soni: ${jamiTranzaksiyalar} ta</i>\n\n`;

  text += `📊 <b>Manbalar bo'yicha taqsimot:</b>\n`;
  text += `• 🛒 <b>Savdolardan naqd:</b> ${pul(savdoNaqdUzs)} so'm${savdoNaqdUsd > 0 ? ` | $${pul(savdoNaqdUsd)}` : ""} <i>(${savdoSoni} ta)</i>\n`;
  text += `• 📒 <b>Eski qarz to'lovlaridan:</b> ${pul(qarzNaqdUzs)} so'm${qarzNaqdUsd > 0 ? ` | $${pul(qarzNaqdUsd)}` : ""} <i>(${qarzSoni} ta)</i>\n`;
  if (boshqaNaqdUzs > 0 || boshqaNaqdUsd > 0) {
    text += `• ✨ <b>Boshqa naqd kirimlar:</b> ${pul(boshqaNaqdUzs)} so'm${boshqaNaqdUsd > 0 ? ` | $${pul(boshqaNaqdUsd)}` : ""} <i>(${boshqaSoni} ta)</i>\n`;
  }
  text += `\n`;

  // So'nggi amallar ro'yxati (10 tagacha)
  const allNaqdOps: any[] = [];
  (savdolar || []).filter(isNaqd).forEach((s: any) => {
    allNaqdOps.push({
      vaqt: s.sana_vaqt,
      nom: `Savdo #${s.raqam || ""} (${s.mijoz?.nom || "Chakana"})`,
      summa: Number(s.tolangan_summa || 0),
      valyuta: s.valyuta,
      turi: "savdo",
    });
  });
  (qarzTolovlari || []).filter(isNaqd).forEach((q: any) => {
    allNaqdOps.push({
      vaqt: q.sana_vaqt,
      nom: `Qarz to'lovi (${q.mijoz?.nom || "Mijoz"})`,
      summa: Number(q.summa || 0),
      valyuta: q.valyuta,
      turi: "qarz",
    });
  });
  (boshqaKirimlar || []).filter(isNaqd).forEach((b: any) => {
    allNaqdOps.push({
      vaqt: b.sana_vaqt,
      nom: `Boshqa (${b.manba_nomi || b.kategoriya || "Kirim"})`,
      summa: Number(b.summa || 0),
      valyuta: b.valyuta,
      turi: "boshqa",
    });
  });

  allNaqdOps.sort((a, b) => new Date(b.vaqt).getTime() - new Date(a.vaqt).getTime());

  if (allNaqdOps.length > 0) {
    text += `📋 <b>So'nggi naqd tushumlar:</b>\n`;
    allNaqdOps.slice(0, 8).forEach((op) => {
      const v = formatTime(op.vaqt);
      const valStr = op.valyuta === "USD" ? `$${pul(op.summa)}` : `${pul(op.summa)} so'm`;
      text += `⏱ <code>${v}</code> | <b>${valStr}</b> — ${op.nom}\n`;
    });
    if (allNaqdOps.length > 8) {
      text += `<i>...va yana ${allNaqdOps.length - 8} ta (Excel/PDF da to'liq)</i>\n`;
    }
  } else {
    text += `<i>Ushbu davrda naqd pul kirimi qayd etilmagan.</i>\n`;
  }

  return text;
}

// =============================================================================
// 4.2 PLASTIK KARTA KIRIM HISOBOTI
// =============================================================================
export async function buildPlastikReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const [
    { data: savdolar },
    { data: qarzTolovlari },
    { data: boshqaKirimlar },
  ] = await Promise.all([
    client
      .from("savdolar")
      .select("id, raqam, sana_vaqt, valyuta, tolangan_summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
      .eq("holat", "yakunlandi")
      .gt("tolangan_summa", 0)
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("qarz_tolovlari")
      .select("id, sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("boshqa_kirimlar")
      .select("id, sana_vaqt, valyuta, summa, kategoriya, manba_nomi, hisob:hisoblar(nom, turi)")
      .neq("holat", "bekor_qilindi")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
  ]);

  // Faqat plastik / bank to'lovlarni ajratamiz
  const isPlastik = (item: any) => {
    const tTuri = String(item.tolov_turi || "").toLowerCase();
    const hTuri = String(item.hisob?.turi || "").toLowerCase();
    const hNom = String(item.hisob?.nom || "").toLowerCase();
    if (tTuri === "plastik" || tTuri === "bank" || tTuri === "perechisleniya") return true;
    if (hTuri === "plastik" || hTuri === "bank") return true;
    if (hNom.includes("plastik") || hNom.includes("bank") || hNom.includes("karta") || hNom.includes("humo") || hNom.includes("uzcard")) return true;
    return false;
  };

  let savdoPlastikUzs = 0, savdoSoni = 0;
  (savdolar || []).filter(isPlastik).forEach((s: any) => {
    savdoPlastikUzs += Number(s.tolangan_summa || 0);
    savdoSoni++;
  });

  let qarzPlastikUzs = 0, qarzSoni = 0;
  (qarzTolovlari || []).filter(isPlastik).forEach((q: any) => {
    qarzPlastikUzs += Number(q.summa || 0);
    qarzSoni++;
  });

  let boshqaPlastikUzs = 0, boshqaSoni = 0;
  (boshqaKirimlar || []).filter(isPlastik).forEach((b: any) => {
    boshqaPlastikUzs += Number(b.summa || 0);
    boshqaSoni++;
  });

  const jamiPlastikUzs = savdoPlastikUzs + qarzPlastikUzs + boshqaPlastikUzs;
  const jamiTranzaksiyalar = savdoSoni + qarzSoni + boshqaSoni;

  let text = `💳 <b>PLASTIK KARTA KIRIM HISOBOTI</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `💰 <b>JAMI PLASTIK TUSHUM:</b>\n`;
  text += `🇺🇿 <b>${pul(jamiPlastikUzs)} so'm</b>\n`;
  text += `🧾 <i>Tranzaksiyalar soni: ${jamiTranzaksiyalar} ta</i>\n\n`;

  text += `📊 <b>Tushum turlari bo'yicha:</b>\n`;
  text += `• 🛒 <b>Savdolardan to'lov:</b> ${pul(savdoPlastikUzs)} so'm <i>(${savdoSoni} ta)</i>\n`;
  text += `• 📒 <b>Qarz qaytishi (kartaga):</b> ${pul(qarzPlastikUzs)} so'm <i>(${qarzSoni} ta)</i>\n`;
  if (boshqaPlastikUzs > 0) {
    text += `• ✨ <b>Boshqa tushumlar:</b> ${pul(boshqaPlastikUzs)} so'm <i>(${boshqaSoni} ta)</i>\n`;
  }
  text += `\n`;

  // So'nggi plastik to'lovlar
  const allOps: any[] = [];
  (savdolar || []).filter(isPlastik).forEach((s: any) => {
    allOps.push({
      vaqt: s.sana_vaqt,
      nom: `Savdo #${s.raqam || ""} (${s.mijoz?.nom || "Chakana"})`,
      summa: Number(s.tolangan_summa || 0),
      hisob: s.hisob?.nom || "Plastik",
    });
  });
  (qarzTolovlari || []).filter(isPlastik).forEach((q: any) => {
    allOps.push({
      vaqt: q.sana_vaqt,
      nom: `Qarz to'lovi (${q.mijoz?.nom || "Mijoz"})`,
      summa: Number(q.summa || 0),
      hisob: q.hisob?.nom || "Plastik",
    });
  });
  (boshqaKirimlar || []).filter(isPlastik).forEach((b: any) => {
    allOps.push({
      vaqt: b.sana_vaqt,
      nom: `Boshqa (${b.manba_nomi || b.kategoriya || "Tushum"})`,
      summa: Number(b.summa || 0),
      hisob: b.hisob?.nom || "Plastik",
    });
  });

  allOps.sort((a, b) => new Date(b.vaqt).getTime() - new Date(a.vaqt).getTime());

  if (allOps.length > 0) {
    text += `📋 <b>So'nggi karta tushumlari:</b>\n`;
    allOps.slice(0, 8).forEach((op) => {
      const v = formatTime(op.vaqt);
      text += `⏱ <code>${v}</code> | <b>${pul(op.summa)} so'm</b> — ${op.nom}\n`;
    });
    if (allOps.length > 8) {
      text += `<i>...va yana ${allOps.length - 8} ta (Excel/PDF da to'liq)</i>\n`;
    }
  } else {
    text += `<i>Ushbu davrda karta orqali to'lovlar qayd etilmagan.</i>\n`;
  }

  return text;
}

// =============================================================================
// 4.3 QARZGA (NASIYA) HISOBOTI
// =============================================================================
export async function buildQarzReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const [
    { data: yangiQarzSavdolar },
    { data: qarzTolovlari },
    { data: vozvratlar },
    { data: barchaQarzdorlar },
  ] = await Promise.all([
    client
      .from("savdolar")
      .select("id, raqam, sana_vaqt, valyuta, qarz_summa, mijoz:mijozlar(nom)")
      .eq("holat", "yakunlandi")
      .gt("qarz_summa", 0)
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("qarz_tolovlari")
      .select("id, sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom)")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("tovar_qaytarishlar")
      .select("id, sana_vaqt, valyuta, qarzdan_ayirildi, mijoz:mijozlar(nom)")
      .neq("holat", "bekor_qilindi")
      .gt("qarzdan_ayirildi", 0)
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso)
      .order("sana_vaqt", { ascending: false }),
    client
      .from("mijozlar")
      .select("nom, qarz_uzs, qarz_usd, telefon")
      .eq("faol", true)
      .or("qarz_uzs.gt.0,qarz_usd.gt.0")
      .order("qarz_uzs", { ascending: false }),
  ]);

  // Shu davrdagi yangi berilgan nasiyalar
  let berildiUzs = 0, berildiUsd = 0, berildiSoni = 0;
  (yangiQarzSavdolar || []).forEach((s: any) => {
    const q = Number(s.qarz_summa || 0);
    if (s.valyuta === "USD") berildiUsd += q;
    else berildiUzs += q;
    berildiSoni++;
  });

  // Shu davrda yopilgan (qaytarilgan) qarzlar
  let qaytdiUzs = 0, qaytdiUsd = 0, qaytdiSoni = 0;
  (qarzTolovlari || []).forEach((q: any) => {
    const s = Number(q.summa || 0);
    if (q.valyuta === "USD") qaytdiUsd += s;
    else qaytdiUzs += s;
    qaytdiSoni++;
  });

  // Vozvratlar orqali qarzdan ayirilgani
  let vozvratQarzUzs = 0, vozvratQarzUsd = 0;
  (vozvratlar || []).forEach((v: any) => {
    const s = Number(v.qarzdan_ayirildi || 0);
    if (v.valyuta === "USD") vozvratQarzUsd += s;
    else vozvratQarzUzs += s;
  });

  // Hozirgi kunda do'kondan umumiy qarzdorlik balansi
  let umumiyQarzUzs = 0, umumiyQarzUsd = 0;
  (barchaQarzdorlar || []).forEach((m: any) => {
    umumiyQarzUzs += Number(m.qarz_uzs || 0);
    umumiyQarzUsd += Number(m.qarz_usd || 0);
  });
  const qarzdorlarSoni = barchaQarzdorlar?.length || 0;

  let text = `📒 <b>QARZGA (NASIYA) HISOBOTI</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `⏳ <b>SHU DAVRDAGI NASIYA HARAKATLARI:</b>\n`;
  text += `➕ <b>Yangi berilgan qarz (nasiya):</b>\n`;
  text += `   • 🇺🇿 ${pul(berildiUzs)} so'm${berildiUsd > 0 ? ` | 💵 $${pul(berildiUsd)}` : ""} <i>(${berildiSoni} ta savdoda)</i>\n`;

  text += `➖ <b>Eski qarzlardan yopilgani (tushum):</b>\n`;
  text += `   • 🇺🇿 ${pul(qaytdiUzs)} so'm${qaytdiUsd > 0 ? ` | 💵 $${pul(qaytdiUsd)}` : ""} <i>(${qaytdiSoni} ta to'lov)</i>\n`;

  if (vozvratQarzUzs > 0 || vozvratQarzUsd > 0) {
    text += `↩️ <b>Vozvrat orqali qarzdan kamaygan:</b>\n`;
    text += `   • 🇺🇿 ${pul(vozvratQarzUzs)} so'm${vozvratQarzUsd > 0 ? ` | 💵 $${pul(vozvratQarzUsd)}` : ""}\n`;
  }
  text += `\n`;

  text += `⚖️ <b>UMUMIY QARZDORLIK BALANSI (HOZIRGI HOLAT):</b>\n`;
  text += `👥 Qarzdor mijozlar: <b>${qarzdorlarSoni} ta</b>\n`;
  text += `🔴 Jami olinishi kerak so'm: <b>${pul(umumiyQarzUzs)} so'm</b>\n`;
  if (umumiyQarzUsd > 0) {
    text += `🔴 Jami olinishi kerak dollar: <b>$${pul(umumiyQarzUsd)}</b>\n`;
  }
  text += `\n`;

  if (barchaQarzdorlar && barchaQarzdorlar.length > 0) {
    text += `🔝 <b>Eng katta qarzdorlar (Top 5):</b>\n`;
    barchaQarzdorlar.slice(0, 5).forEach((m: any, i: number) => {
      const u = Number(m.qarz_uzs || 0);
      const d = Number(m.qarz_usd || 0);
      const qMatn = u > 0 && d > 0 ? `${pul(u)} so'm / $${pul(d)}` : u > 0 ? `${pul(u)} so'm` : `$${pul(d)}`;
      text += `${i + 1}. <b>${m.nom}</b>: <code>${qMatn}</code>\n`;
    });
  }

  return text;
}

// =============================================================================
// 4.4 SAVDO HISOBOTI (SOTUVLAR RO'YXATI VA AYLANMASI)
// =============================================================================
export async function buildSavdoReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const { data: savdolar } = await client
    .from("savdolar")
    .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, xodim, mijoz:mijozlar(nom)")
    .eq("holat", "yakunlandi")
    .gte("sana_vaqt", startIso)
    .lte("sana_vaqt", endIso)
    .order("sana_vaqt", { ascending: false });

  let jamiSavdoUzs = 0, jamiSavdoUsd = 0;
  let tolanganUzs = 0, tolanganUsd = 0;
  let qarzUzs = 0, qarzUsd = 0;
  const xodimlarMap: Record<string, number> = {};

  (savdolar || []).forEach((s: any) => {
    const jami = Number(s.jami_summa || 0);
    const tol = Number(s.tolangan_summa || 0);
    const q = Number(s.qarz_summa || 0);

    if (s.valyuta === "USD") {
      jamiSavdoUsd += jami;
      tolanganUsd += tol;
      qarzUsd += q;
    } else {
      jamiSavdoUzs += jami;
      tolanganUzs += tol;
      qarzUzs += q;
    }

    const x = s.xodim || "Do'kon";
    xodimlarMap[x] = (xodimlarMap[x] || 0) + (s.valyuta === "USD" ? jami * 12800 : jami);
  });

  const cheklarSoni = savdolar?.length || 0;
  const ortachaChekUzs = cheklarSoni > 0 ? Math.round(jamiSavdoUzs / cheklarSoni) : 0;

  let text = `🛒 <b>SAVDO VA SOTUV HISOBOTI</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `📈 <b>JAMI SAVDO AYLANMASI:</b>\n`;
  text += `🇺🇿 <b>${pul(jamiSavdoUzs)} so'm</b>\n`;
  if (jamiSavdoUsd > 0) {
    text += `💵 <b>$${pul(jamiSavdoUsd)}</b>\n`;
  }
  text += `🧾 <i>Cheklar soni: ${cheklarSoni} ta | O'rtacha chek: ${pul(ortachaChekUzs)} so'm</i>\n\n`;

  text += `📊 <b>To'lov va Qarz taqsimoti:</b>\n`;
  text += `• 🟢 <b>To'langan (Kassaga tushgan):</b> ${pul(tolanganUzs)} so'm${tolanganUsd > 0 ? ` | $${pul(tolanganUsd)}` : ""}\n`;
  text += `• 🔴 <b>Nasiyaga ketgan:</b> ${pul(qarzUzs)} so'm${qarzUsd > 0 ? ` | $${pul(qarzUsd)}` : ""}\n\n`;

  if (savdolar && savdolar.length > 0) {
    text += `📋 <b>So'nggi savdo cheklari:</b>\n`;
    savdolar.slice(0, 8).forEach((s: any) => {
      const v = formatTime(s.sana_vaqt);
      const valStr = s.valyuta === "USD" ? `$${pul(s.jami_summa)}` : `${pul(s.jami_summa)} so'm`;
      const mijozNom = s.mijoz?.nom || "Chakana";
      text += `⏱ <code>${v}</code> | Chek #${s.raqam || ""} — <b>${valStr}</b> (${mijozNom})\n`;
    });
    if (savdolar.length > 8) {
      text += `<i>...va yana ${savdolar.length - 8} ta savdo (Excel/PDF da to'liq)</i>\n`;
    }
  } else {
    text += `<i>Ushbu davrda savdolar qayd etilmagan.</i>\n`;
  }

  return text;
}

// =============================================================================
// 4.5 RASXODLAR (CHIQIMLAR) HISOBOTI (FAQAT ADMIN)
// =============================================================================
export async function buildRasxodReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const { data: rasxodlar } = await client
    .from("rasxodlar")
    .select("id, sana_vaqt, summa, valyuta, kategoriya, tolov_turi, izoh, xodim, hisob:hisoblar(nom)")
    .neq("holat", "bekor_qilindi")
    .gte("sana_vaqt", startIso)
    .lte("sana_vaqt", endIso)
    .order("sana_vaqt", { ascending: false });

  let jamiRasxodUzs = 0, jamiRasxodUsd = 0;
  const katMapUzs: Record<string, number> = {};
  const katMapUsd: Record<string, number> = {};

  (rasxodlar || []).forEach((r: any) => {
    const s = Number(r.summa || 0);
    const k = r.kategoriya || "Boshqa";
    if (r.valyuta === "USD") {
      jamiRasxodUsd += s;
      katMapUsd[k] = (katMapUsd[k] || 0) + s;
    } else {
      jamiRasxodUzs += s;
      katMapUzs[k] = (katMapUzs[k] || 0) + s;
    }
  });

  const rasxodSoni = rasxodlar?.length || 0;

  let text = `💸 <b>RASXODLAR (XARAJATLAR) HISOBOTI</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `🔴 <b>JAMI XARAJAT:</b>\n`;
  text += `🇺🇿 <b>${pul(jamiRasxodUzs)} so'm</b>\n`;
  if (jamiRasxodUsd > 0) {
    text += `💵 <b>$${pul(jamiRasxodUsd)}</b>\n`;
  }
  text += `🧾 <i>Chiqimlar soni: ${rasxodSoni} ta</i>\n\n`;

  text += `📑 <b>Kategoriyalar bo'yicha taqsimot:</b>\n`;
  const katEntries = Object.entries(katMapUzs).sort((a, b) => b[1] - a[1]);
  if (katEntries.length > 0) {
    katEntries.forEach(([kat, sum]) => {
      text += `• <b>${kat}:</b> ${pul(sum)} so'm\n`;
    });
  }
  Object.entries(katMapUsd).forEach(([kat, sum]) => {
    text += `• <b>${kat} ($):</b> $${pul(sum)}\n`;
  });
  text += `\n`;

  if (rasxodlar && rasxodlar.length > 0) {
    text += `📋 <b>So'nggi xarajatlar:</b>\n`;
    rasxodlar.slice(0, 8).forEach((r: any) => {
      const v = formatTime(r.sana_vaqt);
      const valStr = r.valyuta === "USD" ? `$${pul(r.summa)}` : `${pul(r.summa)} so'm`;
      const izohStr = r.izoh ? ` (${r.izoh})` : "";
      text += `⏱ <code>${v}</code> | <b>${valStr}</b> — ${r.kategoriya}${izohStr}\n`;
    });
    if (rasxodlar.length > 8) {
      text += `<i>...va yana ${rasxodlar.length - 8} ta chiqim (Excel/PDF da to'liq)</i>\n`;
    }
  } else {
    text += `<i>Ushbu davrda rasxodlar qayd etilmagan.</i>\n`;
  }

  return text;
}

// =============================================================================
// 4.6 KUNLIK UMUMIY XULOSA HISOBOTI (FAQAT ADMIN)
// =============================================================================
export async function buildUmumiyXulosaReport(period: ReportPeriod): Promise<string> {
  const client = getSupabase();
  if (!client) return "⚠️ Ma'lumotlar bazasiga ulanib bo'lmadi.";

  const { startIso, endIso, title } = getReportDateRange(period);

  const [
    { data: savdolar },
    { data: rasxodlar },
    { data: qarzTolovlari },
    { data: boshqaKirimlar },
    { data: kassaBalanslar },
  ] = await Promise.all([
    client
      .from("savdolar")
      .select("valyuta, jami_summa, tolangan_summa, qarz_summa")
      .eq("holat", "yakunlandi")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso),
    client
      .from("rasxodlar")
      .select("valyuta, summa")
      .neq("holat", "bekor_qilindi")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso),
    client
      .from("qarz_tolovlari")
      .select("valyuta, summa")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso),
    client
      .from("boshqa_kirimlar")
      .select("valyuta, summa")
      .neq("holat", "bekor_qilindi")
      .gte("sana_vaqt", startIso)
      .lte("sana_vaqt", endIso),
    client.from("view_kassa_balans").select("*"),
  ]);

  let savdoUzs = 0, savdoUsd = 0;
  let savdoTolandiUzs = 0, savdoTolandiUsd = 0;
  let nasiyaUzs = 0, nasiyaUsd = 0;
  (savdolar || []).forEach((s: any) => {
    const jami = Number(s.jami_summa || 0);
    const tol = Number(s.tolangan_summa || 0);
    const q = Number(s.qarz_summa || 0);
    if (s.valyuta === "USD") {
      savdoUsd += jami;
      savdoTolandiUsd += tol;
      nasiyaUsd += q;
    } else {
      savdoUzs += jami;
      savdoTolandiUzs += tol;
      nasiyaUzs += q;
    }
  });

  let qarzTushdiUzs = 0, qarzTushdiUsd = 0;
  (qarzTolovlari || []).forEach((q: any) => {
    const s = Number(q.summa || 0);
    if (q.valyuta === "USD") qarzTushdiUsd += s;
    else qarzTushdiUzs += s;
  });

  let boshqaKirimUzs = 0, boshqaKirimUsd = 0;
  (boshqaKirimlar || []).forEach((b: any) => {
    const s = Number(b.summa || 0);
    if (b.valyuta === "USD") boshqaKirimUsd += s;
    else boshqaKirimUzs += s;
  });

  let rasxodUzs = 0, rasxodUsd = 0;
  (rasxodlar || []).forEach((r: any) => {
    const s = Number(r.summa || 0);
    if (r.valyuta === "USD") rasxodUsd += s;
    else rasxodUzs += s;
  });

  // Jami kassaga kirim
  const jamiKirimUzs = savdoTolandiUzs + qarzTushdiUzs + boshqaKirimUzs;
  const jamiKirimUsd = savdoTolandiUsd + qarzTushdiUsd + boshqaKirimUsd;

  // Sof kassa farqi (Tushum - Chiqim)
  const sofKassaFarqiUzs = jamiKirimUzs - rasxodUzs;
  const sofKassaFarqiUsd = jamiKirimUsd - rasxodUsd;

  let text = `📊 <b>KUNLIK UMUMIY MOLIYAVIY XULOSA</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `🛒 <b>SAVDO AYLANMASI:</b>\n`;
  text += `• Jami savdo: <b>${pul(savdoUzs)} so'm</b>${savdoUsd > 0 ? ` | <b>$${pul(savdoUsd)}</b>` : ""}\n`;
  text += `• To'langan: ${pul(savdoTolandiUzs)} so'm${savdoTolandiUsd > 0 ? ` | $${pul(savdoTolandiUsd)}` : ""}\n`;
  text += `• Nasiya (qarz): ${pul(nasiyaUzs)} so'm${nasiyaUsd > 0 ? ` | $${pul(nasiyaUsd)}` : ""}\n\n`;

  text += `📥 <b>KASSA TUSHUMLARI (KIRIM):</b>\n`;
  text += `• Savdo tushumi: ${pul(savdoTolandiUzs)} so'm\n`;
  text += `• Qarz qaytishi: ${pul(qarzTushdiUzs)} so'm\n`;
  if (boshqaKirimUzs > 0) text += `• Boshqa kirimlar: ${pul(boshqaKirimUzs)} so'm\n`;
  text += `➡️ <b>Jami tushum:</b> <b>${pul(jamiKirimUzs)} so'm</b>${jamiKirimUsd > 0 ? ` | <b>$${pul(jamiKirimUsd)}</b>` : ""}\n\n`;

  text += `📤 <b>XARAJATLAR (CHIQIM):</b>\n`;
  text += `➡️ <b>Jami rasxod:</b> <b>${pul(rasxodUzs)} so'm</b>${rasxodUsd > 0 ? ` | <b>$${pul(rasxodUsd)}</b>` : ""}\n\n`;

  text += `💰 <b>SOF KASSA O'ZGARISHI (Tushum - Chiqim):</b>\n`;
  text += `🇺🇿 <b>${sofKassaFarqiUzs >= 0 ? "+" : ""}${pul(sofKassaFarqiUzs)} so'm</b>\n`;
  if (sofKassaFarqiUsd !== 0) {
    text += `💵 <b>${sofKassaFarqiUsd >= 0 ? "+" : ""}$${pul(sofKassaFarqiUsd)}</b>\n`;
  }
  text += `\n`;

  if (kassaBalanslar && kassaBalanslar.length > 0) {
    text += `🏦 <b>KASSALAR JORIY QOLDIG'I (BALANS):</b>\n`;
    kassaBalanslar.forEach((k: any) => {
      text += `• <b>${k.kassa_nomi}:</b> <code>${pul(k.joriy_balans)} ${k.valyuta}</code>\n`;
    });
  }

  return text;
}

// =============================================================================
// 5. EXCEL FAYL (.XLSX) YARATISH VA YUBORISH
// =============================================================================
export async function sendReportExcel(
  chatId: number | string,
  type: ReportType,
  period: ReportPeriod
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    const { startIso, endIso, title, label } = getReportDateRange(period);
    const wb = XLSX.utils.book_new();

    if (type === "naqd" || type === "plastik") {
      const isPlastikType = type === "plastik";
      const [
        { data: savdolar },
        { data: qarzTolovlari },
        { data: boshqaKirimlar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("raqam, sana_vaqt, valyuta, tolangan_summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
          .eq("holat", "yakunlandi")
          .gt("tolangan_summa", 0)
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("boshqa_kirimlar")
          .select("sana_vaqt, valyuta, summa, kategoriya, manba_nomi, hisob:hisoblar(nom, turi)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
      ]);

      const matchFilter = (item: any) => {
        const t = String(item.tolov_turi || "").toLowerCase();
        const ht = String(item.hisob?.turi || "").toLowerCase();
        const hn = String(item.hisob?.nom || "").toLowerCase();
        const isP = t === "plastik" || t === "bank" || t === "perechisleniya" || ht === "plastik" || ht === "bank" || hn.includes("plastik") || hn.includes("bank") || hn.includes("karta");
        return isPlastikType ? isP : !isP;
      };

      const rows: any[][] = [
        [`PROMAX B2B STORE — ${isPlastikType ? "PLASTIK KARTA" : "NAQD PUL"} KIRIMLARI HISOBOTI`],
        [`Davr: ${title}`],
        [],
        ["T/r", "Vaqt", "Hujjat turi", "Mijoz / Manba", "Hisob / Kassa", "Summa", "Valyuta"],
      ];

      let count = 1;
      (savdolar || []).filter(matchFilter).forEach((s: any) => {
        rows.push([
          count++,
          new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          `Savdo #${s.raqam || ""}`,
          s.mijoz?.nom || "Chakana",
          s.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          Number(s.tolangan_summa || 0),
          s.valyuta,
        ]);
      });
      (qarzTolovlari || []).filter(matchFilter).forEach((q: any) => {
        rows.push([
          count++,
          new Date(q.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Qarz to'lovi",
          q.mijoz?.nom || "Mijoz",
          q.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          Number(q.summa || 0),
          q.valyuta,
        ]);
      });
      (boshqaKirimlar || []).filter(matchFilter).forEach((b: any) => {
        rows.push([
          count++,
          new Date(b.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          `Boshqa (${b.kategoriya || "Kirim"})`,
          b.manba_nomi || "Tushum",
          b.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          Number(b.summa || 0),
          b.valyuta,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, "Kirimlar");

    } else if (type === "savdo") {
      const { data: savdolar } = await client
        .from("savdolar")
        .select("raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, xodim, mijoz:mijozlar(nom)")
        .eq("holat", "yakunlandi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true });

      const rows: any[][] = [
        ["PROMAX B2B STORE — SAVDO VA SOTUV HISOBOTI"],
        [`Davr: ${title}`],
        [],
        ["Chek #", "Vaqt", "Mijoz", "Xodim", "Jami Summa", "To'langan", "Nasiya", "Valyuta", "To'lov turi"],
      ];

      (savdolar || []).forEach((s: any) => {
        rows.push([
          `#${s.raqam || ""}`,
          new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          s.mijoz?.nom || "Chakana",
          s.xodim || "-",
          Number(s.jami_summa || 0),
          Number(s.tolangan_summa || 0),
          Number(s.qarz_summa || 0),
          s.valyuta,
          s.tolov_turi || "-",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, "Savdolar");

    } else if (type === "qarz") {
      const [
        { data: yangiQarzSavdolar },
        { data: qarzTolovlari },
        { data: barchaQarzdorlar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("raqam, sana_vaqt, valyuta, qarz_summa, mijoz:mijozlar(nom)")
          .eq("holat", "yakunlandi")
          .gt("qarz_summa", 0)
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("mijozlar")
          .select("nom, qarz_uzs, qarz_usd, telefon")
          .eq("faol", true)
          .or("qarz_uzs.gt.0,qarz_usd.gt.0")
          .order("qarz_uzs", { ascending: false }),
      ]);

      // 1-Varaq: Shu davrdagi yangi va yopilgan qarzlar
      const hRows: any[][] = [
        ["PROMAX B2B STORE — NASIYA HARAKATLARI"],
        [`Davr: ${title}`],
        [],
        ["T/r", "Vaqt", "Amal turi", "Mijoz", "Summa", "Valyuta", "Izoh"],
      ];
      let hCount = 1;
      (yangiQarzSavdolar || []).forEach((s: any) => {
        hRows.push([
          hCount++,
          new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Yangi Nasiya",
          s.mijoz?.nom || "Mijoz",
          Number(s.qarz_summa || 0),
          s.valyuta,
          `Savdo #${s.raqam || ""}`,
        ]);
      });
      (qarzTolovlari || []).forEach((q: any) => {
        hRows.push([
          hCount++,
          new Date(q.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Qarz to'lovi",
          q.mijoz?.nom || "Mijoz",
          Number(q.summa || 0),
          q.valyuta,
          q.tolov_turi || "Naqd",
        ]);
      });
      const wsH = XLSX.utils.aoa_to_sheet(hRows);
      XLSX.utils.book_append_sheet(wb, wsH, "Nasiya Harakatlari");

      // 2-Varaq: Umumiy qarzdorlar balansi
      const qRows: any[][] = [
        ["UMUMIY QARZDOR MIJOZLAR BALANSI"],
        [],
        ["T/r", "Mijoz", "Qarzi (So'm)", "Qarzi (USD)", "Telefon"],
      ];
      (barchaQarzdorlar || []).forEach((m: any, i: number) => {
        qRows.push([
          i + 1,
          m.nom,
          Number(m.qarz_uzs || 0),
          Number(m.qarz_usd || 0),
          m.telefon || "-",
        ]);
      });
      const wsQ = XLSX.utils.aoa_to_sheet(qRows);
      XLSX.utils.book_append_sheet(wb, wsQ, "Barcha Qarzdorlar");

    } else if (type === "rasxod") {
      const { data: rasxodlar } = await client
        .from("rasxodlar")
        .select("sana_vaqt, summa, valyuta, kategoriya, tolov_turi, izoh, xodim, hisob:hisoblar(nom)")
        .neq("holat", "bekor_qilindi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true });

      const rows: any[][] = [
        ["PROMAX B2B STORE — RASXODLAR (XARAJATLAR) HISOBOTI"],
        [`Davr: ${title}`],
        [],
        ["T/r", "Vaqt", "Kategoriya", "Summa", "Valyuta", "Hisob / Kassa", "Xodim", "Izoh"],
      ];

      (rasxodlar || []).forEach((r: any, i: number) => {
        rows.push([
          i + 1,
          new Date(r.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          r.kategoriya || "Boshqa",
          Number(r.summa || 0),
          r.valyuta,
          r.hisob?.nom || "-",
          r.xodim || "-",
          r.izoh || "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "Rasxodlar");

    } else if (type === "xulosa") {
      const [
        { data: savdolar },
        { data: rasxodlar },
        { data: qarzTolovlari },
        { data: kassaBalanslar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("valyuta, jami_summa, tolangan_summa, qarz_summa")
          .eq("holat", "yakunlandi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
        client
          .from("rasxodlar")
          .select("valyuta, summa")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
        client
          .from("qarz_tolovlari")
          .select("valyuta, summa")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
        client.from("view_kassa_balans").select("*"),
      ]);

      let savdoUzs = 0, savdoUsd = 0, tolanganUzs = 0, tolanganUsd = 0, qarzUzs = 0, qarzUsd = 0;
      (savdolar || []).forEach((s: any) => {
        if (s.valyuta === "USD") {
          savdoUsd += Number(s.jami_summa || 0);
          tolanganUsd += Number(s.tolangan_summa || 0);
          qarzUsd += Number(s.qarz_summa || 0);
        } else {
          savdoUzs += Number(s.jami_summa || 0);
          tolanganUzs += Number(s.tolangan_summa || 0);
          qarzUzs += Number(s.qarz_summa || 0);
        }
      });

      let qarzTushdiUzs = 0, qarzTushdiUsd = 0;
      (qarzTolovlari || []).forEach((q: any) => {
        if (q.valyuta === "USD") qarzTushdiUsd += Number(q.summa || 0);
        else qarzTushdiUzs += Number(q.summa || 0);
      });

      let rasxodUzs = 0, rasxodUsd = 0;
      (rasxodlar || []).forEach((r: any) => {
        if (r.valyuta === "USD") rasxodUsd += Number(r.summa || 0);
        else rasxodUzs += Number(r.summa || 0);
      });

      const xRows = [
        ["PROMAX B2B STORE — MOLIYAVIY XULOSA"],
        [`Davr: ${title}`],
        [],
        ["Ko'rsatkich", "So'm (UZS)", "Dollar (USD)"],
        ["Jami Savdo aylanmasi", savdoUzs, savdoUsd],
        ["Savdodan to'langan qism", tolanganUzs, tolanganUsd],
        ["Nasiyaga ketgan qism", qarzUzs, qarzUsd],
        ["Eski qarzlardan tushgan to'lov", qarzTushdiUzs, qarzTushdiUsd],
        ["Jami Xarajatlar (Rasxod)", rasxodUzs, rasxodUsd],
        ["Sof Kassa farqi (Kirim - Chiqim)", (tolanganUzs + qarzTushdiUzs) - rasxodUzs, (tolanganUsd + qarzTushdiUsd) - rasxodUsd],
        [],
        ["JORIY KASSA VA KARTA QOLDIG'I:"],
        ...((kassaBalanslar || []).map((k: any) => [k.kassa_nomi, Number(k.joriy_balans || 0), k.valyuta])),
      ];

      const ws = XLSX.utils.aoa_to_sheet(xRows);
      XLSX.utils.book_append_sheet(wb, ws, "Moliyaviy Xulosa");
    }

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const filename = `PROMAX_${type.toUpperCase()}_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📊 <b>PROMAX STORE — ${type.toUpperCase()} HISOBOTI (EXCEL)</b>\n📅 <i>${title}</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append(
      "document",
      new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      filename
    );

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    return { ok: resData.ok, error: resData.description };
  } catch (err: any) {
    console.error("sendReportExcel xatosi:", err);
    return { ok: false, error: err?.message };
  }
}

// =============================================================================
// 6. PDF HUJJAT YARATISH VA YUBORISH
// =============================================================================
export async function sendReportPdf(
  chatId: number | string,
  type: ReportType,
  period: ReportPeriod
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    const { startIso, endIso, title } = getReportDateRange(period);

    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Sarlavha
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(`PROMAX B2B STORE — ${type.toUpperCase()} HISOBOTI`, 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    const sanaStr = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    doc.text(`Davr: ${title} | Shakllantirilgan vaqt: ${sanaStr}`, 14, 25);

    let head: string[][] = [];
    let body: any[][] = [];

    if (type === "naqd" || type === "plastik") {
      const isPlastikType = type === "plastik";
      const [
        { data: savdolar },
        { data: qarzTolovlari },
        { data: boshqaKirimlar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("raqam, sana_vaqt, valyuta, tolangan_summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
          .eq("holat", "yakunlandi")
          .gt("tolangan_summa", 0)
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom), hisob:hisoblar(nom, turi)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("boshqa_kirimlar")
          .select("sana_vaqt, valyuta, summa, kategoriya, manba_nomi, hisob:hisoblar(nom, turi)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
      ]);

      const matchFilter = (item: any) => {
        const t = String(item.tolov_turi || "").toLowerCase();
        const ht = String(item.hisob?.turi || "").toLowerCase();
        const hn = String(item.hisob?.nom || "").toLowerCase();
        const isP = t === "plastik" || t === "bank" || t === "perechisleniya" || ht === "plastik" || ht === "bank" || hn.includes("plastik") || hn.includes("bank") || hn.includes("karta");
        return isPlastikType ? isP : !isP;
      };

      head = [["No", "Vaqt", "Hujjat", "Mijoz / Manba", "Kassa", "Summa"]];
      let count = 1;
      (savdolar || []).filter(matchFilter).forEach((s: any) => {
        body.push([
          count++,
          formatTime(s.sana_vaqt),
          `Savdo #${s.raqam || ""}`,
          s.mijoz?.nom || "Chakana",
          s.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          `${pul(s.tolangan_summa)} ${s.valyuta}`,
        ]);
      });
      (qarzTolovlari || []).filter(matchFilter).forEach((q: any) => {
        body.push([
          count++,
          formatTime(q.sana_vaqt),
          "Qarz to'lovi",
          q.mijoz?.nom || "Mijoz",
          q.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          `${pul(q.summa)} ${q.valyuta}`,
        ]);
      });
      (boshqaKirimlar || []).filter(matchFilter).forEach((b: any) => {
        body.push([
          count++,
          formatTime(b.sana_vaqt),
          `Boshqa (${b.kategoriya || ""})`,
          b.manba_nomi || "Tushum",
          b.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          `${pul(b.summa)} ${b.valyuta}`,
        ]);
      });

    } else if (type === "savdo") {
      const { data: savdolar } = await client
        .from("savdolar")
        .select("raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, mijoz:mijozlar(nom)")
        .eq("holat", "yakunlandi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true });

      head = [["Chek #", "Vaqt", "Mijoz", "Jami", "To'langan", "Nasiya"]];
      (savdolar || []).forEach((s: any) => {
        body.push([
          `#${s.raqam || ""}`,
          formatTime(s.sana_vaqt),
          s.mijoz?.nom || "Chakana",
          `${pul(s.jami_summa)} ${s.valyuta}`,
          pul(s.tolangan_summa),
          pul(s.qarz_summa),
        ]);
      });

    } else if (type === "rasxod") {
      const { data: rasxodlar } = await client
        .from("rasxodlar")
        .select("sana_vaqt, summa, valyuta, kategoriya, izoh, hisob:hisoblar(nom)")
        .neq("holat", "bekor_qilindi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true });

      head = [["No", "Vaqt", "Kategoriya", "Summa", "Kassa", "Izoh"]];
      (rasxodlar || []).forEach((r: any, i: number) => {
        body.push([
          i + 1,
          formatTime(r.sana_vaqt),
          r.kategoriya || "Boshqa",
          `${pul(r.summa)} ${r.valyuta}`,
          r.hisob?.nom || "-",
          r.izoh || "",
        ]);
      });

    } else if (type === "qarz") {
      const [
        { data: yangiQarzSavdolar },
        { data: qarzTolovlari },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("raqam, sana_vaqt, valyuta, qarz_summa, mijoz:mijozlar(nom)")
          .eq("holat", "yakunlandi")
          .gt("qarz_summa", 0)
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("sana_vaqt, valyuta, summa, tolov_turi, mijoz:mijozlar(nom)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
      ]);

      head = [["No", "Vaqt", "Amal turi", "Mijoz", "Summa", "Hujjat/Turi"]];
      let qCount = 1;
      (yangiQarzSavdolar || []).forEach((s: any) => {
        body.push([
          qCount++,
          formatTime(s.sana_vaqt),
          "Yangi Nasiya",
          s.mijoz?.nom || "Mijoz",
          `${pul(s.qarz_summa)} ${s.valyuta}`,
          `Savdo #${s.raqam || ""}`,
        ]);
      });
      (qarzTolovlari || []).forEach((q: any) => {
        body.push([
          qCount++,
          formatTime(q.sana_vaqt),
          "Qarz to'lovi",
          q.mijoz?.nom || "Mijoz",
          `${pul(q.summa)} ${q.valyuta}`,
          q.tolov_turi || "Naqd",
        ]);
      });

    } else if (type === "xulosa") {
      const [
        { data: savdolar },
        { data: rasxodlar },
        { data: qarzTolovlari },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("valyuta, jami_summa, tolangan_summa, qarz_summa")
          .eq("holat", "yakunlandi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
        client
          .from("rasxodlar")
          .select("valyuta, summa")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
        client
          .from("qarz_tolovlari")
          .select("valyuta, summa")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso),
      ]);

      let savdoUzs = 0, tolanganUzs = 0, qarzUzs = 0, qarzTushdiUzs = 0, rasxodUzs = 0;
      (savdolar || []).forEach((s: any) => {
        if (s.valyuta !== "USD") {
          savdoUzs += Number(s.jami_summa || 0);
          tolanganUzs += Number(s.tolangan_summa || 0);
          qarzUzs += Number(s.qarz_summa || 0);
        }
      });
      (qarzTolovlari || []).forEach((q: any) => {
        if (q.valyuta !== "USD") qarzTushdiUzs += Number(q.summa || 0);
      });
      (rasxodlar || []).forEach((r: any) => {
        if (r.valyuta !== "USD") rasxodUzs += Number(r.summa || 0);
      });

      head = [["Ko'rsatkich", "Summa (UZS)"]];
      body = [
        ["Jami Savdo aylanmasi", `${pul(savdoUzs)} so'm`],
        ["Savdodan tushgan naqd/karta", `${pul(tolanganUzs)} so'm`],
        ["Nasiyaga ketgan qism", `${pul(qarzUzs)} so'm`],
        ["Eski qarzlardan tushgan to'lov", `${pul(qarzTushdiUzs)} so'm`],
        ["Jami Xarajatlar (Rasxod)", `${pul(rasxodUzs)} so'm`],
        ["Sof Kassa farqi (Kirim - Chiqim)", `${pul((tolanganUzs + qarzTushdiUzs) - rasxodUzs)} so'm`],
      ];
    }

    if (body.length === 0) {
      body.push(["-", "-", "Ma'lumotlar mavjud emas", "-", "-", "-"]);
    }

    autoTable(doc, {
      startY: 32,
      head: head,
      body: body,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 9, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3, textColor: 30 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `PROMAX_${type.toUpperCase()}_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📄 <b>PROMAX STORE — ${type.toUpperCase()} HISOBOTI (PDF)</b>\n📅 <i>${title}</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    return { ok: resData.ok, error: resData.description };
  } catch (err: any) {
    console.error("sendReportPdf xatosi:", err);
    return { ok: false, error: err?.message };
  }
}
