import React, { useState, useEffect } from "react";
import { supabase, pul } from "../lib/supabase";
import { ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, DollarSign, History } from "lucide-react";

export function KassaTab() {
  const [balanslar, setBalanslar] = useState<Record<string, number>>({});
  const [harakatlar, setHarakatlar] = useState<any[]>([]);
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
    <div className="space-y-4">
      {/* 4 Ta Yirik Kassa Balans Kartochkalari */}
      <div className="grid grid-cols-2 gap-3">
        {/* Naqd So'm */}
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-md space-y-1">
          <div className="flex items-center gap-2 opacity-80">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Naqd (So'm)</span>
          </div>
          <p className="text-2xl font-black tabular-nums">{pul(balanslar["naqd_uzs"] || 0)}</p>
          <p className="text-xs font-medium text-emerald-100">so'm</p>
        </div>

        {/* Naqd Dollar */}
        <div className="bg-amber-600 text-white p-4 rounded-2xl shadow-md space-y-1">
          <div className="flex items-center gap-2 opacity-80">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Naqd (Dollar)</span>
          </div>
          <p className="text-2xl font-black tabular-nums">${pul(balanslar["naqd_usd"] || 0)}</p>
          <p className="text-xs font-medium text-amber-100">AQSH dollari</p>
        </div>

        {/* Plastik Karta */}
        <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-md space-y-1">
          <div className="flex items-center gap-2 opacity-80">
            <CreditCard className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Plastik karta</span>
          </div>
          <p className="text-2xl font-black tabular-nums">{pul(balanslar["plastik_uzs"] || 0)}</p>
          <p className="text-xs font-medium text-blue-100">so'm</p>
        </div>

        {/* Bank Hisobi */}
        <div className="bg-purple-700 text-white p-4 rounded-2xl shadow-md space-y-1">
          <div className="flex items-center gap-2 opacity-80">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Bank hisobi</span>
          </div>
          <p className="text-2xl font-black tabular-nums">{pul(balanslar["bank_uzs"] || 0)}</p>
          <p className="text-xs font-medium text-purple-100">so'm (perechisleniya)</p>
        </div>
      </div>

      {/* Pul Harakati Oqimi (Journal / Audit Trail) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" /> Pul Oqimi Jurnali (Kirim / Chiqim)
          </h3>
          <button
            onClick={yuklaKassa}
            disabled={yuklanmoqda}
            className="text-xs font-bold text-emerald-700 px-2 py-1 bg-emerald-50 rounded-lg hover:bg-emerald-100"
          >
            Yangilash ⟳
          </button>
        </div>

        <div className="space-y-2.5">
          {harakatlar.length === 0 ? (
            <p className="text-center text-slate-400 py-6 text-sm">Kassa harakatlari mavjud emas.</p>
          ) : (
            harakatlar.map((h) => {
              const kirimmi = h.amal === "kirim";
              return (
                <div key={h.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        kirimmi ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {kirimmi ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {kirimmi ? "Kirim" : "Chiqim"} ({h.manba_turi})
                        </span>
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase">
                          {h.kassa_turi.replace("_uzs", "").replace("_usd", "")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate max-w-[180px]">{h.izoh || "Izohsiz"}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-black text-base tabular-nums ${
                        kirimmi ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {kirimmi ? "+" : "−"}
                      {pul(h.summa)} {h.valyuta}
                    </span>
                    <p className="text-[10px] font-medium text-slate-400">
                      {new Date(h.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
