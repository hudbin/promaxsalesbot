import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { 
  ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, 
  DollarSign, History, ChevronRight, Filter, Layers 
} from "lucide-react";
import { KassaDetailsModal } from "./KassaDetailsModal";

type AmalFilter = "hammasi" | "kirim" | "chiqim";

export function KassaTab() {
  const [balanslar, setBalanslar] = useState<Record<string, number>>({});
  const [harakatlar, setHarakatlar] = useState<any[]>([]);
  const [amalFilter, setAmalFilter] = useState<AmalFilter>("hammasi");
  const [tanlanganHarakat, setTanlanganHarakat] = useState<any>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    yuklaKassa();
  }, []);

  async function yuklaKassa() {
    setYuklanmoqda(true);
    // 1. Jonli balanslar
    const { data: b } = await supabase.from("view_kassa_balans").select("*");
    if (b) {
      const xarita: Record<string, number> = {};
      b.forEach((item: any) => {
        xarita[item.kassa_turi] = Number(item.joriy_balans || 0);
      });
      setBalanslar(xarita);
    }

    // 2. Oxirgi 50 ta kassa harakati
    const { data: h } = await supabase
      .from("kassa_harakatlari")
      .select("*")
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
      case "savdo":
        return "Savdo tushumi";
      case "rasxod":
        return "Xarajat (Rasxod)";
      case "qarz_tolov":
        return "Qarz to'lovi";
      case "kassalar_aro":
        return "Kassalar aro";
      case "boshlangich":
        return "Boshlang'ich";
      default:
        return manba || "Boshqa";
    }
  }

  function getKassaBadge(kassa: string) {
    switch (kassa) {
      case "naqd_uzs":
        return "Naqd UZS";
      case "naqd_usd":
        return "Naqd USD";
      case "plastik_uzs":
        return "Plastik";
      case "bank_uzs":
        return "Bank";
      default:
        return kassa;
    }
  }

  return (
    <div className="space-y-3 pb-8">
      {/* 4 Ta Kassa Balans Kartochkalari (Ixcham va chiroyli) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Naqd So'm */}
        <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-2xs space-y-0.5">
          <div className="flex items-center gap-1.5 opacity-85">
            <Wallet className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Naqd (So'm)</span>
          </div>
          <p className="text-base font-black tabular-nums leading-tight">{pul(balanslar["naqd_uzs"] || 0)}</p>
          <p className="text-[10px] font-medium text-emerald-100">so'm</p>
        </div>

        {/* Naqd Dollar */}
        <div className="bg-amber-600 text-white p-2.5 rounded-xl shadow-2xs space-y-0.5">
          <div className="flex items-center gap-1.5 opacity-85">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Naqd (Dollar)</span>
          </div>
          <p className="text-base font-black tabular-nums leading-tight">${pul(balanslar["naqd_usd"] || 0)}</p>
          <p className="text-[10px] font-medium text-amber-100">AQSH dollari</p>
        </div>

        {/* Plastik Karta */}
        <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-2xs space-y-0.5">
          <div className="flex items-center gap-1.5 opacity-85">
            <CreditCard className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Plastik karta</span>
          </div>
          <p className="text-base font-black tabular-nums leading-tight">{pul(balanslar["plastik_uzs"] || 0)}</p>
          <p className="text-[10px] font-medium text-blue-100">so'm</p>
        </div>

        {/* Bank Hisobi */}
        <div className="bg-purple-700 text-white p-2.5 rounded-xl shadow-2xs space-y-0.5">
          <div className="flex items-center gap-1.5 opacity-85">
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Bank hisobi</span>
          </div>
          <p className="text-base font-black tabular-nums leading-tight">{pul(balanslar["bank_uzs"] || 0)}</p>
          <p className="text-[10px] font-medium text-purple-100">so'm (bank)</p>
        </div>
      </div>

      {/* Pul Harakati Oqimi (Journal / Audit Trail) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-3">
        {/* Title va Yangilash */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
              <History className="w-4 h-4 text-slate-500" /> Pul Oqimi Jurnali
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              To'liq tafsilotlar (kim, nima, qanday to'lov) uchun qator ustiga bosing
            </p>
          </div>
          <button
            onClick={() => {
              yuklaKassa();
              haptic("light");
            }}
            disabled={yuklanmoqda}
            className="text-[11px] font-bold text-emerald-700 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 rounded-lg active:scale-95 transition-all flex-shrink-0"
          >
            {yuklanmoqda ? "..." : "Yangilash ⟳"}
          </button>
        </div>

        {/* FILTR TUGMALARI: BARCHASI | KIRIM | CHIQIM */}
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
          <button
            onClick={() => {
              setAmalFilter("hammasi");
              haptic("light");
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${
              amalFilter === "hammasi"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Barchasi</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
              amalFilter === "hammasi" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-500"
            }`}>
              {harakatlar.length}
            </span>
          </button>

          <button
            onClick={() => {
              setAmalFilter("kirim");
              haptic("light");
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${
              amalFilter === "kirim"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-700 hover:bg-emerald-50/50"
            }`}
          >
            <ArrowDownLeft className="w-3 h-3" />
            <span>Kirim</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
              amalFilter === "kirim" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
            }`}>
              {kirimlar.length}
            </span>
          </button>

          <button
            onClick={() => {
              setAmalFilter("chiqim");
              haptic("light");
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 ${
              amalFilter === "chiqim"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-rose-700 hover:bg-rose-50/50"
            }`}
          >
            <ArrowUpRight className="w-3 h-3" />
            <span>Chiqim</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
              amalFilter === "chiqim" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"
            }`}>
              {chiqimlar.length}
            </span>
          </button>
        </div>

        {/* Harakatlar Ro'yxati */}
        <div className="space-y-1.5">
          {saralanganHarakatlar.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">
              {amalFilter === "kirim" ? "Kirim harakatlari topilmadi." : 
               amalFilter === "chiqim" ? "Chiqim harakatlari topilmadi." : 
               "Kassa harakatlari mavjud emas."}
            </div>
          ) : (
            saralanganHarakatlar.map((h) => {
              const kirimmi = h.amal === "kirim";
              return (
                <div
                  key={h.id}
                  onClick={() => {
                    setTanlanganHarakat(h);
                    haptic("light");
                  }}
                  className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300 cursor-pointer active:bg-slate-100 transition-all group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        kirimmi ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {kirimmi ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 truncate leading-tight">
                          {getManbaYozuv(h.manba_turi)}
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 uppercase flex-shrink-0">
                          {getKassaBadge(h.kassa_turi)}
                        </span>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 truncate max-w-[190px] mt-0.5">
                        {h.izoh || (kirimmi ? "Savdo / To'lov tushumi" : "Xarajat")}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-2 flex-shrink-0">
                    <div>
                      <span
                        className={`font-black text-xs tabular-nums block ${
                          kirimmi ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {kirimmi ? "+" : "−"}
                        {pul(h.summa)} {h.valyuta}
                      </span>
                      <p className="text-[9px] font-medium text-slate-400 mt-0.5">
                        {new Date(h.sana_vaqt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{" "}
                        {new Date(h.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Kassa Harakati Tafsilotlari Modali (To'liq savdo/tovar/mijoz ma'lumotlari) */}
      {tanlanganHarakat && (
        <KassaDetailsModal
          harakat={tanlanganHarakat}
          onClose={() => setTanlanganHarakat(null)}
        />
      )}
    </div>
  );
}
