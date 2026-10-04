import React, { useState, useEffect } from "react";
import { 
  Download, 
  Calendar, 
  Send, 
  Share2, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  FileSpreadsheet, 
  RefreshCw, 
  Layers, 
  Clock, 
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { haptic, supabase, pul } from "../lib/supabase";
import * as XLSX from "xlsx";

interface HisobotlarTabProps {
  telegramUserId?: number | string | null;
  xodimNomi?: string;
}

type DavrTuri = "bugun" | "kecha" | "hafta" | "oy" | "boshqa";
type HisobotKategoriya = "hammasi" | "savdolar" | "chiqimlar" | "qarzlar";

export function HisobotlarTab({ telegramUserId, xodimNomi }: HisobotlarTabProps) {
  // Bugungi sana va oyning boshi
  const bugunStr = new Date().toISOString().split("T")[0];
  const oyBoshiStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [davr, setDavr] = useState<DavrTuri>("oy");
  const [boshlanishSana, setBoshlanishSana] = useState(oyBoshiStr);
  const [tugashSana, setTugashSana] = useState(bugunStr);
  const [hisobotTuri, setHisobotTuri] = useState<HisobotKategoriya>("hammasi");

  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [yuborilmoqda, setYuborilmoqda] = useState(false);
  const [xabar, setXabar] = useState<{ turi: "success" | "error"; matn: string } | null>(null);

  // Jonli ma'lumotlar
  const [savdolar, setSavdolar] = useState<any[]>([]);
  const [rasxodlar, setRasxodlar] = useState<any[]>([]);
  const [qarzTolovlari, setQarzTolovlari] = useState<any[]>([]);

  // Davr o'zgarganda sanalarni yangilash
  const davrTanlandi = (d: DavrTuri) => {
    haptic("light");
    setDavr(d);
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (d === "bugun") {
      setBoshlanishSana(today);
      setTugashSana(today);
    } else if (d === "kecha") {
      const yesterday = new Date(now.setDate(now.getDate() - 1)).toISOString().split("T")[0];
      setBoshlanishSana(yesterday);
      setTugashSana(yesterday);
    } else if (d === "hafta") {
      const haftaboshi = new Date();
      haftaboshi.setDate(now.getDate() - 7);
      setBoshlanishSana(haftaboshi.toISOString().split("T")[0]);
      setTugashSana(today);
    } else if (d === "oy") {
      setBoshlanishSana(oyBoshiStr);
      setTugashSana(today);
    }
  };

  // Ma'lumotlarni bazadan tortib olish
  const yuklaMalumotlar = async () => {
    if (!boshlanishSana || !tugashSana) return;
    setYuklanmoqda(true);

    try {
      const startIso = `${boshlanishSana}T00:00:00Z`;
      const endIso = `${tugashSana}T23:59:59Z`;

      // 1. Savdolar
      const { data: sData, error: sErr } = await supabase
        .from("savdolar")
        .select("*, mijoz:mijozlar(nom, telefon)")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: false });

      if (sErr) throw sErr;
      setSavdolar(sData || []);

      // 2. Rasxodlar
      const { data: rData, error: rErr } = await supabase
        .from("rasxodlar")
        .select("*")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: false });

      if (rErr) throw rErr;
      setRasxodlar(rData || []);

      // 3. Qarz to'lovlari
      const { data: qData, error: qErr } = await supabase
        .from("qarz_tolovlari")
        .select("*, mijoz:mijozlar(nom, telefon)")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: false });

      if (qErr) throw qErr;
      setQarzTolovlari(qData || []);

    } catch (err: any) {
      console.error("Hisobot ma'lumotlarini yuklashda xatolik:", err);
      setXabar({ turi: "error", matn: "Ma'lumotlarni yuklab bo'lmadi: " + err.message });
    } finally {
      setYuklanmoqda(false);
    }
  };

  useEffect(() => {
    yuklaMalumotlar();
  }, [boshlanishSana, tugashSana]);

  // Statistikani hisoblash
  let jamiSavdoUZS = 0, jamiSavdoUSD = 0;
  let tushganNaqdUZS = 0, tushganNaqdUSD = 0;
  let berilganQarzUZS = 0, berilganQarzUSD = 0;

  savdolar.forEach((s) => {
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
  const chiqimKategoriyaMap: Record<string, number> = {};
  rasxodlar.forEach((r) => {
    const s = Number(r.summa || 0);
    if (r.valyuta === "USD") {
      jamiChiqimUSD += s;
    } else {
      jamiChiqimUZS += s;
      chiqimKategoriyaMap[r.kategoriya] = (chiqimKategoriyaMap[r.kategoriya] || 0) + s;
    }
  });

  let qaytganQarzUZS = 0, qaytganQarzUSD = 0;
  qarzTolovlari.forEach((q) => {
    const s = Number(q.summa || 0);
    if (q.valyuta === "USD") qaytganQarzUSD += s;
    else qaytganQarzUZS += s;
  });

  // Telegramga Excel fayl yuborish (Eng ishonchli usul)
  const telegramgaYuborish = async (joy: "shaxsiy" | "guruh") => {
    haptic("medium");
    setYuborilmoqda(true);
    setXabar(null);

    try {
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boshlanishSana,
          tugashSana,
          hisobotTuri,
          telegram_user_id: telegramUserId,
          yuborishJoyi: joy,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Server xatosi");
      }

      haptic("success");
      setXabar({
        turi: "success",
        matn: joy === "shaxsiy" 
          ? "📥 Excel hisobot shaxsiy Telegram botingizga yuborildi! Botni ochib faylni yuklab oling." 
          : "📢 Excel hisobot Telegram guruhga yuborildi!",
      });
    } catch (err: any) {
      haptic("error");
      setXabar({
        turi: "error",
        matn: "Faylni yuborishda xatolik: " + err.message,
      });
    } finally {
      setYuborilmoqda(false);
    }
  };

  // Brauzer orqali to'g'ridan-to'g'ri yuklab olish (Kompyuter yoki tashqi brauzer uchun)
  const brauzerdaYuklabOlish = () => {
    haptic("light");
    try {
      const wb = XLSX.utils.book_new();

      // Xulosa varag'i
      const xulosaData = [
        ["PROMAX B2B STORE - MOLIYAVIY HISOBOT"],
        ["Davr:", `${boshlanishSana} dan ${tugashSana} gacha`],
        ["Tuzilgan vaqt:", new Date().toLocaleString("ru-RU")],
        [],
        ["KO'RSATKICH", "SO'M (UZS)", "DOLLAR (USD)"],
        ["Jami Savdo", jamiSavdoUZS, jamiSavdoUSD],
        ["Kassaga kelib tushgan summa", tushganNaqdUZS, tushganNaqdUSD],
        ["Berilgan qarz (nasiya)", berilganQarzUZS, berilganQarzUSD],
        ["Eski qarzlardan tushgan summa", qaytganQarzUZS, qaytganQarzUSD],
        ["Jami Xarajatlar (Chiqim)", jamiChiqimUZS, jamiChiqimUSD],
        ["Sof Kassa Farqi", (tushganNaqdUZS + qaytganQarzUZS) - jamiChiqimUZS, (tushganNaqdUSD + qaytganQarzUSD) - jamiChiqimUSD],
      ];
      const wsXulosa = XLSX.utils.aoa_to_sheet(xulosaData);
      XLSX.utils.book_append_sheet(wb, wsXulosa, "Umumiy Xulosa");

      if (hisobotTuri === "hammasi" || hisobotTuri === "savdolar") {
        const sRows = savdolar.map((s) => ({
          "Chek #": s.raqam ? `#${s.raqam}` : "-",
          "Sana": new Date(s.sana_vaqt).toLocaleString("ru-RU"),
          "Mijoz": s.mijoz?.nom || "Noma'lum",
          "Telefon": s.mijoz?.telefon || "-",
          "Xodim": s.xodim || "-",
          "Jami": Number(s.jami_summa || 0),
          "To'langan": Number(s.tolangan_summa || 0),
          "Qarz": Number(s.qarz_summa || 0),
          "Valyuta": s.valyuta,
          "To'lov turi": s.tolov_turi || "-",
          "Holat": s.holat,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRows), "Savdolar");
      }

      if (hisobotTuri === "hammasi" || hisobotTuri === "chiqimlar") {
        const rRows = rasxodlar.map((r) => ({
          "Sana": new Date(r.sana_vaqt).toLocaleString("ru-RU"),
          "Kategoriya": r.kategoriya,
          "Summa": Number(r.summa || 0),
          "Valyuta": r.valyuta,
          "To'lov turi": r.tolov_turi || "-",
          "Xodim": r.xodim || "-",
          "Izoh": r.izoh || "",
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rRows), "Xarajatlar");
      }

      if (hisobotTuri === "hammasi" || hisobotTuri === "qarzlar") {
        const qRows = qarzTolovlari.map((q) => ({
          "Sana": new Date(q.sana_vaqt).toLocaleString("ru-RU"),
          "Mijoz": q.mijoz?.nom || "Noma'lum",
          "Summa": Number(q.summa || 0),
          "Valyuta": q.valyuta,
          "Xodim": q.xodim || "-",
          "Izoh": q.izoh || "",
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qRows), "Qarz To'lovlari");
      }

      XLSX.writeFile(wb, `PROMAX_Hisobot_${boshlanishSana}_${tugashSana}.xlsx`);
      setXabar({ turi: "success", matn: "Excel fayl yuklab olindi!" });
    } catch (e: any) {
      setXabar({
        turi: "error",
        matn: "Yuklab olishda xatolik: Telegram mobil ilovasi to'g'ridan-to'g'ri yuklashni bloklaydi. Iltimos 'Telegramimga Excel yuborish' tugmasini bosing!",
      });
    }
  };

  return (
    <div className="space-y-3.5 pb-6">
      {/* Yuqori sarlavha va tushuntirish */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-2xs">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 leading-tight">Moliyaviy Hisobotlar</h2>
              <p className="text-[11px] text-slate-500 font-medium">Davr bo'yicha ko'rsatkichlar va Excel eksport</p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic("light");
              yuklaMalumotlar();
            }}
            disabled={yuklanmoqda}
            className="p-2 text-slate-400 hover:text-indigo-600 active:scale-95 transition-transform"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${yuklanmoqda ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>

        {/* Xabar/Ogohlantirish */}
        {xabar && (
          <div
            className={`p-3 mt-2 rounded-xl text-xs font-semibold flex items-start gap-2 ${
              xabar.turi === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {xabar.turi === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
            )}
            <p className="flex-1 leading-snug">{xabar.matn}</p>
          </div>
        )}
      </div>

      {/* 1. Hisobot turini tanlash (Pill buttons) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl shadow-2xs">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
          Hisobot turi:
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: "hammasi", nom: "📊 Barcha ko'rsatkichlar", desc: "Savdo, xarajat va qarzlar" },
            { id: "savdolar", nom: "🛒 Savdolar hisoboti", desc: "Cheklar, sotuv va mijozlar" },
            { id: "chiqimlar", nom: "💸 Chiqimlar hisoboti", desc: "Do'kon barcha xarajatlari" },
            { id: "qarzlar", nom: "👥 Qarzlar & Nasiya", desc: "Qaytarilgan va berilgan qarz" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                haptic("light");
                setHisobotTuri(t.id as HisobotKategoriya);
              }}
              className={`p-2 rounded-xl text-left border transition-all ${
                hisobotTuri === t.id
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-2xs"
                  : "bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              }`}
            >
              <p className="font-bold text-xs leading-tight">{t.nom}</p>
              <p className={`text-[10px] mt-0.5 truncate ${hisobotTuri === t.id ? "text-indigo-100" : "text-slate-400 dark:text-slate-500"}`}>
                {t.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Davrni tanlash (Tezkor tugmalar va sana tanlash) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Davrni tanlang:</label>
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            {boshlanishSana === tugashSana ? boshlanishSana : `${boshlanishSana} — ${tugashSana}`}
          </span>
        </div>

        {/* Tezkor tugmalar */}
        <div className="grid grid-cols-5 gap-1">
          {[
            { id: "bugun", nom: "Bugun" },
            { id: "kecha", nom: "Kecha" },
            { id: "hafta", nom: "Hafta" },
            { id: "oy", nom: "Shu oy" },
            { id: "boshqa", nom: "Boshqa" },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => davrTanlandi(d.id as DavrTuri)}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                davr === d.id
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {d.nom}
            </button>
          ))}
        </div>

        {/* Ixtiyoriy sanalar */}
        {davr === "boshqa" && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Boshlanish:</label>
              <input
                type="date"
                value={boshlanishSana}
                onChange={(e) => setBoshlanishSana(e.target.value)}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Tugash:</label>
              <input
                type="date"
                value={tugashSana}
                onChange={(e) => setTugashSana(e.target.value)}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Jonli ko'rsatkichlar & Xulosa (Foydalanuvchi ko'z oldida ko'radi) */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 px-1">
          <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          Hisobot Ko'rsatkichlari (Xulosa)
        </h3>

        <div className="grid grid-cols-2 gap-2">
          {/* Savdo */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Jami Savdo</span>
            <p className="text-base font-black text-emerald-900 dark:text-emerald-200 tabular-nums leading-tight mt-0.5">
              {pul(jamiSavdoUZS)} <span className="text-xs font-bold">so'm</span>
            </p>
            {jamiSavdoUSD > 0 && (
              <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums">${pul(jamiSavdoUSD)}</p>
            )}
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              {savdolar.length} ta chek
            </p>
          </div>

          {/* Tushum (Kassaga) */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 block">Kassaga Tushum</span>
            <p className="text-base font-black text-blue-900 dark:text-blue-200 tabular-nums leading-tight mt-0.5">
              {pul(tushganNaqdUZS)} <span className="text-xs font-bold">so'm</span>
            </p>
            {tushganNaqdUSD > 0 && (
              <p className="text-xs font-black text-blue-700 dark:text-blue-400 tabular-nums">${pul(tushganNaqdUSD)}</p>
            )}
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
              Naqd & Karta orqali
            </p>
          </div>

          {/* Berilgan qarz */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Qarzga berildi</span>
            <p className="text-base font-black text-amber-900 dark:text-amber-200 tabular-nums leading-tight mt-0.5">
              {pul(berilganQarzUZS)} <span className="text-xs font-bold">so'm</span>
            </p>
            {berilganQarzUSD > 0 && (
              <p className="text-xs font-black text-amber-700 dark:text-amber-400 tabular-nums">${pul(berilganQarzUSD)}</p>
            )}
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
              Yangi nasiyalar
            </p>
          </div>

          {/* Chiqim (Xarajat) */}
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Jami Chiqim</span>
            <p className="text-base font-black text-rose-900 dark:text-rose-200 tabular-nums leading-tight mt-0.5">
              {pul(jamiChiqimUZS)} <span className="text-xs font-bold">so'm</span>
            </p>
            {jamiChiqimUSD > 0 && (
              <p className="text-xs font-black text-rose-700 dark:text-rose-400 tabular-nums">${pul(jamiChiqimUSD)}</p>
            )}
            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
              {rasxodlar.length} ta xarajat
            </p>
          </div>
        </div>

        {/* Eski qarzlardan qaytgan va Sof Kassa Farqi */}
        <div className="bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-xl flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Qarzdan tushum: {pul(qaytganQarzUZS)} so'm
            </span>
            <p className="text-sm font-black text-white mt-0.5">
              Sof Kassa Oqimi: {pul((tushganNaqdUZS + qaytganQarzUZS) - jamiChiqimUZS)} so'm
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 bg-white/10 dark:bg-slate-700/60 rounded-lg text-emerald-400 font-bold">
            {(tushganNaqdUZS + qaytganQarzUZS) >= jamiChiqimUZS ? "📈 Ijobiy" : "📉 Kamomad"}
          </span>
        </div>

        {/* Chiqimlar taqsimoti */}
        {Object.keys(chiqimKategoriyaMap).length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Xarajatlar tarkibi:
            </span>
            <div className="space-y-1.5">
              {Object.entries(chiqimKategoriyaMap).map(([kat, sum]) => (
                <div key={kat} className="flex justify-between items-center text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{kat}</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400 tabular-nums">{pul(sum)} so'm</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Hisobotni Yuklab Olish va Telegramga Yuborish tugmalari */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-2xs space-y-2">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
          Hisobotni olish usuli:
        </label>

        {/* ASOSIY: Telegram Bot orqali Excel faylni olish */}
        <button
          onClick={() => telegramgaYuborish("shaxsiy")}
          disabled={yuborilmoqda || yuklanmoqda}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {yuborilmoqda ? "Telegramga yuborilmoqda..." : "📲 Telegram Botimga Excel Yuborish"}
        </button>

        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center leading-tight">
          💡 Telegram ilovasi ichida Excel faylni 100% ochish va saqlash uchun eng qulay yo'l!
        </p>

        {/* GURUHGA YUBORISH */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => telegramgaYuborish("guruh")}
            disabled={yuborilmoqda || yuklanmoqda}
            className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Guruhga yuborish
          </button>

          {/* Brauzerda to'g'ridan-to'g'ri yuklash */}
          <button
            onClick={brauzerdaYuklabOlish}
            disabled={yuklanmoqda}
            className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            Faylni yuklash (.xlsx)
          </button>
        </div>
      </div>

      {/* 5. Tanlangan davrdagi amallar ro'yxati (Preview) */}
      <div className="space-y-1.5 pt-1">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 px-1">
          <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          Hisobotga kiritilgan amallar ro'yxati
        </h3>

        {/* Savdolar ro'yxati (agar tanlangan bo'lsa) */}
        {(hisobotTuri === "hammasi" || hisobotTuri === "savdolar") && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block px-1">
              Savdolar ({savdolar.length} ta):
            </span>
            {savdolar.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 p-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-center">Bu davrda savdo bo'lmagan.</p>
            ) : (
              savdolar.slice(0, 5).map((s) => (
                <div key={s.id} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{s.mijoz?.nom || "Noma'lum xaridor"}</span>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {new Date(s.sana_vaqt).toLocaleDateString("ru-RU")} · {s.tolov_turi || "naqd"} · {s.xodim || "Xodim"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-emerald-700 dark:text-emerald-400">{pul(s.jami_summa)} {s.valyuta}</span>
                    {Number(s.qarz_summa) > 0 && (
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Qarz: {pul(s.qarz_summa)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {savdolar.length > 5 && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-medium">
                ... va yana {savdolar.length - 5} ta savdo Excel faylida mavjud
              </p>
            )}
          </div>
        )}

        {/* Chiqimlar ro'yxati */}
        {(hisobotTuri === "hammasi" || hisobotTuri === "chiqimlar") && (
          <div className="space-y-1 pt-1.5">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block px-1">
              Xarajatlar ({rasxodlar.length} ta):
            </span>
            {rasxodlar.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 p-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-center">Bu davrda chiqim bo'lmagan.</p>
            ) : (
              rasxodlar.slice(0, 5).map((r) => (
                <div key={r.id} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{r.kategoriya}</span>
                    {r.izoh && <span className="text-[11px] text-slate-500 dark:text-slate-400"> · {r.izoh}</span>}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {new Date(r.sana_vaqt).toLocaleDateString("ru-RU")} · {r.tolov_turi || "naqd"}
                    </p>
                  </div>
                  <span className="font-black text-rose-700 dark:text-rose-400 tabular-nums">−{pul(r.summa)} {r.valyuta}</span>
                </div>
              ))
            )}
            {rasxodlar.length > 5 && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-medium">
                ... va yana {rasxodlar.length - 5} ta chiqim Excel faylida mavjud
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
