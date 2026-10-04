import React from "react";
import { X, TrendingDown, Calendar, Wallet, CreditCard, User, FileText, CheckCircle } from "lucide-react";
import { pul } from "../lib/supabase";

interface ChiqimDetailsModalProps {
  rasxod: any;
  onClose: () => void;
}

export function ChiqimDetailsModal({ rasxod, onClose }: ChiqimDetailsModalProps) {
  if (!rasxod) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Chiqim Tafsiloti</h3>
              <p className="text-[10px] text-slate-400 font-medium">Xarajat kvitansiyasi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summa va Kategoriya Katta Bloki */}
        <div className="bg-rose-50/60 border border-rose-200/80 p-3.5 rounded-2xl text-center space-y-1">
          <span className="text-xs font-bold text-rose-800 bg-rose-100/70 px-2.5 py-0.5 rounded-full inline-block">
            📂 {rasxod.kategoriya || "Chiqim"}
          </span>
          <p className="text-2xl font-black text-rose-700 tabular-nums">
            −{pul(rasxod.summa)} {rasxod.valyuta}
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {new Date(rasxod.sana_vaqt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            ·{" "}
            {new Date(rasxod.sana_vaqt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>

        {/* Tafsilotlar jadvali */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" /> To'lov turi:
            </span>
            <span className="font-bold text-slate-900 capitalize">
              {rasxod.tolov_turi === "naqd"
                ? "💵 Naqd pul"
                : rasxod.tolov_turi === "plastik"
                ? "💳 Plastik karta"
                : "🏦 Perechisleniya"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Kassa turi:
            </span>
            <span className="font-bold text-slate-900">
              {rasxod.kassa_turi === "naqd_uzs"
                ? "Naqd (So'm)"
                : rasxod.kassa_turi === "naqd_usd"
                ? "Naqd (Dollar)"
                : rasxod.kassa_turi === "plastik_uzs"
                ? "Plastik karta"
                : "Bank hisobi"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> Kiritgan xodim:
            </span>
            <span className="font-bold text-slate-900">{rasxod.xodim || "Admin"}</span>
          </div>

          {rasxod.izoh && (
            <div className="pt-1">
              <span className="text-slate-500 font-medium flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Izoh:
              </span>
              <p className="bg-white p-2 rounded-xl border border-slate-200 text-slate-800 font-medium italic">
                "{rasxod.izoh}"
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
