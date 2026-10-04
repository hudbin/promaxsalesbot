import React from "react";
import { X, ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, Calendar, FileText, Layers } from "lucide-react";
import { pul } from "../lib/supabase";

interface KassaDetailsModalProps {
  harakat: any;
  onClose: () => void;
}

export function KassaDetailsModal({ harakat, onClose }: KassaDetailsModalProps) {
  if (!harakat) return null;

  const isKirim = harakat.amal === "kirim";

  function getManbaNom(manba: string) {
    switch (manba) {
      case "savdo":
        return "🛒 Savdo tushumi";
      case "rasxod":
        return "💸 Xarajat (Rasxod)";
      case "qarz_tolov":
        return "💳 Qarz to'lovi";
      case "kassalar_aro":
        return "🔄 Kassalar aro o'tkazma";
      case "boshlangich":
        return "🏁 Boshlang'ich qoldiq";
      default:
        return manba || "Boshqa";
    }
  }

  function getKassaNom(kassa: string) {
    switch (kassa) {
      case "naqd_uzs":
        return "💵 Naqd (So'm)";
      case "naqd_usd":
        return "💲 Naqd (Dollar)";
      case "plastik_uzs":
        return "💳 Plastik karta";
      case "bank_uzs":
        return "🏦 Bank hisobi";
      default:
        return kassa;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isKirim ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {isKirim ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Kassa Harakati Tafsiloti</h3>
              <p className="text-[10px] text-slate-400 font-medium">Pul oqimi ledgeri</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Katta Summa Bloki */}
        <div
          className={`p-3.5 rounded-2xl text-center space-y-1 border ${
            isKirim ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/60 border-rose-200"
          }`}
        >
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-block ${
              isKirim ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}
          >
            {isKirim ? "📥 Pul Kirimi" : "📤 Pul Chiqimi"}
          </span>
          <p
            className={`text-2xl font-black tabular-nums ${
              isKirim ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {isKirim ? "+" : "−"}
            {pul(harakat.summa)} {harakat.valyuta}
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {new Date(harakat.sana_vaqt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            ·{" "}
            {new Date(harakat.sana_vaqt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>

        {/* Tafsilotlar */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Manba:
            </span>
            <span className="font-bold text-slate-900">{getManbaNom(harakat.manba_turi)}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" /> Kassa:
            </span>
            <span className="font-bold text-slate-900">{getKassaNom(harakat.kassa_turi)}</span>
          </div>

          {harakat.izoh && (
            <div className="pt-1">
              <span className="text-slate-500 font-medium flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Izoh:
              </span>
              <p className="bg-white p-2 rounded-xl border border-slate-200 text-slate-800 font-medium italic">
                "{harakat.izoh}"
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors"
        >
          Yopish
        </button>
      </div>
    </div>
  );
}
