import React, { useState } from "react";
import { supabase, haptic } from "../lib/supabase";
import { X, Plus, Edit2, Trash2, Layers, Wallet, CreditCard, DollarSign, Building2, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

interface Props {
  hisoblar: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function HisoblarModal({ hisoblar, onClose, onSuccess }: Props) {
  // Rejim: "paket" (avtomatik sub-hisoblar) yoki "yakka" (bitta hisob)
  const [rejim, setRejim] = useState<"paket" | "yakka">("paket");
  const [tahrirId, setTahrirId] = useState<string | null>(null);

  // Paket rejimi uchun
  const [asosiyNom, setAsosiyNom] = useState("");
  const [qoshimchaBank, setQoshimchaBank] = useState(false);

  // Yakka hisob yoki tahrirlash uchun
  const [nom, setNom] = useState("");
  const [guruhi, setGuruhi] = useState("");
  const [valyuta, setValyuta] = useState("UZS");
  const [turi, setTuri] = useState("naqd");
  const [loading, setLoading] = useState(false);

  function startEdit(h: any) {
    setTahrirId(h.id);
    setRejim("yakka");
    setNom(h.nom);
    setGuruhi(h.guruhi || extractGuruh(h.nom));
    setValyuta(h.valyuta);
    setTuri(h.turi);
    haptic("light");
  }

  function bekorQilish() {
    setTahrirId(null);
    setNom("");
    setGuruhi("");
    setAsosiyNom("");
    setValyuta("UZS");
    setTuri("naqd");
  }

  // Nomdan guruh nomini ajratib olish (agar bazada guruhi bo'sh bo'lsa)
  function extractGuruh(hNom: string, hGuruhi?: string): string {
    if (hGuruhi && hGuruhi.trim()) {
      const g = hGuruhi.trim();
      if (/^asosiy\s+(do['’`]?kon|kassa)/i.test(g)) return "Asosiy Do'kon";
      return g;
    }
    if (!hNom) return "Asosiy Do'kon";
    const toza = hNom
      .replace(/\s*\((Naqd|Plastik|Bank|UZS|USD)[^\)]*\)/gi, "")
      .replace(/\s*-\s*(Naqd|Plastik|Bank|UZS|USD)[^\-]*/gi, "")
      .trim();
    if (/^asosiy\s+(do['’`]?kon|kassa)/i.test(toza)) return "Asosiy Do'kon";
    return toza || hNom;
  }

  // 1. Paket rejimida 3 ta (yoki 4 ta) sub-hisobni avtomatik yaratish
  async function saqlashPaket(e: React.FormEvent) {
    e.preventDefault();
    const guruhNomi = asosiyNom.trim();
    if (!guruhNomi) return toast.error("Kassa yoki shaxs nomini kiriting");

    setLoading(true);
    haptic("medium");

    const yangiHisoblar = [
      {
        nom: `${guruhNomi} (UZS Naqd)`,
        guruhi: guruhNomi,
        valyuta: "UZS",
        turi: "naqd",
        faol: true,
      },
      {
        nom: `${guruhNomi} (UZS Plastik)`,
        guruhi: guruhNomi,
        valyuta: "UZS",
        turi: "plastik",
        faol: true,
      },
      {
        nom: `${guruhNomi} (USD Naqd)`,
        guruhi: guruhNomi,
        valyuta: "USD",
        turi: "naqd",
        faol: true,
      },
    ];

    if (qoshimchaBank) {
      yangiHisoblar.push({
        nom: `${guruhNomi} (Bank UZS)`,
        guruhi: guruhNomi,
        valyuta: "UZS",
        turi: "bank",
        faol: true,
      });
    }

    try {
      const { error } = await supabase.from("hisoblar").insert(yangiHisoblar);
      if (error) {
        // Agar guruhi ustuni bazada hali bo'lmasa, guruhisiz qayta urinamiz
        const errorMsg = error.message || "";
        if (errorMsg.includes("guruhi") || errorMsg.includes("column")) {
          const fallback = yangiHisoblar.map(({ guruhi, ...rest }) => rest);
          const { error: fallbackErr } = await supabase.from("hisoblar").insert(fallback);
          if (fallbackErr) throw fallbackErr;
        } else {
          throw error;
        }
      }

      haptic("success");
      toast.success(`${guruhNomi} uchun ${yangiHisoblar.length} ta sub-hisob yaratildi!`, {
        description: "UZS Naqd, UZS Plastik va USD Naqd sub-hisoblari tayyor.",
      });
      bekorQilish();
      onSuccess();
    } catch (err: any) {
      haptic("error");
      toast.error("Xatolik", { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  // 2. Yakka hisobni saqlash yoki tahrirlash
  async function saqlashYakka(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return toast.error("Hisob nomini kiriting");
    setLoading(true);
    haptic("light");

    try {
      if (tahrirId) {
        const payload: any = { nom, valyuta, turi };
        if (guruhi.trim()) payload.guruhi = guruhi.trim();

        const { error } = await supabase.from("hisoblar").update(payload).eq("id", tahrirId);
        if (error && error.message.includes("guruhi")) {
          delete payload.guruhi;
          const { error: fErr } = await supabase.from("hisoblar").update(payload).eq("id", tahrirId);
          if (fErr) throw fErr;
        } else if (error) {
          throw error;
        }

        toast.success("Hisob yangilandi!");
        onSuccess();
        bekorQilish();
      } else {
        const payload: any = { nom, valyuta, turi, faol: true };
        if (guruhi.trim()) payload.guruhi = guruhi.trim();

        const { error } = await supabase.from("hisoblar").insert(payload);
        if (error && error.message.includes("guruhi")) {
          delete payload.guruhi;
          const { error: fErr } = await supabase.from("hisoblar").insert(payload);
          if (fErr) throw fErr;
        } else if (error) {
          throw error;
        }

        toast.success("Yangi hisob qo'shildi!");
        onSuccess();
        bekorQilish();
      }
    } catch (err: any) {
      toast.error("Xatolik", { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function ochirish(id: string) {
    if (!window.confirm("Rostdan ham bu hisobni o'chirmoqchimisiz?")) return;
    setLoading(true);
    const { error } = await supabase.from("hisoblar").update({ faol: false }).eq("id", id);
    if (error) toast.error("Xatolik: " + error.message);
    else {
      toast.success("Hisob o'chirildi!");
      onSuccess();
    }
    setLoading(false);
  }

  // Hisoblarni guruhlar bo'yicha ajratish
  const guruhlanganMap: Record<string, any[]> = {};
  hisoblar.forEach((h) => {
    const gNom = extractGuruh(h.nom, h.guruhi);
    if (!guruhlanganMap[gNom]) guruhlanganMap[gNom] = [];
    guruhlanganMap[gNom].push(h);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-3 sm:p-0 pb-8">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
        {/* Sarlavha */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                Hisoblar va Kassalar
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Sub-hisoblarni avtomatik yaratish va boshqarish
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Rejimni almashtirish (Paket vs Yakka) */}
          {!tahrirId && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setRejim("paket"); haptic("light"); }}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  rejim === "paket"
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>⚡ Avto Sub-Hisoblar (Tavsiya)</span>
              </button>
              <button
                type="button"
                onClick={() => { setRejim("yakka"); haptic("light"); }}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  rejim === "yakka"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>➕ Yakka Hisob</span>
              </button>
            </div>
          )}

          {/* 1-REJIM: PAKET (AVTOMATIK 3 TA SUB-HISOB YARATISH) */}
          {rejim === "paket" && !tahrirId && (
            <form onSubmit={saqlashPaket} className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-3">
              <div>
                <label className="text-xs font-black text-indigo-950 dark:text-indigo-200 block mb-1">
                  Yangi Kassa / Shaxs nomi:
                </label>
                <input
                  type="text"
                  value={asosiyNom}
                  onChange={(e) => setAsosiyNom(e.target.value)}
                  placeholder="Masalan: Qahramon, Asosiy Kassa, Filial 2"
                  className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Sub-hisoblar paketi ma'lumoti */}
              <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-1.5">
                <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider block">
                  Avtomatik yaratiladigan sub-hisoblar:
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-lg border border-emerald-100 dark:border-emerald-900">
                    <Wallet className="w-3.5 h-3.5" /> UZS Naqd
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-900">
                    <CreditCard className="w-3.5 h-3.5" /> UZS Plastik
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-lg border border-amber-100 dark:border-amber-900">
                    <DollarSign className="w-3.5 h-3.5" /> USD Naqd
                  </div>
                </div>

                {/* Qo'shimcha Bank opsiyasi */}
                <button
                  type="button"
                  onClick={() => { setQoshimchaBank(!qoshimchaBank); haptic("light"); }}
                  className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 pt-1"
                >
                  {qoshimchaBank ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Bank (Perechisleniya) sub-hisobini ham ochish</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {loading ? "Yaratilmoqda..." : `Sub-hisoblar bilan yaratish (${qoshimchaBank ? 4 : 3} ta)`}
              </button>
            </form>
          )}

          {/* 2-REJIM: YAKKA HISOB QO'SHISH YOKI TAHRIRLASH */}
          {(rejim === "yakka" || tahrirId) && (
            <form onSubmit={saqlashYakka} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  {tahrirId ? "Hisobni tahrirlash" : "Yakka hisob ochish"}
                </span>
                {tahrirId && (
                  <button type="button" onClick={bekorQilish} className="text-[11px] text-rose-500 font-bold hover:underline">
                    Bekor qilish
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Hisob to'liq nomi</label>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Masalan: Asosiy Do'kon (Naqd UZS)"
                  className="w-full border dark:border-slate-700 p-2 rounded-xl text-xs font-bold dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Guruhi (Tegishli kassa)</label>
                  <input
                    type="text"
                    value={guruhi}
                    onChange={(e) => setGuruhi(e.target.value)}
                    placeholder="Masalan: Asosiy Do'kon"
                    className="w-full border dark:border-slate-700 p-2 rounded-xl text-xs font-bold dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Valyuta</label>
                  <select
                    value={valyuta}
                    onChange={(e) => setValyuta(e.target.value)}
                    className="w-full border dark:border-slate-700 p-2 rounded-xl text-xs font-bold dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="UZS">UZS (So'm)</option>
                    <option value="USD">USD (Dollar)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">To'lov turi</label>
                <select
                  value={turi}
                  onChange={(e) => setTuri(e.target.value)}
                  className="w-full border dark:border-slate-700 p-2 rounded-xl text-xs font-bold dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="naqd">💵 Naqd pul</option>
                  <option value="plastik">💳 Plastik karta</option>
                  <option value="bank">🏦 Bank (Perechisleniya)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white py-2 rounded-xl text-xs font-black"
              >
                {loading ? "..." : tahrirId ? "Saqlash" : "Qo'shish"}
              </button>
            </form>
          )}

          {/* MAVJUD HISOBLAR GURUHLAR BO'YICHA RO'YXATI */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Mavjud hisoblar ({Object.keys(guruhlanganMap).length} ta kassa)
              </h4>
              <span className="text-[10px] text-slate-400 font-bold">
                Jami: {hisoblar.length} ta hisob
              </span>
            </div>

            {Object.entries(guruhlanganMap).map(([guruhNomi, subList]) => (
              <div
                key={guruhNomi}
                className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 space-y-2 shadow-2xs"
              >
                {/* Guruh sarlavhasi */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🏪</span>
                    <span className="font-black text-xs text-slate-900 dark:text-white">
                      {guruhNomi}
                    </span>
                  </div>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {subList.length} ta sub-hisob
                  </span>
                </div>

                {/* Sub-hisoblar ro'yxati */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {subList.map((h) => {
                    let Icon = Wallet;
                    let iconColor = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50";
                    if (h.valyuta === "USD") {
                      Icon = DollarSign;
                      iconColor = "text-amber-600 bg-amber-50 dark:bg-amber-950/50";
                    } else if (h.turi === "plastik") {
                      Icon = CreditCard;
                      iconColor = "text-blue-600 bg-blue-50 dark:bg-blue-950/50";
                    } else if (h.turi === "bank") {
                      Icon = Building2;
                      iconColor = "text-purple-600 bg-purple-50 dark:bg-purple-950/50";
                    }

                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[11px] text-slate-800 dark:text-slate-200 truncate" title={h.nom}>
                              {h.nom}
                            </p>
                            <p className="text-[9px] text-slate-400 font-semibold uppercase">
                              {h.valyuta} • {h.turi}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEdit(h)}
                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors"
                            title="Tahrirlash"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => ochirish(h.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
