import React, { useState } from "react";
import { supabase, haptic } from "../lib/supabase";
import { X, Plus, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  hisoblar: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function HisoblarModal({ hisoblar, onClose, onSuccess }: Props) {
  const [tahrirId, setTahrirId] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [valyuta, setValyuta] = useState("UZS");
  const [turi, setTuri] = useState("naqd");
  const [loading, setLoading] = useState(false);

  function startEdit(h: any) {
    setTahrirId(h.id);
    setNom(h.nom);
    setValyuta(h.valyuta);
    setTuri(h.turi);
    haptic("light");
  }

  function bekorQilish() {
    setTahrirId(null);
    setNom("");
    setValyuta("UZS");
    setTuri("naqd");
  }

  async function saqlash(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return toast.error("Hisob nomini kiriting");
    setLoading(true);

    if (tahrirId) {
      const { error } = await supabase.from("hisoblar").update({ nom, valyuta, turi }).eq("id", tahrirId);
      if (error) toast.error("Xatolik: " + error.message);
      else { toast.success("Yangilandi"); onSuccess(); bekorQilish(); }
    } else {
      const { error } = await supabase.from("hisoblar").insert({ nom, valyuta, turi, faol: true });
      if (error) toast.error("Xatolik: " + error.message);
      else { toast.success("Qo'shildi"); onSuccess(); bekorQilish(); }
    }
    setLoading(false);
  }

  async function ochirish(id: string) {
    if (!window.confirm("Rostdan ham bu hisobni o'chirmoqchimisiz?")) return;
    setLoading(true);
    const { error } = await supabase.from("hisoblar").update({ faol: false }).eq("id", id);
    if (error) toast.error("Xatolik: " + error.message);
    else { toast.success("O'chirildi"); onSuccess(); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4 sm:p-0 pb-10">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-extrabold text-sm flex items-center gap-2">Hisoblar (Kassalar)</h3>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          <form onSubmit={saqlash} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Hisob nomi</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Masalan: Asosiy Kassa" className="w-full border p-2 rounded-lg text-sm dark:bg-slate-800" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Valyuta</label>
                <select value={valyuta} onChange={e => setValyuta(e.target.value)} className="w-full border p-2 rounded-lg text-sm dark:bg-slate-800">
                  <option value="UZS">UZS (So'm)</option>
                  <option value="USD">USD (Dollar)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Turi (To'lov)</label>
                <select value={turi} onChange={e => setTuri(e.target.value)} className="w-full border p-2 rounded-lg text-sm dark:bg-slate-800">
                  <option value="naqd">Naqd pul</option>
                  <option value="plastik">Plastik karta</option>
                  <option value="perechisleniya">Bank (Perechisleniya)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-indigo-700">
                {loading ? "..." : (tahrirId ? "Saqlash" : "Qo'shish")}
              </button>
              {tahrirId && (
                <button type="button" onClick={bekorQilish} className="bg-slate-200 text-slate-700 py-2 px-4 rounded-lg text-xs font-bold">
                  Bekor qilish
                </button>
              )}
            </div>
          </form>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Mavjud hisoblar</h4>
            {hisoblar.map(h => (
              <div key={h.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-sm">
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{h.nom}</p>
                  <p className="text-xs text-slate-500">{h.valyuta} • {h.turi}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(h)} className="p-1.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => ochirish(h.id)} className="p-1.5 text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
