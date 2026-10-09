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

  return (
    <div className="space-y-3 pb-8">
      {/* 4 Ta Kassa Balans Kartochkalari (Ixcham va chiroyli) - Faqat Admin uchun */}
      {userRole === "admin" && (
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
