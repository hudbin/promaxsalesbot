import { getSupabase, tgPost, pul, TELEGRAM_API } from "./config";
import * as XLSX from "xlsx";

// =============================================================================
// PROMAX B2B STORE: PROFESSIONAL HISOBOTLAR TIZIMI
// =============================================================================

export type ReportType = "naqd" | "plastik" | "qarz" | "savdo" | "rasxod" | "xulosa";
export type ReportPeriod = "bugun" | "kecha" | "hafta" | "oy" | string;
export type ReportFormat = "matn" | "xlsx" | "pdf" | "ikkisi";

export interface ParsedReportRequest {
  type: ReportType;
  period: ReportPeriod;
  format: ReportFormat;
}

const OY_NOMLARI: Record<number, string> = {
  1: "Yanvar",
  2: "Fevral",
  3: "Mart",
  4: "Aprel",
  5: "May",
  6: "Iyun",
  7: "Iyul",
  8: "Avgust",
  9: "Sentabr",
  10: "Oktabr",
  11: "Noyabr",
  12: "Dekabr",
};

// jsPDF standart Helvetica shriftida kirill harflari va maxsus belgilar buzilib ketmasligi uchun transliteratsiya
function pdfSafeText(text: string | null | undefined): string {
  if (!text) return "";
  const map: Record<string, string> = {
    А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "J", З: "Z", И: "I", Й: "Y",
    К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F",
    Х: "X", Ц: "Ts", Ч: "Ch", Ш: "Sh", Щ: "Sh", Ъ: "'", Ы: "I", Ь: "", Э: "E", Ю: "Yu", Я: "Ya",
    Ў: "O'", Қ: "Q", Ғ: "G'", Ҳ: "H",
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
    ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
    "«": '"', "»": '"', "“": '"', "”": '"', "‘": "'", "’": "'", "—": "-", "–": "-", "№": "No",
  };
  return String(text).replace(/[\u0400-\u04FF«»“”‘’—–№]/g, (ch) => (map[ch] !== undefined ? map[ch] : ch));
}

