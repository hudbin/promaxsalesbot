import React, { useState } from "react";
import { supabase, haptic } from "../lib/supabase";
import { X, ArrowRightLeft } from "lucide-react";

interface Props {
  hisoblar: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function TransferModal({ hisoblar, onClose, onSuccess }: Props) {
  const [chiqimId, setChiqimId] = useState(hisoblar[0]?.id || "");
  const [kirimId, setKirimId] = useState(hisoblar.length > 1 ? hisoblar[1]?.id : "");
  const [summa, setSumma] = useState("");
  const [valyuta, setValyuta] = useState("UZS");
  const [izoh, setIzoh] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    haptic("light");
    if (!chiqimId || !kirimId) return setError("Iltimos, hisoblarni tanlang.");
    if (chiqimId === kirimId) return setError("Bir xil hisobni tanlash mumkin emas.");
    const numSumma = Number(summa);
    if (!numSumma || numSumma <= 0) return setError("Summani to'g'ri kiriting.");

    setLoading(true);
    setError("");

    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    
    const { error: err } = await supabase.rpc("fn_pul_otkazish", {
      p_chiqim_hisob_id: chiqimId,
      p_kirim_hisob_id: kirimId,
      p_summa: numSumma,
      p_valyuta: valyuta,
      p_izoh: izoh,
      p_xodim: tgUser?.first_name || "Mini App",
      p_telegram_user_id: tgUser?.id || null
    });

    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      haptic("success");
      onSuccess();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4 sm:p-0 pb-10">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
            Pul O'tkazish
          </h3>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleTransfer} className="p-4 space-y-4 overflow-y-auto">
          {error && <div className="text-red-500 text-xs font-medium p-2 bg-red-50 rounded-lg">{error}</div>}
          
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Qaysi hisobdan (Chiqim):</label>
              <select value={chiqimId} onChange={e => setChiqimId(e.target.value)} className="w-full border p-2.5 rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700">
                {hisoblar.map(h => <option key={h.id} value={h.id}>{h.nom} ({h.valyuta})</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Qaysi hisobga (Kirim):</label>
              <select value={kirimId} onChange={e => setKirimId(e.target.value)} className="w-full border p-2.5 rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700">
                {hisoblar.map(h => <option key={h.id} value={h.id}>{h.nom} ({h.valyuta})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Summa:</label>
                <input type="number" step="0.01" value={summa} onChange={e => setSumma(e.target.value)} placeholder="0" className="w-full border p-2.5 rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Valyuta:</label>
                <select value={valyuta} onChange={e => setValyuta(e.target.value)} className="w-full border p-2.5 rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="UZS">UZS (So'm)</option>
                  <option value="USD">USD (Dollar)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Izoh (ixtiyoriy):</label>
              <input type="text" value={izoh} onChange={e => setIzoh(e.target.value)} placeholder="Masalan: qarz berildi..." className="w-full border p-2.5 rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all mt-4">
            {loading ? "O'tkazilmoqda..." : "Pulni O'tkazish"}
          </button>
        </form>
      </div>
    </div>
  );
}
