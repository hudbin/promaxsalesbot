import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, DollarSign, History, ChevronRight } from "lucide-react";
import { KassaDetailsModal } from "./KassaDetailsModal";

export function KassaTab() {
  const [balanslar, setBalanslar] = useState<Record<string, number>>({});
  const [harakatlar, setHarakatlar] = useState<any[]>([]);
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

    // 2. Oxirgi 30 ta kassa harakati
    const { data: h } = await supabase
      .from("kassa_harakatlari")
      .select("*")
      .order("sana_vaqt", { ascending: false })
      .limit(30);

    if (h) setHarakatlar(h);
    setYuklanmoqda(false);
  }

  return (
    <div className="space-y-3">
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
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2">
        <div className="flex justify-between items-center pb-1.5 border-b">
          <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
            <History className="w-4 h-4 text-slate-500" /> Pul Oqimi Jurnali
          </h3>
          <button
            onClick={yuklaKassa}
            disabled={yuklanmoqda}
            className="text-[11px] font-bold text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            Yangilash ⟳
          </button>
        </div>

        <div className="space-y-1.5">
          {harakatlar.length === 0 ? (
            <p className="text-center text-slate-400 py-4 text-xs">Kassa harakatlari mavjud emas.</p>
          ) : (
            harakatlar.map((h) => {
              const kirimmi = h.amal === "kirim";
              return (
                <div
                  key={h.id}
                  onClick={() => {
                    setTanlanganHarakat(h);
                    haptic("light");
                  }}
                  className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-300 cursor-pointer active:bg-slate-100 transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        kirimmi ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {kirimmi ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 truncate">
                          {kirimmi ? "Kirim" : "Chiqim"} ({h.manba_turi})
                        </span>
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-200 text-slate-600 uppercase flex-shrink-0">
                          {h.kassa_turi.replace("_uzs", "").replace("_usd", "")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-[150px]">{h.izoh || "Izohsiz"}</p>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-1.5 flex-shrink-0">
                    <div>
                      <span
                        className={`font-black text-xs tabular-nums block ${
                          kirimmi ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {kirimmi ? "+" : "−"}
                        {pul(h.summa)} {h.valyuta}
                      </span>
                      <p className="text-[9px] font-medium text-slate-400">
                        {new Date(h.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Kassa Harakati Tafsilotlari Modali */}
      {tanlanganHarakat && (
        <KassaDetailsModal
          harakat={tanlanganHarakat}
          onClose={() => setTanlanganHarakat(null)}
        />
      )}
    </div>
  );
}