// 1. SANA ORALIG'INI ANIQ TOSHKENT VAQTI BO'YICHA HISOBLASH
export function getReportDateRange(period: ReportPeriod): {
  startIso: string;
  endIso: string;
  title: string;
  label: string;
  dateStr: string;
  isSingleDay: boolean;
} {
  const nowTashkent = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${nowTashkent.getFullYear()}-${pad(nowTashkent.getMonth() + 1)}-${pad(nowTashkent.getDate())}`;

  const rawP = String(period || "bugun").trim();

  // Maxsus davr: "YYYY-MM-DD_YYYY-MM-DD" yoki bitta sana "YYYY-MM-DD"
  const rangeMatch = rawP.match(/^(\d{4}-\d{2}-\d{2})(?:_(\d{4}-\d{2}-\d{2}))?$/);
  if (rangeMatch) {
    let startStr = rangeMatch[1];
    let endStr = rangeMatch[2] || rangeMatch[1];
    if (startStr > endStr) {
      const tmp = startStr;
      startStr = endStr;
      endStr = tmp;
    }

    const [y1, m1, d1] = startStr.split("-");
    const [y2, m2, d2] = endStr.split("-");
    const oyNomi1 = OY_NOMLARI[Number(m1)] || m1;

    if (startStr === endStr) {
      return {
        startIso: `${startStr}T00:00:00+05:00`,
        endIso: `${startStr}T23:59:59.999+05:00`,
        title: `${d1}.${m1}.${y1} (${Number(d1)}-${oyNomi1} ${y1})`,
        label: `${d1}.${m1}.${y1}`,
        dateStr: startStr,
        isSingleDay: true,
      };
    }

    const lastDayOfMonth = new Date(Number(y1), Number(m1), 0).getDate();
    const isFullMonth = y1 === y2 && m1 === m2 && d1 === "01" && Number(d2) === lastDayOfMonth;

    return {
      startIso: `${startStr}T00:00:00+05:00`,
      endIso: `${endStr}T23:59:59.999+05:00`,
      title: isFullMonth
        ? `${oyNomi1} ${y1} (01.${m1}.${y1} — ${d2}.${m2}.${y2})`
        : `${d1}.${m1}.${y1} — ${d2}.${m2}.${y2}`,
      label: isFullMonth ? `${oyNomi1} ${y1}` : `${d1}.${m1}.${y1} — ${d2}.${m2}.${y2}`,
      dateStr: `${startStr}_${endStr}`,
      isSingleDay: false,
    };
  }

  if (rawP === "kecha") {
    const yesterday = new Date(nowTashkent);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    return {
      startIso: `${yStr}T00:00:00+05:00`,
      endIso: `${yStr}T23:59:59.999+05:00`,
      title: `Kecha (${pad(yesterday.getDate())}.${pad(yesterday.getMonth() + 1)}.${yesterday.getFullYear()})`,
      label: "Kecha",
      dateStr: yStr,
      isSingleDay: true,
    };
  } else if (rawP === "hafta") {
    const weekStart = new Date(nowTashkent);
    weekStart.setDate(weekStart.getDate() - 6);
    const wStr = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
    return {
      startIso: `${wStr}T00:00:00+05:00`,
      endIso: `${todayStr}T23:59:59.999+05:00`,
      title: `Oxirgi 7 kun (${pad(weekStart.getDate())}.${pad(weekStart.getMonth() + 1)} — ${pad(nowTashkent.getDate())}.${pad(nowTashkent.getMonth() + 1)}.${nowTashkent.getFullYear()})`,
      label: "Haftalik",
      dateStr: `${wStr}_${todayStr}`,
      isSingleDay: false,
    };
  } else if (rawP === "oy") {
    const y = nowTashkent.getFullYear();
    const m = nowTashkent.getMonth() + 1;
    const startStr = `${y}-${pad(m)}-01`;
    return {
      startIso: `${startStr}T00:00:00+05:00`,
      endIso: `${todayStr}T23:59:59.999+05:00`,
      title: `Bu oy (${OY_NOMLARI[m]}: 01.${pad(m)} — ${pad(nowTashkent.getDate())}.${pad(m)}.${y})`,
      label: "Bu oy",
      dateStr: `${startStr}_${todayStr}`,
      isSingleDay: false,
    };
  } else {
    // bugun
    return {
      startIso: `${todayStr}T00:00:00+05:00`,
      endIso: `${todayStr}T23:59:59.999+05:00`,
      title: `Bugun (${pad(nowTashkent.getDate())}.${pad(nowTashkent.getMonth() + 1)}.${nowTashkent.getFullYear()})`,
      label: "Bugun",
      dateStr: todayStr,
      isSingleDay: true,
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
          { text: "📊 Umumiy moliyaviy xulosa", callback_data: "rpt:v:xulosa:bugun" },
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
  const exportRow = [
    { text: "📊 Excel (.xlsx) yuklash", callback_data: `rpt:xl:${type}:${currentPeriod}` },
    { text: "📄 PDF (.pdf) yuklash", callback_data: `rpt:pdf:${type}:${currentPeriod}` },
  ];

  // Shu davrning o'zi uchun boshqa hisobot turlariga o'tish tugmalari
  const typeRows: any[][] = [];
  if (role === "admin") {
    const row1: any[] = [];
    if (type !== "xulosa") row1.push({ text: "📊 Umumiy xulosa", callback_data: `rpt:v:xulosa:${currentPeriod}` });
    if (type !== "savdo") row1.push({ text: "🛒 Savdolar", callback_data: `rpt:v:savdo:${currentPeriod}` });
    if (type !== "rasxod") row1.push({ text: "💸 Rasxodlar", callback_data: `rpt:v:rasxod:${currentPeriod}` });
    if (row1.length > 0) typeRows.push(row1);

    const row2: any[] = [];
    if (type !== "qarz") row2.push({ text: "📒 Nasiya/Qarz", callback_data: `rpt:v:qarz:${currentPeriod}` });
    if (type !== "naqd") row2.push({ text: "💵 Naqd", callback_data: `rpt:v:naqd:${currentPeriod}` });
    if (type !== "plastik") row2.push({ text: "💳 Plastik", callback_data: `rpt:v:plastik:${currentPeriod}` });
    if (row2.length > 0) typeRows.push(row2);
  } else {
    const row1: any[] = [];
    if (type !== "savdo") row1.push({ text: "🛒 Savdolar", callback_data: `rpt:v:savdo:${currentPeriod}` });
    if (type !== "qarz") row1.push({ text: "📒 Nasiya", callback_data: `rpt:v:qarz:${currentPeriod}` });
    if (type !== "naqd") row1.push({ text: "💵 Naqd", callback_data: `rpt:v:naqd:${currentPeriod}` });
    if (type !== "plastik") row1.push({ text: "💳 Plastik", callback_data: `rpt:v:plastik:${currentPeriod}` });
    if (row1.length > 0) typeRows.push(row1);
  }

  const periodRow: any[] = [];
  if (currentPeriod !== "bugun") {
    periodRow.push({ text: "📅 Bugun", callback_data: `rpt:v:${type}:bugun` });
  }
  if (currentPeriod !== "kecha") {
    periodRow.push({ text: "📅 Kecha", callback_data: `rpt:v:${type}:kecha` });
  }
  if (currentPeriod !== "hafta") {
    periodRow.push({ text: "📅 Hafta", callback_data: `rpt:v:${type}:hafta` });
  }
  if (currentPeriod !== "oy") {
    periodRow.push({ text: "📅 Bu oy", callback_data: `rpt:v:${type}:oy` });
  }

  const keyboard = [
    exportRow,
    ...typeRows,
    periodRow,
    [{ text: "🔙 Hisobotlar menyusi", callback_data: "rpt:menu" }],
  ];

  return { inline_keyboard: keyboard };
}

// Vaqtni formatlash (14:35 yoki 15.11 14:35)
function formatTime(iso: string, includeDate: boolean = false): string {
  try {
    const d = new Date(iso);
    const timeStr = d.toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" });
    if (!includeDate) return timeStr;
    const dateStr = d.toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit" });
    return `${dateStr} ${timeStr}`;
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

  const { startIso, endIso, title, isSingleDay } = getReportDateRange(period);

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
      const v = formatTime(op.vaqt, !isSingleDay);
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

  const { startIso, endIso, title, isSingleDay } = getReportDateRange(period);

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
      const v = formatTime(op.vaqt, !isSingleDay);
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

  let berildiUzs = 0, berildiUsd = 0, berildiSoni = 0;
  (yangiQarzSavdolar || []).forEach((s: any) => {
    const q = Number(s.qarz_summa || 0);
    if (s.valyuta === "USD") berildiUsd += q;
    else berildiUzs += q;
    berildiSoni++;
  });

  let qaytdiUzs = 0, qaytdiUsd = 0, qaytdiSoni = 0;
  (qarzTolovlari || []).forEach((q: any) => {
    const s = Number(q.summa || 0);
    if (q.valyuta === "USD") qaytdiUsd += s;
    else qaytdiUzs += s;
    qaytdiSoni++;
  });

  let vozvratQarzUzs = 0, vozvratQarzUsd = 0;
  (vozvratlar || []).forEach((v: any) => {
    const s = Number(v.qarzdan_ayirildi || 0);
    if (v.valyuta === "USD") vozvratQarzUsd += s;
    else vozvratQarzUzs += s;
  });

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

  const { startIso, endIso, title, isSingleDay } = getReportDateRange(period);

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
      const v = formatTime(s.sana_vaqt, !isSingleDay);
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

  const { startIso, endIso, title, isSingleDay } = getReportDateRange(period);

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
      const v = formatTime(r.sana_vaqt, !isSingleDay);
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
// 4.6 UMUMIY MOLIYAVIY XULOSA HISOBOTI (KUNLIK, OYLIK VA MAXSUS DAVR)
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
    { data: vozvratlar },
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
      .select("valyuta, summa, kategoriya")
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
    client
      .from("tovar_qaytarishlar")
      .select("valyuta, jami_summa, qarzdan_ayirildi, naqd_qaytarildi")
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

  let vozvratUzs = 0, vozvratUsd = 0;
  let vozvratQarzUzs = 0, vozvratQarzUsd = 0;
  (vozvratlar || []).forEach((v: any) => {
    const j = Number(v.jami_summa || 0);
    const q = Number(v.qarzdan_ayirildi || 0);
    if (v.valyuta === "USD") {
      vozvratUsd += j;
      vozvratQarzUsd += q;
    } else {
      vozvratUzs += j;
      vozvratQarzUzs += q;
    }
  });

  let rasxodUzs = 0, rasxodUsd = 0;
  const katMapUzs: Record<string, number> = {};
  (rasxodlar || []).forEach((r: any) => {
    const s = Number(r.summa || 0);
    if (r.valyuta === "USD") {
      rasxodUsd += s;
    } else {
      rasxodUzs += s;
      const k = r.kategoriya || "Boshqa";
      katMapUzs[k] = (katMapUzs[k] || 0) + s;
    }
  });

  // Jami kassaga kirim
  const jamiKirimUzs = savdoTolandiUzs + qarzTushdiUzs + boshqaKirimUzs;
  const jamiKirimUsd = savdoTolandiUsd + qarzTushdiUsd + boshqaKirimUsd;

  // Sof kassa farqi (Tushum - Chiqim)
  const sofKassaFarqiUzs = jamiKirimUzs - rasxodUzs;
  const sofKassaFarqiUsd = jamiKirimUsd - rasxodUsd;

  let text = `📊 <b>UMUMIY MOLIYAVIY HISOBOT</b>\n`;
  text += `📅 <b>Davr:</b> ${title}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `🛒 <b>SAVDO AYLANMASI (${(savdolar || []).length} ta chek):</b>\n`;
  text += `• Jami savdo: <b>${pul(savdoUzs)} so'm</b>${savdoUsd > 0 ? ` | <b>$${pul(savdoUsd)}</b>` : ""}\n`;
  text += `• Kassaga to'langan: <b>${pul(savdoTolandiUzs)} so'm</b>${savdoTolandiUsd > 0 ? ` | <b>$${pul(savdoTolandiUsd)}</b>` : ""}\n`;
  text += `• Nasiya (qarzga): <b>${pul(nasiyaUzs)} so'm</b>${nasiyaUsd > 0 ? ` | <b>$${pul(nasiyaUsd)}</b>` : ""}\n\n`;

  text += `📥 <b>KASSA TUSHUMLARI (KIRIM):</b>\n`;
  text += `• Savdo tushumi: ${pul(savdoTolandiUzs)} so'm${savdoTolandiUsd > 0 ? ` | $${pul(savdoTolandiUsd)}` : ""}\n`;
  text += `• Eski qarz qaytishi (${(qarzTolovlari || []).length} ta): ${pul(qarzTushdiUzs)} so'm${qarzTushdiUsd > 0 ? ` | $${pul(qarzTushdiUsd)}` : ""}\n`;
  if (boshqaKirimUzs > 0 || boshqaKirimUsd > 0) {
    text += `• Boshqa kirimlar: ${pul(boshqaKirimUzs)} so'm${boshqaKirimUsd > 0 ? ` | $${pul(boshqaKirimUsd)}` : ""}\n`;
  }
  text += `➡️ <b>Jami tushum:</b> <b>${pul(jamiKirimUzs)} so'm</b>${jamiKirimUsd > 0 ? ` | <b>$${pul(jamiKirimUsd)}</b>` : ""}\n\n`;

  if (vozvratUzs > 0 || vozvratUsd > 0) {
    text += `🔄 <b>TOVAR QAYTARISH / VOZVRAT (${(vozvratlar || []).length} ta):</b>\n`;
    text += `• Jami vozvrat: <b>${pul(vozvratUzs)} so'm</b>${vozvratUsd > 0 ? ` | <b>$${pul(vozvratUsd)}</b>` : ""}\n`;
    if (vozvratQarzUzs > 0 || vozvratQarzUsd > 0) {
      text += `• Qarzdan chegirildi: ${pul(vozvratQarzUzs)} so'm${vozvratQarzUsd > 0 ? ` | $${pul(vozvratQarzUsd)}` : ""}\n`;
    }
    text += `\n`;
  }

  text += `📤 <b>XARAJATLAR / CHIQIM (${(rasxodlar || []).length} ta):</b>\n`;
  text += `➡️ <b>Jami rasxod:</b> <b>${pul(rasxodUzs)} so'm</b>${rasxodUsd > 0 ? ` | <b>$${pul(rasxodUsd)}</b>` : ""}\n`;
  const topKats = Object.entries(katMapUzs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topKats.length > 0) {
    topKats.forEach(([k, v]) => {
      text += `   • ${k}: ${pul(v)} so'm\n`;
    });
  }
  text += `\n`;

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

  text += `\n📎 <i>Hisobotni Excel (.xlsx) yoki PDF (.pdf) formatda yuklab olish uchun quyidagi tugmalardan foydalaning:</i>`;

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

    const { startIso, endIso, title, dateStr } = getReportDateRange(period);
    const wb = XLSX.utils.book_new();
    let captionSummary = "";

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
        ["T/r", "Sana va Vaqt", "Hujjat turi", "Mijoz / Manba", "Hisob / Kassa", "Summa", "Valyuta"],
      ];

      let count = 1;
      let totalUzs = 0;
      (savdolar || []).filter(matchFilter).forEach((s: any) => {
        const sum = Number(s.tolangan_summa || 0);
        if (s.valyuta !== "USD") totalUzs += sum;
        rows.push([
          count++,
          new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          `Savdo #${s.raqam || ""}`,
          s.mijoz?.nom || "Chakana",
          s.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          sum,
          s.valyuta,
        ]);
      });
      (qarzTolovlari || []).filter(matchFilter).forEach((q: any) => {
        const sum = Number(q.summa || 0);
        if (q.valyuta !== "USD") totalUzs += sum;
        rows.push([
          count++,
          new Date(q.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Qarz to'lovi",
          q.mijoz?.nom || "Mijoz",
          q.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          sum,
          q.valyuta,
        ]);
      });
      (boshqaKirimlar || []).filter(matchFilter).forEach((b: any) => {
        const sum = Number(b.summa || 0);
        if (b.valyuta !== "USD") totalUzs += sum;
        rows.push([
          count++,
          new Date(b.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          `Boshqa (${b.kategoriya || "Kirim"})`,
          b.manba_nomi || "Tushum",
          b.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd"),
          sum,
          b.valyuta,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, "Kirimlar");
      captionSummary = `💰 <b>Jami kirim:</b> ${pul(totalUzs)} so'm (${count - 1} ta amal)`;

    } else if (type === "savdo") {
      const { data: savdolar } = await client
        .from("savdolar")
        .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, xodim, izoh, mijoz:mijozlar(nom, telefon), hisob:hisoblar(nom), qatorlar:savdo_qatorlari(tovar_nomi, soni, narx, summa)")
        .eq("holat", "yakunlandi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true });

      const rows: any[][] = [
        ["PROMAX B2B STORE — SAVDO VA SOTUV HISOBOTI"],
        [`Davr: ${title}`],
        [],
        ["Chek #", "Sana va Vaqt", "Mijoz", "Telefon", "Xodim", "Jami Summa", "To'langan", "Nasiya", "Valyuta", "To'lov turi", "Hisob"],
      ];

      let jamiUzs = 0, tolUzs = 0, qarzUzs = 0;
      const tovarMap = new Map<string, { nomi: string; soni: number; summa: number; valyuta: string }>();

      (savdolar || []).forEach((s: any) => {
        if (s.valyuta !== "USD") {
          jamiUzs += Number(s.jami_summa || 0);
          tolUzs += Number(s.tolangan_summa || 0);
          qarzUzs += Number(s.qarz_summa || 0);
        }
        rows.push([
          `#${s.raqam || ""}`,
          new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          s.mijoz?.nom || "Chakana",
          s.mijoz?.telefon || "-",
          s.xodim || "-",
          Number(s.jami_summa || 0),
          Number(s.tolangan_summa || 0),
          Number(s.qarz_summa || 0),
          s.valyuta,
          s.tolov_turi || "-",
          s.hisob?.nom || "-",
        ]);
        (s.qatorlar || []).forEach((q: any) => {
          const nomi = q.tovar_nomi || "Tovar";
          if (!tovarMap.has(nomi)) tovarMap.set(nomi, { nomi, soni: 0, summa: 0, valyuta: s.valyuta || "UZS" });
          const t = tovarMap.get(nomi)!;
          t.soni += Number(q.soni || 0);
          t.summa += Number(q.summa || Number(q.soni || 0) * Number(q.narx || 0));
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "Savdolar");

      if (tovarMap.size > 0) {
        const tRows: any[][] = [
          ["SOTILGAN TOVARLAR AYLANMASI"],
          [`Davr: ${title}`],
          [],
          ["T/r", "Tovar nomi", "Sotilgan miqdori", "O'rtacha narx", "Jami tushum", "Valyuta"],
        ];
        Array.from(tovarMap.values())
          .sort((a, b) => b.summa - a.summa)
          .forEach((t, i) => {
            tRows.push([
              i + 1,
              t.nomi,
              t.soni,
              t.soni > 0 ? Math.round(t.summa / t.soni) : 0,
              t.summa,
              t.valyuta,
            ]);
          });
        const wsT = XLSX.utils.aoa_to_sheet(tRows);
        wsT["!cols"] = [{ wch: 6 }, { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsT, "Sotilgan Tovarlar");
      }

      captionSummary =
        `🛒 <b>Jami Savdo:</b> ${pul(jamiUzs)} so'm (${(savdolar || []).length} ta chek)\n` +
        `💵 <b>To'langan:</b> ${pul(tolUzs)} so'm\n` +
        `⏳ <b>Nasiya:</b> ${pul(qarzUzs)} so'm`;

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

      const hRows: any[][] = [
        ["PROMAX B2B STORE — NASIYA HARAKATLARI"],
        [`Davr: ${title}`],
        [],
        ["T/r", "Sana va Vaqt", "Amal turi", "Mijoz", "Summa", "Valyuta", "Izoh"],
      ];
      let hCount = 1;
      let yangiUzs = 0, qaytdiUzs = 0;
      (yangiQarzSavdolar || []).forEach((s: any) => {
        if (s.valyuta !== "USD") yangiUzs += Number(s.qarz_summa || 0);
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
        if (q.valyuta !== "USD") qaytdiUzs += Number(q.summa || 0);
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
      wsH["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsH, "Nasiya Harakatlari");

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
      wsQ["!cols"] = [{ wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsQ, "Barcha Qarzdorlar");

      captionSummary =
        `➕ <b>Berilgan nasiya:</b> ${pul(yangiUzs)} so'm\n` +
        `➖ <b>Qaytarilgan qarz:</b> ${pul(qaytdiUzs)} so'm`;

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
        ["T/r", "Sana va Vaqt", "Kategoriya", "Summa", "Valyuta", "Hisob / Kassa", "Xodim", "Izoh"],
      ];

      let jamiRasxodUzs = 0;
      (rasxodlar || []).forEach((r: any, i: number) => {
        if (r.valyuta !== "USD") jamiRasxodUzs += Number(r.summa || 0);
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
      captionSummary = `💸 <b>Jami Xarajat:</b> ${pul(jamiRasxodUzs)} so'm (${(rasxodlar || []).length} ta chiqim)`;

    } else if (type === "xulosa") {
      const [
        { data: savdolar },
        { data: rasxodlar },
        { data: qarzTolovlari },
        { data: rawBoshqaKirimlar },
        { data: kassaBoshqaKirimlar },
        { data: vozvratlar },
        { data: kassaBalanslar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("*, mijoz:mijozlar(nom, telefon), hisob:hisoblar(nom), qatorlar:savdo_qatorlari(tovar_nomi, soni, narx, summa)")
          .eq("holat", "yakunlandi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("rasxodlar")
          .select("*, hisob:hisoblar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("*, mijoz:mijozlar(nom, telefon), hisob:hisoblar(nom)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("boshqa_kirimlar")
          .select("*, hisob:hisoblar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("kassa_harakatlari")
          .select("*, hisob:hisoblar(nom)")
          .eq("manba_turi", "boshqa_kirim")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("tovar_qaytarishlar")
          .select("*, mijoz:mijozlar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client.from("view_kassa_balans").select("*"),
      ]);

      const boshqaKirimlar = [...(rawBoshqaKirimlar || [])];
      const bkIds = new Set(boshqaKirimlar.map((b: any) => b.id));
      (kassaBoshqaKirimlar || []).forEach((kh: any) => {
        if (!bkIds.has(kh.manba_id) && !bkIds.has(kh.id)) {
          boshqaKirimlar.push({
            id: kh.id,
            sana_vaqt: kh.sana_vaqt,
            summa: kh.summa,
            valyuta: kh.valyuta || "UZS",
            kategoriya: "Boshqa daromad",
            manba_nomi: kh.izoh || "Kassa kirimi",
            izoh: kh.izoh || "",
            hisob: kh.hisob,
          });
        }
      });

      let savdoUzs = 0, savdoUsd = 0, tolanganUzs = 0, tolanganUsd = 0, qarzUzs = 0, qarzUsd = 0;
      const tovarMap = new Map<string, { nomi: string; soni: number; summa: number; valyuta: string }>();
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
        (s.qatorlar || []).forEach((q: any) => {
          const nomi = q.tovar_nomi || "Tovar";
          if (!tovarMap.has(nomi)) tovarMap.set(nomi, { nomi, soni: 0, summa: 0, valyuta: s.valyuta || "UZS" });
          const t = tovarMap.get(nomi)!;
          t.soni += Number(q.soni || 0);
          t.summa += Number(q.summa || Number(q.soni || 0) * Number(q.narx || 0));
        });
      });

      let qarzTushdiUzs = 0, qarzTushdiUsd = 0;
      (qarzTolovlari || []).forEach((q: any) => {
        if (q.valyuta === "USD") qarzTushdiUsd += Number(q.summa || 0);
        else qarzTushdiUzs += Number(q.summa || 0);
      });

      let boshqaKirimUzs = 0, boshqaKirimUsd = 0;
      (boshqaKirimlar || []).forEach((bk: any) => {
        if (bk.valyuta === "USD") boshqaKirimUsd += Number(bk.summa || 0);
        else boshqaKirimUzs += Number(bk.summa || 0);
      });

      let vozvratUzs = 0, vozvratUsd = 0;
      (vozvratlar || []).forEach((v: any) => {
        if (v.valyuta === "USD") vozvratUsd += Number(v.jami_summa || 0);
        else vozvratUzs += Number(v.jami_summa || 0);
      });

      let rasxodUzs = 0, rasxodUsd = 0;
      const rasxodKatMap: Record<string, number> = {};
      (rasxodlar || []).forEach((r: any) => {
        const s = Number(r.summa || 0);
        if (r.valyuta === "USD") {
          rasxodUsd += s;
        } else {
          rasxodUzs += s;
          const k = r.kategoriya || "Boshqa";
          rasxodKatMap[k] = (rasxodKatMap[k] || 0) + s;
        }
      });

      const jamiKirimUzs = tolanganUzs + qarzTushdiUzs + boshqaKirimUzs;
      const jamiKirimUsd = tolanganUsd + qarzTushdiUsd + boshqaKirimUsd;

      // 1-VARAQ: Umumiy Xulosa
      const xRows: any[][] = [
        ["PROMAX B2B STORE — MOLIYAVIY HISOBOT"],
        ["Davr:", title],
        ["Tuzilgan vaqt:", new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })],
        [],
        ["KO'RSATKICH", "SO'M (UZS)", "DOLLAR (USD)"],
        ["Jami Savdo aylanmasi", savdoUzs, savdoUsd],
        ["Savdodan kassaga tushgan to'lovlar", tolanganUzs, tolanganUsd],
        ["Mijozlarga berilgan qarz (nasiya)", qarzUzs, qarzUsd],
        ["Eski qarzlardan qaytgan to'lov", qarzTushdiUzs, qarzTushdiUsd],
        ["Boshqa kirimlar (xizmat va tushum)", boshqaKirimUzs, boshqaKirimUsd],
        ["Tovar qaytarish / Vozvratlar", vozvratUzs, vozvratUsd],
        ["Jami Xarajatlar (Chiqim)", rasxodUzs, rasxodUsd],
        ["Sof Kassa Farqi (Tushum - Chiqim)", jamiKirimUzs - rasxodUzs, jamiKirimUsd - rasxodUsd],
        [],
        ["XARAJATLAR TAQSIMOTI (KATEGORIYALAR BO'YICHA):"],
        ...Object.entries(rasxodKatMap).sort((a, b) => b[1] - a[1]).map(([kat, sum]) => [kat, sum, ""]),
        [],
        ["JORIY HISOBLAR (KASSALAR) QOLDIG'I:"],
        ...((kassaBalanslar || []).map((k: any) => [k.kassa_nomi, Number(k.joriy_balans || 0), k.valyuta])),
      ];
      const wsXulosa = XLSX.utils.aoa_to_sheet(xRows);
      wsXulosa["!cols"] = [{ wch: 36 }, { wch: 20 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsXulosa, "Umumiy Xulosa");

      // 2-VARAQ: Savdolar
      const savdoQatorlari = (savdolar || []).map((s: any) => ({
        "Chek #": s.raqam ? `#${s.raqam}` : "-",
        "Sana va Vaqt": new Date(s.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
        "Mijoz": s.mijoz?.nom || "Chakana",
        "Telefon": s.mijoz?.telefon || "-",
        "Xodim": s.xodim || "-",
        "Jami Summa": Number(s.jami_summa || 0),
        "To'langan": Number(s.tolangan_summa || 0),
        "Qarz (Nasiya)": Number(s.qarz_summa || 0),
        "Valyuta": s.valyuta,
        "To'lov turi": s.tolov_turi || "-",
        "Hisob": s.hisob?.nom || "-",
        "Izoh": s.izoh || "",
      }));
      const wsSavdo = XLSX.utils.json_to_sheet(savdoQatorlari);
      XLSX.utils.book_append_sheet(wb, wsSavdo, "Savdolar");

      // 3-VARAQ: Sotilgan Tovarlar
      if (tovarMap.size > 0) {
        const tovarRows = Array.from(tovarMap.values())
          .sort((a, b) => b.summa - a.summa)
          .map((t, idx) => ({
            "T/r": idx + 1,
            "Tovar nomi": t.nomi,
            "Sotilgan miqdori": t.soni,
            "O'rtacha narx": t.soni > 0 ? Math.round(t.summa / t.soni) : 0,
            "Jami tushum": t.summa,
            "Valyuta": t.valyuta,
          }));
        const wsTovar = XLSX.utils.json_to_sheet(tovarRows);
        XLSX.utils.book_append_sheet(wb, wsTovar, "Sotilgan Tovarlar");
      }

      // 4-VARAQ: Xarajatlar
      const rasxodQatorlari = (rasxodlar || []).map((r: any, idx: number) => ({
        "T/r": idx + 1,
        "Sana va Vaqt": new Date(r.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
        "Kategoriya": r.kategoriya,
        "Summa": Number(r.summa || 0),
        "Valyuta": r.valyuta,
        "To'lov turi": r.tolov_turi || "-",
        "Hisob": r.hisob?.nom || "-",
        "Xodim": r.xodim || "-",
        "Izoh": r.izoh || "",
      }));
      const wsRasxod = XLSX.utils.json_to_sheet(rasxodQatorlari);
      XLSX.utils.book_append_sheet(wb, wsRasxod, "Xarajatlar");

      // 5-VARAQ: Qarz To'lovlari
      const qarzQatorlari = (qarzTolovlari || []).map((q: any, idx: number) => ({
        "T/r": idx + 1,
        "Sana va Vaqt": new Date(q.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
        "Mijoz": q.mijoz?.nom || "Noma'lum",
        "Telefon": q.mijoz?.telefon || "-",
        "Summa": Number(q.summa || 0),
        "Valyuta": q.valyuta,
        "To'lov turi": q.tolov_turi || "-",
        "Hisob": q.hisob?.nom || "-",
        "Xodim": q.xodim || "-",
        "Izoh": q.izoh || "",
      }));
      const wsQarz = XLSX.utils.json_to_sheet(qarzQatorlari);
      XLSX.utils.book_append_sheet(wb, wsQarz, "Qarz To'lovlari");

      // 6-VARAQ: Boshqa Kirimlar (agar mavjud bo'lsa)
      if (boshqaKirimlar.length > 0) {
        const bkQatorlari = boshqaKirimlar.map((bk: any, idx: number) => ({
          "T/r": idx + 1,
          "Sana va Vaqt": new Date(bk.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Kategoriya": bk.kategoriya || "Boshqa daromad",
          "Manba": bk.manba_nomi || "-",
          "Summa": Number(bk.summa || 0),
          "Valyuta": bk.valyuta,
          "Hisob": bk.hisob?.nom || "-",
          "Izoh": bk.izoh || "",
        }));
        const wsBk = XLSX.utils.json_to_sheet(bkQatorlari);
        XLSX.utils.book_append_sheet(wb, wsBk, "Boshqa Kirimlar");
      }

      // 7-VARAQ: Vozvratlar (agar mavjud bo'lsa)
      if ((vozvratlar || []).length > 0) {
        const vQatorlari = (vozvratlar || []).map((v: any, idx: number) => ({
          "T/r": idx + 1,
          "Hujjat": v.raqam ? `#${v.raqam}` : "-",
          "Sana va Vaqt": new Date(v.sana_vaqt).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
          "Mijoz": v.mijoz?.nom || "Mijoz",
          "Jami Summa": Number(v.jami_summa || 0),
          "Qarzdan chegirildi": Number(v.qarzdan_ayirildi || 0),
          "Naqd qaytarildi": Number(v.naqd_qaytarildi || 0),
          "Valyuta": v.valyuta,
          "Izoh": v.izoh || "",
        }));
        const wsV = XLSX.utils.json_to_sheet(vQatorlari);
        XLSX.utils.book_append_sheet(wb, wsV, "Vozvratlar");
      }

      captionSummary =
        `🛒 <b>Jami Savdo:</b> ${pul(savdoUzs)} so'm${savdoUsd > 0 ? ` | $${pul(savdoUsd)}` : ""}\n` +
        `💵 <b>Kassaga Tushum:</b> ${pul(tolanganUzs)} so'm${tolanganUsd > 0 ? ` | $${pul(tolanganUsd)}` : ""}\n` +
        `⏳ <b>Nasiya (Qarz):</b> ${pul(qarzUzs)} so'm${qarzUsd > 0 ? ` | $${pul(qarzUsd)}` : ""}\n` +
        `💳 <b>Eski Qarzlardan:</b> ${pul(qarzTushdiUzs)} so'm${qarzTushdiUsd > 0 ? ` | $${pul(qarzTushdiUsd)}` : ""}\n` +
        (boshqaKirimUzs > 0 ? `📥 <b>Boshqa Kirimlar:</b> ${pul(boshqaKirimUzs)} so'm\n` : "") +
        `💸 <b>Jami Chiqim:</b> ${pul(rasxodUzs)} so'm${rasxodUsd > 0 ? ` | $${pul(rasxodUsd)}` : ""}`;
    }

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const filename = `PROMAX_Hisobot_${type.toUpperCase()}_${dateStr}.xlsx`;

    const caption =
      `📊 <b>PROMAX STORE — ${type === "xulosa" ? "MOLIYAVIY" : type.toUpperCase()} HISOBOT (EXCEL)</b>\n` +
      `📅 <b>Davr:</b> ${title}\n\n` +
      (captionSummary ? `${captionSummary}\n\n` : "") +
      `📎 <i>To'liq tafsilotlar ilova qilingan Excel (.xlsx) faylida jamlangan.</i>`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");
    formData.append(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: [
          [{ text: "📄 PDF (.pdf) shaklida yuklash", callback_data: `rpt:pdf:${type}:${period}` }],
        ],
      })
    );
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

    const { startIso, endIso, title, dateStr, isSingleDay } = getReportDateRange(period);

    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const sanaStr = new Date().toLocaleString("ru-RU", {
      timeZone: "Asia/Tashkent",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let captionSummary = "";

    // -------------------------------------------------------------------------
    // A) UMUMIY MOLIYAVIY HISOBOT ("xulosa") - TO'LIQ BATAFSIL PDF
    // -------------------------------------------------------------------------
    if (type === "xulosa") {
      const [
        { data: rawSavdolar, error: sErr },
        { data: rasxodlar },
        { data: qarzTolovlari },
        { data: vozvratlar },
        { data: boshqaKirimlar },
        { data: kassaBoshqaKirimlar },
        { data: hisoblar },
      ] = await Promise.all([
        client
          .from("savdolar")
          .select("*, mijoz:mijozlar(nom), qatorlar:savdo_qatorlari(tovar_nomi, soni, narx, summa)")
          .eq("holat", "yakunlandi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("rasxodlar")
          .select("*, hisob:hisoblar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("qarz_tolovlari")
          .select("*, mijoz:mijozlar(nom), hisob:hisoblar(nom)")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("tovar_qaytarishlar")
          .select("*, mijoz:mijozlar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("boshqa_kirimlar")
          .select("*, hisob:hisoblar(nom)")
          .neq("holat", "bekor_qilindi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("kassa_harakatlari")
          .select("*, hisob:hisoblar(nom)")
          .eq("manba_turi", "boshqa_kirim")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true }),
        client
          .from("view_kassa_balans")
          .select("*")
          .order("kassa_nomi", { ascending: true }),
      ]);

      let savdolar = rawSavdolar || [];
      if (sErr || !rawSavdolar) {
        const { data: simpleSavdolar } = await client
          .from("savdolar")
          .select("*, mijoz:mijozlar(nom)")
          .eq("holat", "yakunlandi")
          .gte("sana_vaqt", startIso)
          .lte("sana_vaqt", endIso)
          .order("sana_vaqt", { ascending: true });
        savdolar = simpleSavdolar || [];
      }

      const mergedBoshqaKirimlar = [...(boshqaKirimlar || [])];
      const bkIds = new Set(mergedBoshqaKirimlar.map((b: any) => b.id));
      (kassaBoshqaKirimlar || []).forEach((kh: any) => {
        if (!bkIds.has(kh.manba_id) && !bkIds.has(kh.id)) {
          mergedBoshqaKirimlar.push({
            id: kh.id,
            sana_vaqt: kh.sana_vaqt,
            summa: kh.summa,
            valyuta: kh.valyuta || "UZS",
            kategoriya: "Boshqa daromad",
            manba_nomi: kh.izoh || "Kassa kirimi",
            izoh: kh.izoh || "",
            hisob: kh.hisob,
          });
        }
      });

      let savdoUzs = 0, savdoUsd = 0, naqdUzs = 0, naqdUsd = 0, qarzBerildiUzs = 0, qarzBerildiUsd = 0;
      const tovarMap = new Map<string, { nomi: string; soni: number; summa: number; valyuta: string }>();
      (savdolar || []).forEach((s: any) => {
        const jami = Number(s.jami_summa || 0);
        const tolandi = Number(s.tolangan_summa || 0);
        const qarz = Number(s.qarz_summa || 0);
        if (s.valyuta === "USD") {
          savdoUsd += jami;
          naqdUsd += tolandi;
          qarzBerildiUsd += qarz;
        } else {
          savdoUzs += jami;
          naqdUzs += tolandi;
          qarzBerildiUzs += qarz;
        }
        (s.qatorlar || []).forEach((q: any) => {
          const nomi = pdfSafeText(q.tovar_nomi || "Noma'lum tovar");
          if (!tovarMap.has(nomi)) {
            tovarMap.set(nomi, { nomi, soni: 0, summa: 0, valyuta: s.valyuta || "UZS" });
          }
          const t = tovarMap.get(nomi)!;
          t.soni += Number(q.soni || 0);
          t.summa += Number(q.summa || Number(q.soni || 0) * Number(q.narx || 0));
        });
      });
      const topTovarlar = Array.from(tovarMap.values()).sort((a, b) => b.summa - a.summa);

      let eskiQarzTushdiUzs = 0, eskiQarzTushdiUsd = 0;
      (qarzTolovlari || []).forEach((q: any) => {
        const sum = Number(q.summa || 0);
        if (q.valyuta === "USD") eskiQarzTushdiUsd += sum;
        else eskiQarzTushdiUzs += sum;
      });

      let rasxodUzs = 0, rasxodUsd = 0;
      const katMap: Record<string, number> = {};
      (rasxodlar || []).forEach((r: any) => {
        const sum = Number(r.summa || 0);
        if (r.valyuta === "USD") rasxodUsd += sum;
        else {
          rasxodUzs += sum;
          const kat = pdfSafeText(r.kategoriya || "Boshqa");
          katMap[kat] = (katMap[kat] || 0) + sum;
        }
      });

      let boshqaKirimUzs = 0, boshqaKirimUsd = 0;
      (mergedBoshqaKirimlar || []).forEach((bk: any) => {
        const sum = Number(bk.summa || 0);
        if (bk.valyuta === "USD") boshqaKirimUsd += sum;
        else boshqaKirimUzs += sum;
      });

      let vozvratUzs = 0, vozvratUsd = 0;
      (vozvratlar || []).forEach((v: any) => {
        const sum = Number(v.jami_summa || 0);
        if (v.valyuta === "USD") vozvratUsd += sum;
        else vozvratUzs += sum;
      });

      const jamiKirimUzs = naqdUzs + eskiQarzTushdiUzs + boshqaKirimUzs;
      const jamiKirimUsd = naqdUsd + eskiQarzTushdiUsd + boshqaKirimUsd;

      // PDF Sarlavha
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text("PROMAX B2B STORE - MOLIYAVIY HISOBOT", 14, 18);

      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafeText(`Davr: ${title} | Shakllantirildi: ${sanaStr}`), 14, 25);

      // 1. Umumiy ko'rsatkichlar xulosasi jadvali
      const summaryRows: any[][] = [
        ["Jami Savdo aylanmasi", `${pul(savdoUzs)} so'm`, savdoUsd > 0 ? `$${pul(savdoUsd)}` : "-"],
        ["Savdodan kassaga tushum", `${pul(naqdUzs)} so'm`, naqdUsd > 0 ? `$${pul(naqdUsd)}` : "-"],
        ["Yangi berilgan nasiya (qarz)", `${pul(qarzBerildiUzs)} so'm`, qarzBerildiUsd > 0 ? `$${pul(qarzBerildiUsd)}` : "-"],
        ["Eski qarzlardan tushum", `${pul(eskiQarzTushdiUzs)} so'm`, eskiQarzTushdiUsd > 0 ? `$${pul(eskiQarzTushdiUsd)}` : "-"],
      ];
      if (boshqaKirimUzs > 0 || boshqaKirimUsd > 0) {
        summaryRows.push(["Boshqa kirimlar", `${pul(boshqaKirimUzs)} so'm`, boshqaKirimUsd > 0 ? `$${pul(boshqaKirimUsd)}` : "-"]);
      }
      if (vozvratUzs > 0 || vozvratUsd > 0) {
        summaryRows.push(["Tovar qaytarish (Vozvrat)", `${pul(vozvratUzs)} so'm`, vozvratUsd > 0 ? `$${pul(vozvratUsd)}` : "-"]);
      }
      summaryRows.push(["Jami Xarajatlar (Chiqim)", `${pul(rasxodUzs)} so'm`, rasxodUsd > 0 ? `$${pul(rasxodUsd)}` : "-"]);
      summaryRows.push(["Sof Kassa Oqimi (Tushum - Chiqim)", `${pul(jamiKirimUzs - rasxodUzs)} so'm`, jamiKirimUsd - rasxodUsd !== 0 ? `$${pul(jamiKirimUsd - rasxodUsd)}` : "-"]);

      autoTable(doc, {
        startY: 30,
        head: [["Asosiy Ko'rsatkich", "So'm (UZS)", "Dollar (USD)"]],
        body: summaryRows,
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8.5, fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 92, fontStyle: "bold" },
          1: { cellWidth: 50, halign: "right", fontStyle: "bold" },
          2: { cellWidth: 40, halign: "right" },
        },
      });

      let nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 85;

      // 2. Savdolar jadvali
      if (savdolar.length > 0) {
        if (nextY > 230) { doc.addPage(); nextY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`Savdolar ro'yxati (${savdolar.length} ta chek)`, 14, nextY);

        const sRows = savdolar.map((s: any) => [
          s.raqam ? `#${s.raqam}` : "-",
          formatTime(s.sana_vaqt, !isSingleDay),
          pdfSafeText(s.mijoz?.nom || "Chakana xaridor"),
          `${pul(s.jami_summa)} ${s.valyuta}`,
          `${pul(s.tolangan_summa)} ${s.valyuta}`,
          Number(s.qarz_summa) > 0 ? `${pul(s.qarz_summa)} ${s.valyuta}` : "-",
          pdfSafeText(s.tolov_turi || "naqd"),
        ]);

        autoTable(doc, {
          startY: nextY + 3,
          head: [["Chek", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Mijoz", "Jami", "To'landi", "Qarz", "To'lov"]],
          body: sRows,
          theme: "grid",
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });
        nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
      }

      // 3. Sotilgan tovarlar aylanmasi
      if (topTovarlar.length > 0) {
        if (nextY > 230) { doc.addPage(); nextY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`Sotilgan tovarlar aylanmasi (${topTovarlar.length} tur)`, 14, nextY);

        const ttRows = topTovarlar.map((t, idx) => [
          String(idx + 1),
          t.nomi,
          `${pul(t.soni)} dona`,
          `${pul(t.soni > 0 ? Math.round(t.summa / t.soni) : 0)} ${t.valyuta}`,
          `${pul(t.summa)} ${t.valyuta}`,
        ]);

        autoTable(doc, {
          startY: nextY + 3,
          head: [["No", "Tovar nomi", "Sotilgan soni", "O'rtacha narx", "Jami tushum"]],
          body: ttRows,
          theme: "striped",
          headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });
        nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
      }

      // 4. Xarajatlar (Chiqimlar) jadvali
      if ((rasxodlar || []).length > 0) {
        if (nextY > 230) { doc.addPage(); nextY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`Xarajatlar / Chiqimlar (${rasxodlar!.length} ta)`, 14, nextY);

        const rRows = (rasxodlar || []).map((r: any) => [
          formatTime(r.sana_vaqt, !isSingleDay),
          pdfSafeText(r.kategoriya || "Chiqim"),
          pdfSafeText(r.izoh || "-"),
          `${pul(r.summa)} ${r.valyuta}`,
          pdfSafeText(r.hisob?.nom || r.tolov_turi || "naqd"),
        ]);

        autoTable(doc, {
          startY: nextY + 3,
          head: [[isSingleDay ? "Vaqt" : "Sana/Vaqt", "Kategoriya", "Izoh", "Summa", "Hisob / Kassa"]],
          body: rRows,
          theme: "grid",
          headStyles: { fillColor: [244, 63, 94], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });
        nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
      }

      // 5. Qaytarilgan qarzlar jadvali
      if ((qarzTolovlari || []).length > 0) {
        if (nextY > 230) { doc.addPage(); nextY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`Qaytarilgan eski qarzlar (${qarzTolovlari!.length} ta)`, 14, nextY);

        const qRows = (qarzTolovlari || []).map((q: any, idx: number) => [
          String(idx + 1),
          formatTime(q.sana_vaqt, !isSingleDay),
          pdfSafeText(q.mijoz?.nom || "Mijoz"),
          `${pul(q.summa)} ${q.valyuta || "UZS"}`,
          pdfSafeText(q.hisob?.nom || q.tolov_turi || "Naqd"),
          pdfSafeText(q.izoh || "-"),
        ]);

        autoTable(doc, {
          startY: nextY + 3,
          head: [["No", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Mijoz", "Summa", "Hisob / Kassa", "Izoh"]],
          body: qRows,
          theme: "grid",
          headStyles: { fillColor: [217, 119, 6], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });
        nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
      }

      // 6. Kassalar joriy balansi
      if ((hisoblar || []).length > 0) {
        if (nextY > 220) { doc.addPage(); nextY = 20; }
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text("Kassalar va hisoblar joriy balansi", 14, nextY);

        const hRows = (hisoblar || []).map((h: any, idx: number) => [
          String(idx + 1),
          pdfSafeText(h.kassa_nomi || h.nom || "-"),
          pdfSafeText(h.kassa_turi || h.turi || "kassa"),
          `${pul(h.joriy_balans ?? h.balans ?? 0)} ${h.valyuta || "UZS"}`,
        ]);

        autoTable(doc, {
          startY: nextY + 3,
          head: [["No", "Hisob nomi", "Turi", "Joriy balans"]],
          body: hRows,
          theme: "grid",
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });
      }

      captionSummary =
        `🛒 <b>Jami Savdo:</b> ${pul(savdoUzs)} so'm${savdoUsd > 0 ? ` | $${pul(savdoUsd)}` : ""}\n` +
        `💵 <b>Kassaga Tushum:</b> ${pul(naqdUzs)} so'm${naqdUsd > 0 ? ` | $${pul(naqdUsd)}` : ""}\n` +
        `⏳ <b>Nasiya (Qarz):</b> ${pul(qarzBerildiUzs)} so'm${qarzBerildiUsd > 0 ? ` | $${pul(qarzBerildiUsd)}` : ""}\n` +
        `💳 <b>Eski Qarzlardan:</b> ${pul(eskiQarzTushdiUzs)} so'm${eskiQarzTushdiUsd > 0 ? ` | $${pul(eskiQarzTushdiUsd)}` : ""}\n` +
        `💸 <b>Jami Chiqim:</b> ${pul(rasxodUzs)} so'm${rasxodUsd > 0 ? ` | $${pul(rasxodUsd)}` : ""}`;

    } else {
      // -----------------------------------------------------------------------
      // B) MAXSUS KATEGORIYA HISOBOTLARI ("naqd", "plastik", "savdo", "rasxod", "qarz")
      // -----------------------------------------------------------------------
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(pdfSafeText(`PROMAX B2B STORE - ${type.toUpperCase()} HISOBOTI`), 14, 18);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafeText(`Davr: ${title} | Shakllantirilgan vaqt: ${sanaStr}`), 14, 25);

      let head: string[][] = [];
      const body: any[][] = [];

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

        head = [["No", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Hujjat", "Mijoz / Manba", "Kassa", "Summa"]];
        let count = 1;
        (savdolar || []).filter(matchFilter).forEach((s: any) => {
          body.push([
            count++,
            formatTime(s.sana_vaqt, !isSingleDay),
            `Savdo #${s.raqam || ""}`,
            pdfSafeText(s.mijoz?.nom || "Chakana"),
            pdfSafeText(s.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd")),
            `${pul(s.tolangan_summa)} ${s.valyuta}`,
          ]);
        });
        (qarzTolovlari || []).filter(matchFilter).forEach((q: any) => {
          body.push([
            count++,
            formatTime(q.sana_vaqt, !isSingleDay),
            "Qarz to'lovi",
            pdfSafeText(q.mijoz?.nom || "Mijoz"),
            pdfSafeText(q.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd")),
            `${pul(q.summa)} ${q.valyuta}`,
          ]);
        });
        (boshqaKirimlar || []).filter(matchFilter).forEach((b: any) => {
          body.push([
            count++,
            formatTime(b.sana_vaqt, !isSingleDay),
            pdfSafeText(`Boshqa (${b.kategoriya || ""})`),
            pdfSafeText(b.manba_nomi || "Tushum"),
            pdfSafeText(b.hisob?.nom || (isPlastikType ? "Plastik" : "Naqd")),
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

        head = [["Chek #", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Mijoz", "Jami", "To'langan", "Nasiya"]];
        (savdolar || []).forEach((s: any) => {
          body.push([
            `#${s.raqam || ""}`,
            formatTime(s.sana_vaqt, !isSingleDay),
            pdfSafeText(s.mijoz?.nom || "Chakana"),
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

        head = [["No", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Kategoriya", "Summa", "Kassa", "Izoh"]];
        (rasxodlar || []).forEach((r: any, i: number) => {
          body.push([
            i + 1,
            formatTime(r.sana_vaqt, !isSingleDay),
            pdfSafeText(r.kategoriya || "Boshqa"),
            `${pul(r.summa)} ${r.valyuta}`,
            pdfSafeText(r.hisob?.nom || "-"),
            pdfSafeText(r.izoh || ""),
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

        head = [["No", isSingleDay ? "Vaqt" : "Sana/Vaqt", "Amal turi", "Mijoz", "Summa", "Hujjat/Turi"]];
        let qCount = 1;
        (yangiQarzSavdolar || []).forEach((s: any) => {
          body.push([
            qCount++,
            formatTime(s.sana_vaqt, !isSingleDay),
            "Yangi Nasiya",
            pdfSafeText(s.mijoz?.nom || "Mijoz"),
            `${pul(s.qarz_summa)} ${s.valyuta}`,
            `Savdo #${s.raqam || ""}`,
          ]);
        });
        (qarzTolovlari || []).forEach((q: any) => {
          body.push([
            qCount++,
            formatTime(q.sana_vaqt, !isSingleDay),
            "Qarz to'lovi",
            pdfSafeText(q.mijoz?.nom || "Mijoz"),
            `${pul(q.summa)} ${q.valyuta}`,
            pdfSafeText(q.tolov_turi || "Naqd"),
          ]);
        });
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
        styles: { fontSize: 8, cellPadding: 2.5, textColor: 30 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `PROMAX_Hisobot_${type.toUpperCase()}_${dateStr}.pdf`;

    const caption =
      `📄 <b>PROMAX STORE — ${type === "xulosa" ? "MOLIYAVIY" : type.toUpperCase()} HISOBOT (PDF)</b>\n` +
      `📅 <b>Davr:</b> ${title}\n\n` +
      (captionSummary ? `${captionSummary}\n\n` : "") +
      `📎 <i>To'liq tafsilotlar ilova qilingan PDF hujjatda jamlangan.</i>`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");
    formData.append(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: [
          [{ text: "📊 Excel (.xlsx) shaklida yuklash", callback_data: `rpt:xl:${type}:${period}` }],
        ],
      })
    );
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

// =============================================================================
// 7. MATN VA OVOZLI XABARLARDAN DAVR HISOBOTI SO'ROVINI ANIQLASH VA BAJARISH
// =============================================================================

const MONTH_NAME_TO_NUM: Record<string, number> = {
  yanvar: 1,
  fevral: 2,
  mart: 3,
  aprel: 4,
  may: 5,
  iyun: 6,
  iyul: 7,
  avgust: 8,
  sentabr: 9,
  sentyabr: 9,
  oktabr: 10,
  oktyabr: 10,
  noyabr: 11,
  dekabr: 12,
};

function normalizeToLatinLower(text: string): string {
  const cyrMap: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
    ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
  };
  return String(text || "")
    .toLowerCase()
    .replace(/[\u0400-\u04FF]/g, (ch) => (cyrMap[ch] !== undefined ? cyrMap[ch] : ch))
    .replace(/[‘’ʻ`ʼ]/g, "'");
}

export function normalizeReportPeriod(
  sanaBoshlanish?: string | null,
  sanaTugash?: string | null,
  fallbackPeriod?: string | null
): ReportPeriod {
  const cleanDate = (d?: string | null): string | null => {
    if (!d) return null;
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dotMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dotMatch) {
      return `${dotMatch[3]}-${dotMatch[2].padStart(2, "0")}-${dotMatch[1].padStart(2, "0")}`;
    }
    return null;
  };

  const b = cleanDate(sanaBoshlanish);
  const t = cleanDate(sanaTugash);

  if (b && t) {
    return b === t ? b : `${b}_${t}`;
  }
  if (b) return b;
  if (t) return t;
  if (fallbackPeriod && String(fallbackPeriod).trim()) {
    return String(fallbackPeriod).trim();
  }
  return "bugun";
}

/**
 * Foydalanuvchi matni yoki ovozli xabar transkriptidan hisobot so'rovini aniqlash.
 * Misollar:
 * - "noyabr oyi hisobotini ber"
 * - "oktyabr hisoboti pdf"
 * - "1-noyabrdan 20-noyabrgacha hisobotni excelda ber"
 * - "bugungi hisobotni ber", "kechagi hisobot", "shu hafta savdo hisobotini ber"
 */
export function parseUzbekReportRequest(rawText: string): ParsedReportRequest | null {
  if (!rawText || typeof rawText !== "string") return null;
  const norm = normalizeToLatinLower(rawText).trim();
  if (!norm || norm.startsWith("/")) return null;

  // 1. Tranzaksiya yoki oddiy menyu buyrug'i emasligini tekshirish
  const isSimpleMenuCmd =
    norm === "hisobot" ||
    norm === "hisobotlar" ||
    norm === "hisobotlar menyusi" ||
    norm === "hisobotlar ro'yxati" ||
    norm === "hisobotlar royxati" ||
    norm === "hisobotlar ro'yxatini och" ||
    norm === "hisobotlarni ko'rsat" ||
    norm === "hisobotlarni korsat";
  if (isSimpleMenuCmd) return null;

  // Mijoz akt-sverkasi, aniq bir shaxs/mijoz qarzi, tashqi qarz yoki qarzdorlar ro'yxati so'rovlarini o'tkazib yuborish
  if (
    /\b(akt[\s-]*sverka|solishtirma|tashqi\s+qarz|bizning\s+qarz|hamkor\w*|qarzdor\w*\s+ro'?yxat|qarzdor\s+mijoz|qarzdorlar)\b/i.test(norm) ||
    /\b(aka\w*|opa\w*|uka\w*|og'a\w*|oga\w*|hoji\w*|xoji\w*|mijoz)\b/i.test(norm)
  ) {
    return null;
  }

  // Tranzaksiya fe'llari qatnashgan bo'lsa hisobot emas
  if (/\b(sotdim|sotildi|berdim|oldim|qaytardim|ketdi|to'ladi|toladi|tushdi|keldi|vozvrat\s+qildi|vozvrat\s+bo'ldi|ayirib\s+qo'y|to'g'irla|togirla)\b/i.test(norm)) {
    return null;
  }

  // Analitik savollar ("qaysi mijoz", "kim ko'p", "nechta qoldi", "qoldig'i qancha") hisobot emas
  if (/\b(qaysi|kim\b|kimlar|nechta\s+qoldi|omborda\s+qancha)\b/i.test(norm) && !/\b(hisobot\w*|xisobot\w*|otchyot\w*|otchet\w*)\b/i.test(norm)) {
    return null;
  }

  // Xabarda hisobot so'zi borligini tekshirish
  const hasReportWord = /\b(hisobot\w*|xisobot\w*|otchyot\w*|otchet\w*|xulosa\w*|svodka\w*)\b/i.test(norm);
  if (!hasReportWord) return null;

  const nowTashkent = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const curYear = nowTashkent.getFullYear();
  const curMonth = nowTashkent.getMonth() + 1;
  const curDay = nowTashkent.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${curYear}-${pad(curMonth)}-${pad(curDay)}`;

  // 2. Formatni aniqlash
  const hasExcel = /\b(excel\w*|exel\w*|eksel\w*|xlsx|xls|jadval\w*)\b/i.test(norm);
  const hasPdf = /\b(pdf\w*)\b/i.test(norm);
  const hasFileWord = /\b(fayl\w*|hujjat\w*)\b/i.test(norm);

  let format: ReportFormat = "matn";
  if (hasExcel && hasPdf) format = "ikkisi";
  else if (hasExcel) format = "xlsx";
  else if (hasPdf) format = "pdf";
  else if (hasFileWord) format = "ikkisi";

  // 3. Hisobot turini aniqlash
  let type: ReportType = "xulosa";
  if (/\b(rasxod\w*|xarajat\w*|chiqim\w*)\b/i.test(norm) && !/\bkirim\s+va\s+chiqim\b/i.test(norm)) {
    type = "rasxod";
  } else if (/\bnaqd\b/i.test(norm) && !/\b(plastik|karta)\b/i.test(norm)) {
    type = "naqd";
  } else if (/\b(plastik\w*|karta\w*|humo|uzcard|perechislen\w*|bank)\b/i.test(norm) && !/\bnaqd\b/i.test(norm)) {
    type = "plastik";
  } else if (/\b(nasiya\w*|qarz\w*)\b/i.test(norm)) {
    type = "qarz";
  } else if (/\b(savdo\w*|sotuv\w*|chek\w*)\b/i.test(norm) && !/\b(umumiy|moliyaviy|to'liq|toliq|yakuniy|kassa)\b/i.test(norm)) {
    type = "savdo";
  }

  // Yil ko'rsatilgan bo'lsa (masalan 2025 yoki 2026)
  const explicitYearMatch = norm.match(/\b(202\d)\b/);
  const resolveYearForMonth = (m: number): number => {
    if (explicitYearMatch) return Number(explicitYearMatch[1]);
    return m > curMonth ? curYear - 1 : curYear;
  };

  const monthNamesRegex = "(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr)";
  let period: ReportPeriod | null = null;

  // 4.1 YYYY-MM-DD dan YYYY-MM-DD gacha
  const isoRangeMatch = norm.match(/\b(\d{4}-\d{2}-\d{2})\s*(?:dan|[-–—])\s*(\d{4}-\d{2}-\d{2})\b/);
  if (isoRangeMatch) {
    period = `${isoRangeMatch[1]}_${isoRangeMatch[2]}`;
  }

  // 4.2 DD.MM.YYYY (yoki DD.MM) dan DD.MM.YYYY (yoki DD.MM) gacha
  if (!period) {
    const dotRangeMatch = norm.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:dan|[-–—])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (dotRangeMatch) {
      const d1 = Number(dotRangeMatch[1]), m1 = Number(dotRangeMatch[2]);
      const y1Raw = dotRangeMatch[3];
      const d2 = Number(dotRangeMatch[4]), m2 = Number(dotRangeMatch[5]);
      const y2Raw = dotRangeMatch[6];
      const y2 = y2Raw ? (y2Raw.length === 2 ? 2000 + Number(y2Raw) : Number(y2Raw)) : resolveYearForMonth(m2);
      const y1 = y1Raw ? (y1Raw.length === 2 ? 2000 + Number(y1Raw) : Number(y1Raw)) : (m1 > m2 ? y2 - 1 : y2);
      if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        period = `${y1}-${pad(m1)}-${pad(d1)}_${y2}-${pad(m2)}-${pad(d2)}`;
      }
    }
  }

  // 4.3 "1-noyabrdan 15-noyabrgacha" yoki "10-oktyabrdan 5-noyabrgacha"
  if (!period) {
    const twoMonthRange = norm.match(
      new RegExp(`\\b(\\d{1,2})\\s*[-–.]?\\s*${monthNamesRegex}[a-z']*?\\s*(?:dan|[-–—])\\s*(\\d{1,2})\\s*[-–.]?\\s*${monthNamesRegex}`, "i")
    );
    if (twoMonthRange) {
      const d1 = Number(twoMonthRange[1]);
      const m1 = MONTH_NAME_TO_NUM[twoMonthRange[2].toLowerCase()];
      const d2 = Number(twoMonthRange[3]);
      const m2 = MONTH_NAME_TO_NUM[twoMonthRange[4].toLowerCase()];
      if (m1 && m2 && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        const y2 = resolveYearForMonth(m2);
        const y1 = m1 > m2 ? y2 - 1 : y2;
        period = `${y1}-${pad(m1)}-${pad(d1)}_${y2}-${pad(m2)}-${pad(d2)}`;
      }
    }
  }

  // 4.4 "1-dan 15-noyabrgacha" yoki "1-15 noyabr"
  if (!period) {
    const sameMonthRange1 = norm.match(
      new RegExp(`\\b(\\d{1,2})\\s*[-–.]?\\s*(?:sana|kun)?(?:si)?(?:dan|[-–—])\\s*(\\d{1,2})\\s*[-–.]?\\s*${monthNamesRegex}`, "i")
    );
    if (sameMonthRange1) {
      const d1 = Number(sameMonthRange1[1]);
      const d2 = Number(sameMonthRange1[2]);
      const m = MONTH_NAME_TO_NUM[sameMonthRange1[3].toLowerCase()];
      if (m && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        const y = resolveYearForMonth(m);
        period = `${y}-${pad(m)}-${pad(d1)}_${y}-${pad(m)}-${pad(d2)}`;
      }
    }
  }

  // 4.5 "noyabrning 1-sidan 15-sigacha"
  if (!period) {
    const sameMonthRange2 = norm.match(
      new RegExp(`\\b${monthNamesRegex}[a-z']*?\\s*(?:oyi(?:ning)?\\s*)?(\\d{1,2})\\s*[-–.]?\\s*(?:sana|kun)?(?:si)?(?:dan|[-–—])\\s*(\\d{1,2})\\s*[-–.]?\\s*(?:sana|kun)?(?:si)?gacha`, "i")
    );
    if (sameMonthRange2) {
      const m = MONTH_NAME_TO_NUM[sameMonthRange2[1].toLowerCase()];
      const d1 = Number(sameMonthRange2[2]);
      const d2 = Number(sameMonthRange2[3]);
      if (m && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        const y = resolveYearForMonth(m);
        period = `${y}-${pad(m)}-${pad(d1)}_${y}-${pad(m)}-${pad(d2)}`;
      }
    }
  }

  // 4.6 "1-noyabrdan bugungacha"
  if (!period) {
    const toTodayRange = norm.match(
      new RegExp(`\\b(\\d{1,2})\\s*[-–.]?\\s*${monthNamesRegex}[a-z']*?\\s*dan\\s*(?:bugun|hozir)[a-z']*`, "i")
    );
    if (toTodayRange) {
      const d1 = Number(toTodayRange[1]);
      const m1 = MONTH_NAME_TO_NUM[toTodayRange[2].toLowerCase()];
      if (m1 && d1 >= 1 && d1 <= 31) {
        const y1 = resolveYearForMonth(m1);
        period = `${y1}-${pad(m1)}-${pad(d1)}_${todayStr}`;
      }
    }
  }

  // 4.7 Bitta aniq sana oy nomi bilan: "15-noyabr hisoboti"
  if (!period) {
    const singleDayMonth = norm.match(
      new RegExp(`\\b(\\d{1,2})\\s*[-–.]?\\s*${monthNamesRegex}\\b`, "i")
    );
    if (singleDayMonth) {
      const d = Number(singleDayMonth[1]);
      const m = MONTH_NAME_TO_NUM[singleDayMonth[2].toLowerCase()];
      if (m && d >= 1 && d <= 31) {
        const y = resolveYearForMonth(m);
        period = `${y}-${pad(m)}-${pad(d)}`;
      }
    }
  }

  // 4.8 Bitta raqamli sana: "2026-11-15" yoki "15.11.2026" yoki "15.11"
  if (!period) {
    const isoSingle = norm.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoSingle) {
      period = isoSingle[1];
    } else {
      const dotSingle = norm.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
      if (dotSingle) {
        const d = Number(dotSingle[1]);
        const m = Number(dotSingle[2]);
        const yRaw = dotSingle[3];
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const y = yRaw ? (yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)) : resolveYearForMonth(m);
          period = `${y}-${pad(m)}-${pad(d)}`;
        }
      }
    }
  }

  // 4.9 To'liq oy nomi bo'yicha: "noyabr oyi hisobotini ber", "oktyabr hisoboti"
  if (!period) {
    const fullMonthMatch = norm.match(
      new RegExp(`\\b(yanvar|fevral|mart|aprel|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|may(?:\\s+oy|ni|ning|\\s+hisobot))[a-z']*`, "i")
    );
    if (fullMonthMatch) {
      const rawM = fullMonthMatch[1].toLowerCase().split(/\s+/)[0].replace(/(ni|ning)$/, "");
      const m = MONTH_NAME_TO_NUM[rawM];
      if (m) {
        const y = resolveYearForMonth(m);
        const lastDay = new Date(y, m, 0).getDate();
        period = `${y}-${pad(m)}-01_${y}-${pad(m)}-${pad(lastDay)}`;
      }
    }
  }

  // 4.10 Nisbiy davrlar: "o'tgan oy", "shu oy", "haftalik", "kecha", "bugun"
  if (!period) {
    if (/\b(o'tgan\s+oy|otgan\s+oy|oldingi\s+oy)\b/i.test(norm)) {
      const prevM = curMonth === 1 ? 12 : curMonth - 1;
      const prevY = curMonth === 1 ? curYear - 1 : curYear;
      const lastDay = new Date(prevY, prevM, 0).getDate();
      period = `${prevY}-${pad(prevM)}-01_${prevY}-${pad(prevM)}-${pad(lastDay)}`;
    } else if (/\b(shu\s+oy\w*|bu\s+oy\w*|joriy\s+oy\w*|oylik)\b/i.test(norm)) {
      period = "oy";
    } else if (/\b(o'tgan\s+hafta\w*|otgan\s+hafta\w*|oldingi\s+hafta\w*|shu\s+hafta\w*|bu\s+hafta\w*|haftalik|oxirgi\s+7\s+kun\w*|7\s+kunlik)\b/i.test(norm)) {
      period = "hafta";
    } else if (/\b(kecha|kechagi)\b/i.test(norm)) {
      period = "kecha";
    } else if (/\b(bugun|bugungi|kunlik)\b/i.test(norm)) {
      period = "bugun";
    }
  }

  // Agar davr aytilmagan bo'lsa, lekin aniq do'kon hisobot turi (savdo/rasxod/naqd/plastik) so'ralgan bo'lsa -> "bugun"
  if (!period) {
    if (type !== "xulosa" && type !== "qarz") {
      period = "bugun";
    } else {
      return null;
    }
  }

  return { type, period, format };
}

/**
 * Aniqlangan davr hisoboti so'rovini foydalanuvchi ruxsatiga qarab matn, Excel yoki PDF ko'rinishida yuborish
 */
export async function handlePeriodReportRequest(
  chatId: number | string,
  role: string,
  req: ParsedReportRequest
): Promise<void> {
  let targetType: ReportType = req.type || "xulosa";
  const targetPeriod: ReportPeriod = req.period || "bugun";
  const targetFormat: ReportFormat = req.format || "matn";

  // Sotuvchi uchun ruxsat tekshiruvi
  if (role !== "admin") {
    if (targetType === "rasxod") {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "⛔️ <i>Kechirasiz, rasxodlar (xarajatlar) hisoboti faqat administrator uchun ruxsat etilgan.</i>",
        parse_mode: "HTML",
      });
      return;
    }
    if (targetType === "xulosa") {
      targetType = "savdo";
    }
  }

  if (targetFormat === "xlsx") {
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendReportExcel(chatId, targetType, targetPeriod);
    return;
  }

  if (targetFormat === "pdf") {
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendReportPdf(chatId, targetType, targetPeriod);
    return;
  }

  if (targetFormat === "ikkisi") {
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendReportExcel(chatId, targetType, targetPeriod);
    await sendReportPdf(chatId, targetType, targetPeriod);
    return;
  }

  // Standart: To'liq matnli hisobot + Excel va PDF yuklab olish inline tugmalari
  let reportText = "";
  if (targetType === "naqd") reportText = await buildNaqdReport(targetPeriod);
  else if (targetType === "plastik") reportText = await buildPlastikReport(targetPeriod);
  else if (targetType === "qarz") reportText = await buildQarzReport(targetPeriod);
  else if (targetType === "savdo") reportText = await buildSavdoReport(targetPeriod);
  else if (targetType === "rasxod") reportText = await buildRasxodReport(targetPeriod);
  else reportText = await buildUmumiyXulosaReport(targetPeriod);

  const kb = getReportActionsKeyboard(targetType, targetPeriod, role);
  await tgPost("sendMessage", {
    chat_id: chatId,
    text: reportText,
    parse_mode: "HTML",
    reply_markup: kb,
  });
}
