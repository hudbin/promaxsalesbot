import React, { useState } from "react";
import { Download, Calendar } from "lucide-react";
import { haptic, supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export function HisobotlarTab() {
  const [boshlanishSana, setBoshlanishSana] = useState("");
  const [tugashSana, setTugashSana] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  async function hisobotYuklash() {
    if (!boshlanishSana || !tugashSana) {
      alert("Iltimos, boshlanish va tugash sanalarini tanlang.");
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    try {
      // 1. Savdolar
      const { data: savdolar, error: savdoError } = await supabase
        .from("savdolar")
        .select("*")
        .gte("sana_vaqt", `${boshlanishSana}T00:00:00Z`)
        .lte("sana_vaqt", `${tugashSana}T23:59:59Z`)
        .order("sana_vaqt", { ascending: true });

      if (savdoError) throw savdoError;

      // 2. Rasxodlar
      const { data: rasxodlar, error: rasxodError } = await supabase
        .from("rasxodlar")
        .select("*")
        .gte("sana_vaqt", `${boshlanishSana}T00:00:00Z`)
        .lte("sana_vaqt", `${tugashSana}T23:59:59Z`)
        .order("sana_vaqt", { ascending: true });

      if (rasxodError) throw rasxodError;

      // Excel yaratish
      const wb = XLSX.utils.book_new();

      // Savdolar sheet
      const savdoSheetData = savdolar.map((s) => ({
        "ID": s.id,
        "Sana": new Date(s.sana_vaqt).toLocaleString("ru-RU"),
        "Mijoz Ismi": s.mijoz_ismi,
        "Telefon": s.telefon,
        "Xodim": s.xodim,
        "Jami Summa": s.jami_summa,
        "To'langan Summa": s.tolangan_summa,
        "Qarz Summa": s.qarz_summa,
        "Valyuta": s.valyuta,
        "To'lov Turi": s.tolov_turi,
        "Kassa Turi": s.kassa_turi,
        "Izoh": s.izoh,
        "Holat": s.holat
      }));
      const wsSavdolar = XLSX.utils.json_to_sheet(savdoSheetData);
      XLSX.utils.book_append_sheet(wb, wsSavdolar, "Savdolar");

      // Rasxodlar sheet
      const rasxodSheetData = rasxodlar.map((r) => ({
        "ID": r.id,
        "Sana": new Date(r.sana_vaqt).toLocaleString("ru-RU"),
        "Kategoriya": r.kategoriya,
        "Summa": r.summa,
        "Valyuta": r.valyuta,
        "To'lov Turi": r.tolov_turi,
        "Kassa Turi": r.kassa_turi,
        "Xodim": r.xodim,
        "Izoh": r.izoh,
        "Holat": r.holat
      }));
      const wsRasxodlar = XLSX.utils.json_to_sheet(rasxodSheetData);
      XLSX.utils.book_append_sheet(wb, wsRasxodlar, "Xarajatlar");

      // Faylni yuklab olish
      XLSX.writeFile(wb, `Hisobot_${boshlanishSana}_${tugashSana}.xlsx`);

      setXabar("Hisobot muvaffaqiyatli yuklab olindi!");
      haptic("success");
      setTimeout(() => setXabar(null), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Xatolik: " + err.message);
      haptic("error");
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <div className="space-y-4">
      {xabar && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-semibold text-center">
          {xabar}
        </div>
      )}
      
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          Davrni tanlang
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Boshlanish sana:</label>
            <input
              type="date"
              value={boshlanishSana}
              onChange={(e) => setBoshlanishSana(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Tugash sana:</label>
            <input
              type="date"
              value={tugashSana}
              onChange={(e) => setTugashSana(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <button
          onClick={hisobotYuklash}
          disabled={yuklanmoqda}
          className="w-full py-3 mt-2 bg-indigo-600 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {yuklanmoqda ? "Yuklanmoqda..." : "Hisobotni (Excel) Yuklab Olish"}
        </button>
      </div>
    </div>
  );
}
