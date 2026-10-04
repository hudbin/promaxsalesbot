import React, { useState } from "react";
import { X, TrendingDown, Calendar, Wallet, CreditCard, User, FileText, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { pul, supabase, haptic } from "../lib/supabase";

interface ChiqimDetailsModalProps {
  rasxod: any;
  onClose: () => void;
  onOchirildi?: () => void;
}

export function ChiqimDetailsModal({ rasxod, onClose, onOchirildi }: ChiqimDetailsModalProps) {
  if (!rasxod) return null;

  const [ochirilmoqda, setOchirilmoqda] = useState(false);
  const [tasdiqlashOchiq, setTasdiqlashOchiq] = useState(false);

  async function rasxodniOchirish() {
    setOchirilmoqda(true);
    haptic("medium");

    try {
      // 1. Kassa harakatlaridan ushbu rasxodni o'chirish (pul avtomatik kassa balansiga qaytadi)
      const { error: kassaErr } = await supabase
        .from("kassa_harakatlari")
        .delete()
        .eq("manba_turi", "rasxod")
        .eq("manba_id", rasxod.id);

      if (kassaErr) {
        console.warn("Kassa harakatini o'chirishda ogohlantirish:", kassaErr);
      }

      // 2. Rasxodlar jadvalidan o'chirish
      const { error: rasxodErr } = await supabase
        .from("rasxodlar")
        .delete()
        .eq("id", rasxod.id);

      if (rasxodErr) throw rasxodErr;

      haptic("success");
      if (onOchirildi) {
        onOchirildi();
      } else {
        onClose();
      }
    } catch (err: any) {
      haptic("error");
      alert("Xatolik: " + err.message);
      setOchirilmoqda(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl border border-transparent dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">Chiqim Tafsiloti</h3>
              <p className="text-[10px] text-slate-400 font-medium">Xarajat kvitansiyasi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summa va Kategoriya Katta Bloki */}
        <div className="bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 p-3.5 rounded-2xl text-center space-y-1">
          <span className="text-xs font-bold text-rose-800 dark:text-rose-300 bg-rose-100/70 dark:bg-rose-900/60 px-2.5 py-0.5 rounded-full inline-block">
            📂 {rasxod.kategoriya || "Chiqim"}
          </span>
          <p className="text-2xl font-black text-rose-700 dark:text-rose-400 tabular-nums">
            −{pul(rasxod.summa)} {rasxod.valyuta}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
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
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-slate-400" /> To'lov turi:
            </span>
            <span className="font-bold text-slate-900 dark:text-white capitalize">
              {rasxod.tolov_turi === "naqd"
                ? "💵 Naqd pul"
                : rasxod.tolov_turi === "plastik"
                ? "💳 Plastik karta"
                : "🏦 Perechisleniya"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Kassa turi:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {rasxod.kassa_turi === "naqd_uzs"
                ? "Naqd (So'm)"
                : rasxod.kassa_turi === "naqd_usd"
                ? "Naqd (Dollar)"
                : rasxod.kassa_turi === "plastik_uzs"
                ? "Plastik karta"
                : "Bank hisobi"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> Kiritgan xodim:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">{rasxod.xodim || "Admin"}</span>
          </div>

          {rasxod.izoh && (
            <div className="pt-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Izoh:
              </span>
              <p className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium italic">
                "{rasxod.izoh}"
              </p>
            </div>
          )}
        </div>

        {/* O'CHIRISHNI TASDIQLASH BLOKI */}
        {tasdiqlashOchiq ? (
          <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 p-3 rounded-2xl space-y-2 text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Chiqimni bekor qilib o'chirasizmi?</span>
            </div>
            <p className="text-[11px] text-rose-700 dark:text-rose-400 leading-tight">
              Ushbu <b>{pul(rasxod.summa)} {rasxod.valyuta}</b> avtomatik tarzda kassa balansiga qaytariladi.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setTasdiqlashOchiq(false)}
                disabled={ochirilmoqda}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
              >
                Yo'q, bekor
              </button>
              <button
                onClick={rasxodniOchirish}
                disabled={ochirilmoqda}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {ochirilmoqda ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{ochirilmoqda ? "O'chirilmoqda..." : "Ha, o'chirilsin"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTasdiqlashOchiq(true);
                haptic("light");
              }}
              className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-200 dark:border-rose-900/60"
            >
              <Trash2 className="w-4 h-4" />
              <span>O'chirish</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-colors"
            >
              Yopish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
