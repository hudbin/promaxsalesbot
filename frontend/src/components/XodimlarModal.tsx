import React, { useState, useEffect } from "react";
import { X, Users, UserPlus, Shield, ShieldCheck, Phone, CheckCircle, Ban, Trash2, Key, Loader2, RefreshCw } from "lucide-react";
import { supabase, haptic } from "../lib/supabase";
import { Combobox } from "./ui/Combobox";

interface XodimlarModalProps {
  onClose: () => void;
  currentUserTgId?: number | string | null;
}

export function XodimlarModal({ onClose, currentUserTgId }: XodimlarModalProps) {
  const [xodimlar, setXodimlar] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [qoshishOchiq, setQoshishOchiq] = useState(false);
  const [ism, setIsm] = useState("");
  const [telefon, setTelefon] = useState("");
  const [rol, setRol] = useState<"sotuvchi" | "admin">("sotuvchi");
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    yuklaXodimlar();
  }, []);

  async function yuklaXodimlar() {
    setYuklanmoqda(true);
    const { data } = await supabase
      .from("xodimlar")
      .select("*")
      .order("yaratilgan", { ascending: false });

    if (data) setXodimlar(data);
    setYuklanmoqda(false);
  }

  async function xodimQosh() {
    if (!ism.trim()) {
      alert("Iltimos, xodim ismini kiriting!");
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    let tozaTel = telefon.replace(/[^\d+]/g, "");
    if (tozaTel && !tozaTel.startsWith("+")) tozaTel = "+" + tozaTel;

    try {
      const { error } = await supabase.from("xodimlar").insert({
        ism: ism.trim(),
        telefon: tozaTel || null,
        rol: rol,
        faol: true,
      });

      if (error) throw error;

      haptic("success");
      setXabar(`${ism} xodimlar ro'yxatiga qo'shildi!`);
      setIsm("");
      setTelefon("");
      setRol("sotuvchi");
      setQoshishOchiq(false);
      await yuklaXodimlar();

      setTimeout(() => setXabar(null), 3500);
    } catch (e: any) {
      haptic("error");
      alert("Xatolik: " + e.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  async function holatOzgartir(id: string, joriyFaol: boolean) {
    haptic("medium");
    try {
      const { error } = await supabase
        .from("xodimlar")
        .update({ faol: !joriyFaol })
        .eq("id", id);

      if (error) throw error;

      await yuklaXodimlar();
      haptic("success");
    } catch (e: any) {
      alert("Xatolik: " + e.message);
    }
  }

  async function xodimOchir(id: string, xodimIsm: string) {
    if (!confirm(`${xodimIsm}ni ro'yxatdan butunlay o'chirmoqchimisiz?`)) return;

    haptic("heavy");
    try {
      const { error } = await supabase.from("xodimlar").delete().eq("id", id);
      if (error) throw error;

      await yuklaXodimlar();
      haptic("success");
    } catch (e: any) {
      alert("Xatolik: " + e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Xodimlar Boshqaruvi</h3>
              <p className="text-[10px] text-slate-400 font-medium">Foydalanuvchilar va ruxsatlar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Xabar */}
        {xabar && (
          <div className="p-2.5 bg-emerald-600 text-white rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <p>{xabar}</p>
          </div>
        )}

        {/* Info Banner */}
        <div className="p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-[11px] text-indigo-950 font-medium space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-indigo-900">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Xodimlarni ulash usuli:
          </p>
          <p className="text-[10px] text-indigo-800 leading-relaxed">
            Yangi xodimni telefon raqami bilan kiriting. Xodim botga kirib o'z raqamini ulashganda, tizim uni avtomatik taniydi va ruxsat ochiladi.
          </p>
        </div>

        {/* Boshqaruv tugmalari */}
        <div className="flex justify-between items-center gap-2">
          <button
            onClick={() => {
              setQoshishOchiq(!qoshishOchiq);
              haptic("light");
            }}
            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {qoshishOchiq ? "Bekor qilish" : "+ Yangi Xodim Qo'shish"}
          </button>
          <button
            onClick={yuklaXodimlar}
            disabled={yuklanmoqda}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${yuklanmoqda ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>

        {/* Yangi Xodim Qo'shish Formasi */}
        {qoshishOchiq && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 animate-fade-in">
            <h4 className="text-xs font-black text-slate-900">Yangi Xodim Ro'yxatdan O'tkazish</h4>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Ism sharifi *</label>
              <input
                type="text"
                placeholder="masalan: Jasurbek"
                value={ism}
                onChange={(e) => setIsm(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Telefon raqami (ixtiyoriy)</label>
              <input
                type="tel"
                placeholder="+998901234567"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Tizimdagi roli:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRol("sotuvchi")}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    rol === "sotuvchi"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  💼 Sotuvchi
                </button>
                <button
                  type="button"
                  onClick={() => setRol("admin")}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    rol === "admin"
                      ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  👑 Admin
                </button>
              </div>
            </div>
            <button
              onClick={xodimQosh}
              disabled={yuklanmoqda}
              className="w-full py-2 bg-indigo-600 text-white font-extrabold text-xs rounded-xl shadow active:scale-95 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ Xodimni Saqlash"}
            </button>
          </div>
        )}

        {/* Xodimlar Ro'yxati */}
        <div className="space-y-2 pt-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Mavjud Xodimlar ({xodimlar.length})
          </h4>
          {xodimlar.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-slate-700">Hozircha xodimlar kiritilmagan</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                "+ Yangi Xodim Qo'shish" orqali sotuvchilarni kiriting.
              </p>
            </div>
          ) : (
            xodimlar.map((x) => (
              <div
                key={x.id}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                  x.faol ? "bg-white border-slate-200 shadow-2xs" : "bg-slate-50 border-slate-200 opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h5 className="font-bold text-xs text-slate-900 truncate leading-snug">{x.ism}</h5>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase ${
                        x.rol === "admin"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {x.rol === "admin" ? "👑 Admin" : "💼 Sotuvchi"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 mt-0.5">
                    {x.telefon && (
                      <span className="flex items-center gap-0.5 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" /> {x.telefon}
                      </span>
                    )}
                    {x.telegram_id ? (
                      <span className="text-emerald-700 font-bold">
                        ✅ Telegram ID: {x.telegram_id}
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium">
                        ⏳ Telegram ulanmagan
                      </span>
                    )}
                  </div>
                </div>

                {/* Tugmalar */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => holatOzgartir(x.id, x.faol)}
                    title={x.faol ? "Ruxsatni to'xtatish" : "Ruxsatni faollashtirish"}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                      x.faol
                        ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    {x.faol ? "To'xtatish" : "Faollashtirish"}
                  </button>
                  <button
                    onClick={() => xodimOchir(x.id, x.ism)}
                    title="Butunlay o'chirish"
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
