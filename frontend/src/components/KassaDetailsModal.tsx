import React, { useState, useEffect } from "react";
import { 
  X, ArrowDownLeft, ArrowUpRight, Wallet, CreditCard, Building2, 
  Calendar, FileText, Layers, User, Phone, MapPin, ShoppingBag, 
  Receipt, UserCheck, AlertCircle, Loader2 
} from "lucide-react";
import { pul, supabase } from "../lib/supabase";

interface KassaDetailsModalProps {
  harakat: any;
  onClose: () => void;
}

export function KassaDetailsModal({ harakat, onClose }: KassaDetailsModalProps) {
  if (!harakat) return null;

  const [tafsilot, setTafsilot] = useState<any>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  const isKirim = harakat.amal === "kirim";

  useEffect(() => {
    if (harakat.manba_id && harakat.manba_turi) {
      yuklaTafsilotlar();
    }
  }, [harakat]);

  async function yuklaTafsilotlar() {
    setYuklanmoqda(true);
    try {
      if (harakat.manba_turi === "savdo") {
        // Savdo tafsiloti (Mijoz + tovarlar ro'yxati)
        const { data: savdo } = await supabase
          .from("savdolar")
          .select("*, mijoz:mijozlar(nom, telefon, manzil), qatorlar:savdo_qatorlari(*)")
          .eq("id", harakat.manba_id)
          .maybeSingle();

        if (savdo) {
          setTafsilot({ tur: "savdo", ...savdo });
        }
      } else if (harakat.manba_turi === "qarz_tolov") {
        // Qarz to'lovi tafsiloti
        const { data: qarz } = await supabase
          .from("qarz_tolovlari")
          .select("*, mijoz:mijozlar(nom, telefon, manzil)")
          .eq("id", harakat.manba_id)
          .maybeSingle();

        if (qarz) {
          setTafsilot({ tur: "qarz_tolov", ...qarz });
        }
      } else if (harakat.manba_turi === "rasxod") {
        // Rasxod tafsiloti
        const { data: rasxod } = await supabase
          .from("rasxodlar")
          .select("*")
          .eq("id", harakat.manba_id)
          .maybeSingle();

        if (rasxod) {
          setTafsilot({ tur: "rasxod", ...rasxod });
        }
      }
    } catch (err) {
      console.error("Kassa harakati tafsilotlarini yuklashda xatolik:", err);
    } finally {
      setYuklanmoqda(false);
    }
  }

  function getManbaNom(manba: string) {
    switch (manba) {
      case "savdo":
        return "🛒 Savdo tushumi";
      case "rasxod":
        return "💸 Xarajat (Rasxod)";
      case "qarz_tolov":
        return "💳 Qarz to'lovi qabuli";
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

  function getTolovTuriNom(turi: string) {
    switch (turi) {
      case "naqd":
        return "💵 Naqd";
      case "plastik":
        return "💳 Plastik karta";
      case "perechisleniya":
        return "🏦 Bank o'tkazmasi";
      case "aralash":
        return "🔀 Aralash to'lov";
      case "qarz":
        return "⏳ Qarzga (Nasiya)";
      default:
        return turi || "Naqd";
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isKirim ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {isKirim ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                {isKirim ? "Kirim Tafsiloti" : "Chiqim Tafsiloti"}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {getManbaNom(harakat.manba_turi)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Katta Summa Bloki */}
        <div
          className={`p-3 rounded-2xl text-center space-y-1 border ${
            isKirim ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/60 border-rose-200"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-block ${
                isKirim ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}
            >
              {isKirim ? "📥 Kassa Tushumi" : "📤 Kassadan Chiqim"}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
              {getKassaNom(harakat.kassa_turi)}
            </span>
          </div>

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
            })}
          </p>
        </div>

        {/* YUKLANMOQDA */}
        {yuklanmoqda && (
          <div className="py-4 text-center text-slate-400 flex items-center justify-center gap-2 text-xs font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>To'liq ma'lumotlar yuklanmoqda...</span>
          </div>
        )}

        {/* 1. AGAR SAVDO BO'LSA - TO'LIQ DETALLAR */}
        {tafsilot?.tur === "savdo" && (
          <div className="space-y-2.5 animate-fade-in">
            {/* Kim sotib oldi (Mijoz) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" /> Xaridor (Mijoz)
              </span>
              <div className="flex justify-between items-center">
                <h4 className="font-extrabold text-sm text-slate-900">
                  {tafsilot.mijoz?.nom || "Chakana xaridor"}
                </h4>
                {tafsilot.raqam && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    Chek #{tafsilot.raqam}
                  </span>
                )}
              </div>
              {tafsilot.mijoz?.telefon && (
                <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" /> {tafsilot.mijoz.telefon}
                </p>
              )}
              {tafsilot.mijoz?.manzil && (
                <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" /> {tafsilot.mijoz.manzil}
                </p>
              )}
            </div>

            {/* To'lov tafsilotlari (Naqd, plastik, qarz) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Receipt className="w-3 h-3 text-slate-500" /> To'lov Taqsimoti
              </span>

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-medium">Jami hisob</span>
                  <span className="font-black text-slate-900 text-xs tabular-nums">
                    {pul(tafsilot.jami_summa)} {tafsilot.valyuta}
                  </span>
                </div>
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block font-bold">To'landi</span>
                  <span className="font-black text-emerald-900 text-xs tabular-nums">
                    {pul(tafsilot.tolangan_summa)} {tafsilot.valyuta}
                  </span>
                </div>
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                  <span className="text-[10px] text-amber-700 block font-bold">Qarzga</span>
                  <span className="font-black text-amber-900 text-xs tabular-nums">
                    {pul(tafsilot.qarz_summa)} {tafsilot.valyuta}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 text-[11px] border-t border-slate-200">
                <span className="text-slate-500 font-medium">To'lov usuli:</span>
                <span className="font-bold text-slate-800">
                  {getTolovTuriNom(tafsilot.tolov_turi)} ({getKassaNom(tafsilot.kassa_turi)})
                </span>
              </div>

              {tafsilot.xodim && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 font-medium">Sotuvchi:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-indigo-600" /> {tafsilot.xodim}
                  </span>
                </div>
              )}
            </div>

            {/* Nima sotib oldi (Tovar qatorlari) */}
            {tafsilot.qatorlar && tafsilot.qatorlar.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-slate-500" /> Xarid Qilingan Tovarlar
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                    {tafsilot.qatorlar.length} xil
                  </span>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {tafsilot.qatorlar.map((q: any, idx: number) => (
                    <div
                      key={q.id || idx}
                      className="flex justify-between items-center p-2 rounded-lg bg-white border border-slate-100 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-slate-900 truncate leading-tight">
                          {q.tovar_nomi}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {q.soni} dona × {pul(q.narx)} {tafsilot.valyuta}
                        </p>
                      </div>
                      <span className="font-extrabold text-slate-900 tabular-nums flex-shrink-0">
                        {pul(q.summa)} {tafsilot.valyuta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. AGAR QARZ TO'LOVI BO'LSA */}
        {tafsilot?.tur === "qarz_tolov" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs animate-fade-in">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <User className="w-3 h-3 text-slate-500" /> Qarzini To'lagan Mijoz
            </span>
            <div className="flex justify-between items-center">
              <h4 className="font-extrabold text-sm text-slate-900">{tafsilot.mijoz?.nom || "Mijoz"}</h4>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Qarz to'lovi
              </span>
            </div>
            {tafsilot.mijoz?.telefon && (
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" /> {tafsilot.mijoz.telefon}
              </p>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-[11px]">
              <span className="text-slate-500">To'lov shakli:</span>
              <span className="font-bold text-slate-800">{getTolovTuriNom(tafsilot.tolov_turi)}</span>
            </div>
            {tafsilot.xodim && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Qabul qiluvchi:</span>
                <span className="font-bold text-slate-800">{tafsilot.xodim}</span>
              </div>
            )}
          </div>
        )}

        {/* 3. AGAR RASXOD (CHIQIM) BO'LSA */}
        {tafsilot?.tur === "rasxod" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs animate-fade-in">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-500" /> Xarajat Tafsiloti
            </span>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Kategoriya:</span>
              <span className="font-extrabold text-sm text-slate-900 bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">
                {tafsilot.kategoriya || "Boshqa"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">To'lov usuli:</span>
              <span className="font-bold text-slate-800">{getTolovTuriNom(tafsilot.tolov_turi)}</span>
            </div>
            {tafsilot.xodim && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Xarajat qiluvchi:</span>
                <span className="font-bold text-slate-800">{tafsilot.xodim}</span>
              </div>
            )}
          </div>
        )}

        {/* Izoh (agar bo'lsa) */}
        {harakat.izoh && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs">
            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Izoh / Eslatma:</span>
            <p className="text-slate-800 font-medium italic">"{harakat.izoh}"</p>
          </div>
        )}

        {/* Yopish tugmasi */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-colors active:scale-98"
        >
          Yopish
        </button>
      </div>
    </div>
  );
}
