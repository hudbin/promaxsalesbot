import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { 
  ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, 
  DollarSign, History, ChevronRight, ArrowRightLeft, Settings
} from "lucide-react";
import { KassaDetailsModal } from "./KassaDetailsModal";
import { TransferModal } from "./TransferModal";
import { HisoblarModal } from "./HisoblarModal";

type AmalFilter = "hammasi" | "kirim" | "chiqim";

interface Props {
  userRole?: string;
}

export function KassaTab({ userRole = "sotuvchi" }: Props) {
  const [balanslar, setBalanslar] = useState<any[]>([]);
  const [hisoblar, setHisoblar] = useState<any[]>([]);
  const [harakatlar, setHarakatlar] = useState<any[]>([]);
  const [amalFilter, setAmalFilter] = useState<AmalFilter>("hammasi");
  const [tanlanganHarakat, setTanlanganHarakat] = useState<any>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showHisoblar, setShowHisoblar] = useState(false);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    yuklaKassa();
  }, []);

  async function yuklaKassa() {
    setYuklanmoqda(true);
    // 1. Jonli balanslar (view dan)
    const { data: b } = await supabase.from("view_kassa_balans").select("*");
    if (b) setBalanslar(b);

    // 2. Active hisoblar
    const { data: hList } = await supabase.from("hisoblar").select("*").eq("faol", true);
    if (hList) setHisoblar(hList);

    // 3. Oxirgi 50 ta kassa harakati
    const { data: h } = await supabase
      .from("kassa_harakatlari")
      .select("*, hisob:hisoblar(nom)")
      .order("sana_vaqt", { ascending: false })
      .limit(50);

    if (h) setHarakatlar(h);
    setYuklanmoqda(false);
  }

  // Filtrlangan harakatlar
  const kirimlar = harakatlar.filter((h) => h.amal === "kirim");
  const chiqimlar = harakatlar.filter((h) => h.amal === "chiqim");

  const saralanganHarakatlar = harakatlar.filter((h) => {
    if (amalFilter === "kirim") return h.amal === "kirim";
    if (amalFilter === "chiqim") return h.amal === "chiqim";
    return true;
  });

  function getManbaYozuv(manba: string) {
    switch (manba) {
      case "savdo": return "Savdo tushumi";
      case "rasxod": return "Xarajat (Rasxod)";
      case "qarz_tolov": return "Qarz to'lovi";
      case "kassalar_aro": return "Kassalar aro";
      case "transfer": return "O'tkazma";
      case "boshlangich": return "Boshlang'ich";
      default: return manba || "Boshqa";
    }
  }

  const [kompaktRejim, setKompaktRejim] = useState<boolean>(() => {
    try {
      return localStorage.getItem("kassa_kompakt_rejim") !== "false";
    } catch {
      return true;
    }
  });

  const toggleKompakt = () => {
    haptic("light");
    setKompaktRejim((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("kassa_kompakt_rejim", String(next));
      } catch {}
      return next;
    });
  };

  // Jami summalarni hisoblash
  const jamiUZS = balanslar
    .filter((b) => b.valyuta === "UZS")
    .reduce((sum, b) => sum + (Number(b.joriy_balans) || 0), 0);
  const jamiUSD = balanslar
    .filter((b) => b.valyuta === "USD")
    .reduce((sum, b) => sum + (Number(b.joriy_balans) || 0), 0);

  return (
    <div className="space-y-3 pb-8">
      {/* Kassa Hisoblari Ko'rinishi (Kompakt va Keng variantlar bilan) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight">
                Hisoblar Balansi
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {balanslar.length} ta hisob raqami
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Jami UZS / USD indikatorlari */}
            <div className="hidden sm:flex items-center gap-1.5 mr-1">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                UZS: {pul(jamiUZS)}
              </span>
              {jamiUSD !== 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900">
                  USD: ${pul(jamiUSD)}
                </span>
              )}
            </div>

            {/* Kompakt / Keng Rejim Tugmasi */}
            <button
              onClick={toggleKompakt}
              title={kompaktRejim ? "Keng ko'rinishga o'tish" : "Kompakt ko'rinishga o'tish"}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 transition-all flex items-center gap-1 active:scale-95"
            >
              <span>{kompaktRejim ? "⚡ Kompakt" : "📑 Keng"}</span>
            </button>
          </div>
        </div>

        {/* Jami summalar mobil qatori */}
        <div className="flex sm:hidden items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <span>Jami:</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {pul(jamiUZS)} so'm
            </span>
          </div>
          {jamiUSD !== 0 && (
            <div className="text-[11px] font-black text-amber-600 dark:text-amber-400 tabular-nums">
              ${pul(jamiUSD)}
            </div>
          )}
        </div>

        {/* 1-VARIANT: KOMPAKT KO'RINISHDAGI HISOBLAR */}
        {kompaktRejim ? (
          <div className="grid grid-cols-2 gap-2">
            {balanslar.map((b) => {
              const isUSD = b.valyuta === "USD";
              const isPlastik = b.kassa_turi === "plastik";
              const isBank = b.kassa_turi === "bank";
              
              const borderTheme = isUSD
                ? "border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20"
                : isPlastik
                ? "border-blue-200/80 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20"
                : isBank
                ? "border-purple-200/80 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20"
                : "border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20";

              const badgeColor = isUSD
                ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60"
                : isPlastik
                ? "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60"
                : isBank
                ? "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/60"
                : "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60";

              return (
                <div
                  key={b.hisob_id}
                  className={`p-2 rounded-xl border ${borderTheme} flex flex-col justify-between transition-all hover:scale-[1.01]`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-snug" title={b.kassa_nomi}>
                      {b.kassa_nomi}
                    </span>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md ${badgeColor} flex-shrink-0 uppercase`}>
                      {b.kassa_turi}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums leading-none">
                      {isUSD ? "$" : ""}{pul(b.joriy_balans)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">
                      {b.valyuta}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 2-VARIANT: KENG (STANDART) KO'RINISH */
          <div className="grid grid-cols-2 gap-2">
            {balanslar.map((b) => {
              let Icon = Wallet;
              let bgColor = "bg-emerald-600";
              let textColor = "text-emerald-100";
              if (b.valyuta === "USD") { Icon = DollarSign; bgColor = "bg-amber-600"; textColor = "text-amber-100"; }
              if (b.kassa_turi === "plastik") { Icon = CreditCard; bgColor = "bg-blue-600"; textColor = "text-blue-100"; }
              if (b.kassa_turi === "bank") { Icon = Building2; bgColor = "bg-purple-700"; textColor = "text-purple-100"; }

              return (
                <div key={b.hisob_id} className={`${bgColor} text-white p-2.5 rounded-xl shadow-2xs space-y-0.5`}>
                  <div className="flex items-center gap-1.5 opacity-85">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{b.kassa_nomi}</span>
                  </div>
                  <p className="text-base font-black tabular-nums leading-tight">
                    {b.valyuta === "USD" ? "$" : ""}{pul(b.joriy_balans)}
                  </p>
                  <p className={`text-[10px] font-medium ${textColor}`}>{b.valyuta}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { haptic("light"); setShowTransfer(true); }}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs flex justify-center items-center gap-2 hover:bg-indigo-700 transition-all shadow-md active:scale-95"
        >
          <ArrowRightLeft className="w-4 h-4" /> Pul O'tkazish
        </button>
        {userRole === "admin" && (
          <button
            onClick={() => { haptic("light"); setShowHisoblar(true); }}
            className="flex-none px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs flex justify-center items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-md active:scale-95"
          >
            <Settings className="w-4 h-4" /> Hisoblar
          </button>
        )}
      </div>

      {/* Pul Harakati Oqimi (Journal / Audit Trail) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs space-y-3">
        {/* Title va Yangilash */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
              <History className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Pul Oqimi Jurnali
            </h3>
          </div>
          <button
            onClick={() => {
              yuklaKassa();
              haptic("light");
            }}
            disabled={yuklanmoqda}
            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 rounded-lg active:scale-95 transition-all flex-shrink-0"
          >
            {yuklanmoqda ? "..." : "Yangilash ⟳"}
          </button>
        </div>

        {/* FILTR TUGMALARI */}
        <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex gap-1 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { setAmalFilter("hammasi"); haptic("light"); }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${amalFilter === "hammasi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >Barchasi</button>
          <button
            onClick={() => { setAmalFilter("kirim"); haptic("light"); }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${amalFilter === "kirim" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700"}`}
          ><ArrowDownLeft className="w-3 h-3" /> Kirim</button>
          <button
            onClick={() => { setAmalFilter("chiqim"); haptic("light"); }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${amalFilter === "chiqim" ? "bg-rose-600 text-white shadow-sm" : "text-rose-700"}`}
          ><ArrowUpRight className="w-3 h-3" /> Chiqim</button>
        </div>

        {/* Harakatlar Ro'yxati */}
        <div className="space-y-1.5">
          {saralanganHarakatlar.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">Harakatlar topilmadi.</div>
          ) : (
            saralanganHarakatlar.map((h) => {
              const kirimmi = h.amal === "kirim";
              return (
                <div
                  key={h.id}
                  onClick={() => { setTanlanganHarakat(h); haptic("light"); }}
                  className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border hover:border-slate-300 cursor-pointer active:bg-slate-100 transition-all group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${kirimmi ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {kirimmi ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs group-hover:text-indigo-600 truncate">{getManbaYozuv(h.manba_turi)}</span>
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 truncate max-w-[130px]">{h.hisob?.nom || h.kassa_turi}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-[190px] mt-0.5">{h.izoh || (kirimmi ? "Tushum" : "Xarajat")}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2 flex-shrink-0">
                    <div>
                      <span className={`font-black text-xs tabular-nums block ${kirimmi ? "text-emerald-700" : "text-rose-700"}`}>
                        {kirimmi ? "+" : "−"}{pul(h.summa)} {h.valyuta}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {tanlanganHarakat && (
        <KassaDetailsModal
          harakat={tanlanganHarakat}
          onClose={() => setTanlanganHarakat(null)}
          onYangilandi={() => { yuklaKassa(); setTanlanganHarakat(null); }}
        />
      )}
      {showTransfer && (
        <TransferModal 
          hisoblar={hisoblar} 
          onClose={() => setShowTransfer(false)} 
          onSuccess={() => { setShowTransfer(false); yuklaKassa(); }} 
        />
      )}
      {showHisoblar && (
        <HisoblarModal
          hisoblar={hisoblar}
          onClose={() => setShowHisoblar(false)}
          onSuccess={() => { yuklaKassa(); }}
        />
      )}
    </div>
  );
}
