import React, { useState, useRef, useEffect } from "react";
import { 
  X, Package, DollarSign, TrendingUp, AlertTriangle, Layers, Edit2, Plus, 
  Check, Camera, ImagePlus, Loader2, Trash2 
} from "lucide-react";
import { pul, haptic, supabase } from "../lib/supabase";
import { uploadTovarRasm } from "../lib/imageUtils";

interface TovarDetailsModalProps {
  tovar: any;
  onClose: () => void;
  onUpdate: () => void;
}

export function TovarDetailsModal({ tovar, onClose, onUpdate }: TovarDetailsModalProps) {
  const [kirimModalOchiq, setKirimModalOchiq] = useState(false);
  const [kirimSoni, setKirimSoni] = useState("");
  const [yangiNarx, setYangiNarx] = useState(String(tovar?.narx_optom || ""));
  const [yangiTannarx, setYangiTannarx] = useState(String(tovar?.tannarx || ""));
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [muvaffaqiyat, setMuvaffaqiyat] = useState<string | null>(null);

  // Tahrirlash holati
  const [tahrirlashRejimi, setTahrirlashRejimi] = useState(false);
  const [tahrirNom, setTahrirNom] = useState(tovar?.nom || "");
  const [tahrirModel, setTahrirModel] = useState(tovar?.model || "");
  const [tahrirShtrixkod, setTahrirShtrixkod] = useState(tovar?.shtrixkod || "");
  const [tahrirBirlik, setTahrirBirlik] = useState(tovar?.birlik || "dona");
  const [tahrirValyuta, setTahrirValyuta] = useState(tovar?.valyuta || "UZS");
  const [tahrirTannarx, setTahrirTannarx] = useState(String(tovar?.tannarx || ""));
  const [tahrirNarxOptom, setTahrirNarxOptom] = useState(String(tovar?.narx_optom || ""));
  const [tahrirQoldiq, setTahrirQoldiq] = useState(String(tovar?.qoldiq || "0"));
  const [tahrirSaqlanmoqda, setTahrirSaqlanmoqda] = useState(false);
  const [tahrirXato, setTahrirXato] = useState("");

  // O'chirish holati
  const [ochirishTasdiq, setOchirishTasdiq] = useState(false);
  const [ochirilmoqda, setOchirilmoqda] = useState(false);
  const [ochirishXato, setOchirishXato] = useState("");

  // Rasm yuklash va yangilash holati
  const [rasmUrl, setRasmUrl] = useState<string | null>(tovar?.rasm_url || null);
  const [rasmYuklanmoqda, setRasmYuklanmoqda] = useState(false);
  const [rasmStatistika, setRasmStatistika] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tovar) {
      setTahrirNom(tovar.nom || "");
      setTahrirModel(tovar.model || "");
      setTahrirShtrixkod(tovar.shtrixkod || "");
      setTahrirBirlik(tovar.birlik || "dona");
      setTahrirValyuta(tovar.valyuta || "UZS");
      setTahrirTannarx(String(tovar.tannarx || ""));
      setTahrirNarxOptom(String(tovar.narx_optom || ""));
      setTahrirQoldiq(String(tovar.qoldiq || "0"));
      setRasmUrl(tovar.rasm_url || null);
      setYangiNarx(String(tovar.narx_optom || ""));
      setYangiTannarx(String(tovar.tannarx || ""));
    }
  }, [tovar]);

  if (!tovar) return null;

  const qoldiq = Number(tovar.qoldiq || 0);
  const tannarx = Number(tovar.tannarx || 0);
  const narxOptom = Number(tovar.narx_optom || 0);
  const valyuta = tovar.valyuta || "UZS";
  const birlik = tovar.birlik || "dona";

  const marja = narxOptom - tannarx;
  const marjaFoiz = tannarx > 0 ? ((marja / tannarx) * 100).toFixed(1) : null;
  const jamiTannarxQiymat = qoldiq * tannarx;
  const jamiSotuvQiymat = qoldiq * narxOptom;

  // Qoldiq holati
  const isKamQolgan = qoldiq <= (tovar.ogohlantirish_qoldiq || 5) && qoldiq > 0;
  const isTugagan = qoldiq <= 0;

  async function tovarTahrirSaqlash() {
    if (!tahrirNom.trim()) {
      setTahrirXato("Tovar nomi majburiy!");
      return;
    }

    setTahrirSaqlanmoqda(true);
    setTahrirXato("");
    haptic("medium");

    try {
      const yangilangan = {
        nom: tahrirNom.trim(),
        model: tahrirModel.trim() || null,
        shtrixkod: tahrirShtrixkod.trim() || null,
        birlik: tahrirBirlik || "dona",
        valyuta: tahrirValyuta || "UZS",
        tannarx: parseFloat(tahrirTannarx) || 0,
        narx_optom: parseFloat(tahrirNarxOptom) || 0,
        qoldiq: parseFloat(tahrirQoldiq) || 0,
      };

      const { error } = await supabase
        .from("tovarlar")
        .update(yangilangan)
        .eq("id", tovar.id);

      if (error) throw error;

      // Mahalliy obyektni yangilaymiz
      Object.assign(tovar, yangilangan);

      haptic("success");
      setMuvaffaqiyat("Tovar muvaffaqiyatli yangilandi!");
      setTahrirlashRejimi(false);
      onUpdate();
      setTimeout(() => setMuvaffaqiyat(null), 3000);
    } catch (err: any) {
      haptic("error");
      setTahrirXato("Xatolik: " + err.message);
    } finally {
      setTahrirSaqlanmoqda(false);
    }
  }

  async function tovarOchirish() {
    setOchirilmoqda(true);
    setOchirishXato("");
    haptic("medium");

    try {
      // Savdo qatorlarida mavjudligini tekshirish
      const { count } = await supabase
        .from("savdo_qatorlari")
        .select("*", { count: "exact", head: true })
        .eq("tovar_id", tovar.id);

      if (count && count > 0) {
        // Savdolarda mavjud -> Arxivlash (faol = false)
        const { error } = await supabase
          .from("tovarlar")
          .update({ faol: false })
          .eq("id", tovar.id);

        if (error) throw error;
      } else {
        // Tarixda savdo yo'q -> Butunlay o'chirish
        const { error } = await supabase
          .from("tovarlar")
          .delete()
          .eq("id", tovar.id);

        if (error) throw error;
      }

      haptic("success");
      onUpdate();
      onClose();
    } catch (err: any) {
      haptic("error");
      setOchirishXato("O'chirishda xatolik: " + err.message);
      setOchirilmoqda(false);
    }
  }

  async function qoldiqKirimQilish() {
    const son = parseFloat(kirimSoni);
    if (!son || son <= 0) {
      alert("Iltimos, to'g'ri miqdor kiriting!");
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const yangiJamiQoldiq = qoldiq + son;
      const yangilash: any = { qoldiq: yangiJamiQoldiq };

      if (parseFloat(yangiNarx) > 0) yangilash.narx_optom = parseFloat(yangiNarx);
      if (parseFloat(yangiTannarx) > 0) yangilash.tannarx = parseFloat(yangiTannarx);

      const { error } = await supabase
        .from("tovarlar")
        .update(yangilash)
        .eq("id", tovar.id);

      if (error) throw error;

      tovar.qoldiq = yangiJamiQoldiq;
      if (yangilash.narx_optom) tovar.narx_optom = yangilash.narx_optom;
      if (yangilash.tannarx) tovar.tannarx = yangilash.tannarx;

      haptic("success");
      setMuvaffaqiyat(`Omborga +${son} ${birlik} muvaffaqiyatli qo'shildi!`);
      setKirimModalOchiq(false);
      setKirimSoni("");
      onUpdate();

      setTimeout(() => setMuvaffaqiyat(null), 3000);
    } catch (e: any) {
      alert("Xatolik: " + e.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  async function modalRasmYukla(e: React.ChangeEvent<HTMLInputElement>) {
    const fayl = e.target.files?.[0];
    if (!fayl) return;

    setRasmYuklanmoqda(true);
    haptic("light");
    try {
      const res = await uploadTovarRasm(fayl);
      setRasmUrl(res.url);
      const oldMb = (res.originalSize / (1024 * 1024)).toFixed(1);
      const newKb = Math.round(res.compressedSize / 1024);
      const tejaldi = Math.round((1 - res.compressedSize / res.originalSize) * 100);
      setRasmStatistika(`${oldMb}MB → ${newKb}KB (${tejaldi}% siqildi)`);

      const { error } = await supabase
        .from("tovarlar")
        .update({ rasm_url: res.url })
        .eq("id", tovar.id);

      if (error) throw error;

      tovar.rasm_url = res.url;
      haptic("success");
      setMuvaffaqiyat("Tovar rasmi muvaffaqiyatli saqlandi!");
      onUpdate();
      setTimeout(() => setMuvaffaqiyat(null), 3500);
    } catch (err: any) {
      haptic("error");
      alert(err.message || "Rasm yuklashda xatolik yuz berdi");
    } finally {
      setRasmYuklanmoqda(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[88vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
        {/* Yashirin fayl tanlash inputi (Kamera / Galereya) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={modalRasmYukla}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">Tovar Tafsilotlari</h3>
              <p className="text-[10px] text-slate-400 font-medium">Ombor kartochkasi</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                haptic("light");
                setTahrirlashRejimi(!tahrirlashRejimi);
                setOchirishTasdiq(false);
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors ${
                tahrirlashRejimi
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
              }`}
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{tahrirlashRejimi ? "Bekor qilish" : "Tahrirlash"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Xabar */}
        {muvaffaqiyat && (
          <div className="p-2.5 bg-emerald-600 text-white rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm">
            <Check className="w-4 h-4 flex-shrink-0" />
            <p>{muvaffaqiyat}</p>
          </div>
        )}

        {/* TAHRIRLASH FORMASI */}
        {tahrirlashRejimi ? (
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5 text-emerald-600" /> Tovar ma'lumotlarini o'zgartirish
              </span>
            </div>

            {tahrirXato && (
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{tahrirXato}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Tovar nomi *
              </label>
              <input
                type="text"
                value={tahrirNom}
                onChange={(e) => setTahrirNom(e.target.value)}
                placeholder="Masalan: iPhone 15 Pro Max"
                className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Model / Marka
                </label>
                <input
                  type="text"
                  value={tahrirModel}
                  onChange={(e) => setTahrirModel(e.target.value)}
                  placeholder="256GB Black"
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Shtrixkod
                </label>
                <input
                  type="text"
                  value={tahrirShtrixkod}
                  onChange={(e) => setTahrirShtrixkod(e.target.value)}
                  placeholder="Masalan: 47800..."
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Kirim (tannarx)
                </label>
                <input
                  type="number"
                  value={tahrirTannarx}
                  onChange={(e) => setTahrirTannarx(e.target.value)}
                  placeholder="0"
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Sotish (optom)
                </label>
                <input
                  type="number"
                  value={tahrirNarxOptom}
                  onChange={(e) => setTahrirNarxOptom(e.target.value)}
                  placeholder="0"
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Hozirgi qoldiq
                </label>
                <input
                  type="number"
                  value={tahrirQoldiq}
                  onChange={(e) => setTahrirQoldiq(e.target.value)}
                  placeholder="0"
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTahrirlashRejimi(false)}
                className="py-2 px-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Bekor
              </button>
              <button
                type="button"
                onClick={tovarTahrirSaqlash}
                disabled={tahrirSaqlanmoqda}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {tahrirSaqlanmoqda ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saqlanmoqda...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Saqlash
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tovar Asosiy Ko'rinishi (Rasm + Nom) */}
            <div className="flex gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
              {/* Kvadrat rasm konteyneri va kamera tugmasi */}
              <div className="relative w-20 h-20 bg-white dark:bg-slate-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-2xs group">
                {rasmYuklanmoqda ? (
                  <div className="flex flex-col items-center justify-center text-emerald-700 dark:text-emerald-400 p-1 text-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-[8px] font-bold mt-1">Siqilmoqda...</span>
                  </div>
                ) : rasmUrl ? (
                  <>
                    <img src={rasmUrl} alt={tovar.nom} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Rasmni almashtirish"
                      className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="text-[8px] font-bold mt-0.5">Almashtirish</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full flex flex-col items-center justify-center p-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-400 transition-colors active:scale-95"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[9px] font-extrabold text-center leading-tight mt-0.5">+ Rasm</span>
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-base font-black text-slate-900 dark:text-white truncate leading-snug">{tovar.nom}</h2>
                  {tovar.model && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded font-bold text-[10px]">
                      #{tovar.model}
                    </span>
                  )}
                </div>
                {tovar.shtrixkod && (
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Shtrixkod: <span className="font-bold text-slate-700 dark:text-slate-300">{tovar.shtrixkod}</span>
                  </p>
                )}

                {/* Rasm qo'shish / siqish statusi */}
                {!rasmUrl && !rasmYuklanmoqda && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    <ImagePlus className="w-3 h-3" /> Kamera / Galereyadan rasm yuklash
                  </button>
                )}
                {rasmStatistika && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5 truncate">
                    {rasmStatistika}
                  </p>
                )}

                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      isTugagan
                        ? "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300"
                        : isKamQolgan
                        ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                        : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    {isTugagan ? "Tugagan" : isKamQolgan ? "Kam qolgan" : "Qoldiq yetarli"}
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                    {pul(qoldiq)} {birlik}
                  </span>
                </div>
              </div>
            </div>

            {/* Narxlar Ko'rsatkichlari */}
            <div className="grid grid-cols-2 gap-2">
              {/* Optom Narxi */}
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                  B2B Optom Narxi
                </span>
                <p className="text-base font-black text-emerald-950 dark:text-emerald-200 tabular-nums mt-0.5">
                  {pul(narxOptom)} {valyuta}
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Asosiy sotish narxi</p>
              </div>

              {/* Tannarx */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Kirim Tannarxi
                </span>
                <p className="text-base font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {pul(tannarx)} {valyuta}
                </p>
                {marjaFoiz && (
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    +{pul(marja)} {valyuta} ({marjaFoiz}%)
                  </p>
                )}
              </div>
            </div>

            {/* Ombordagi Jami Partiya Qiymati */}
            <div className="bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-2xl space-y-1">
              <div className="flex justify-between items-center text-[11px] opacity-80">
                <span>Ombordagi jami tovar tannarxi:</span>
                <span className="font-bold tabular-nums">
                  {pul(jamiTannarxQiymat)} {valyuta}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-black pt-1 border-t border-slate-800 dark:border-slate-700">
                <span className="text-emerald-400">Kutilayotgan sotuv summasi:</span>
                <span className="text-emerald-400 text-sm tabular-nums">
                  {pul(jamiSotuvQiymat)} {valyuta}
                </span>
              </div>
            </div>

            {/* Tezkor Kirim / Qoldiq qo'shish bloki */}
            {!kirimModalOchiq ? (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setKirimModalOchiq(true);
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Omborga Kirim Qilish
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl space-y-2.5 animate-fade-in">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" /> Yangi tovar qoldig'ini qo'shish
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Kirim soni *</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={kirimSoni}
                      onChange={(e) => setKirimSoni(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Tannarx</label>
                    <input
                      type="number"
                      placeholder={String(tannarx)}
                      value={yangiTannarx}
                      onChange={(e) => setYangiTannarx(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Optom narx</label>
                    <input
                      type="number"
                      placeholder={String(narxOptom)}
                      value={yangiNarx}
                      onChange={(e) => setYangiNarx(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setKirimModalOchiq(false)}
                    className="py-1.5 px-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg"
                  >
                    Bekor
                  </button>
                  <button
                    type="button"
                    onClick={qoldiqKirimQilish}
                    disabled={yuklanmoqda}
                    className="flex-1 py-1.5 bg-emerald-600 text-white font-black text-xs rounded-lg active:scale-95 disabled:opacity-50"
                  >
                    {yuklanmoqda ? "Saqlanmoqda..." : "Kirimni Tasdiqlash"}
                  </button>
                </div>
              </div>
            )}

            {/* O'chirish / Arxivlash qismi */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {ochirishXato && (
                <div className="p-2 mb-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{ochirishXato}</span>
                </div>
              )}

              {!ochirishTasdiq ? (
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setOchirishTasdiq(true);
                  }}
                  className="w-full py-2 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-700 dark:text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Tovarni o'chirish / arxivlash
                </button>
              ) : (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2 animate-fade-in">
                  <p className="text-xs font-bold text-rose-900 dark:text-rose-200 text-center leading-snug">
                    Haqiqatan ham ushbu tovarni ombordan o'chirmoqchimisiz?
                  </p>
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 text-center">
                    Agar bu tovar bo'yicha savdo qilingan bo'lsa, u hisobotlar buzilmasligi uchun arxivlanadi.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOchirishTasdiq(false)}
                      disabled={ochirilmoqda}
                      className="flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="button"
                      onClick={tovarOchirish}
                      disabled={ochirilmoqda}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {ochirilmoqda ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> O'chirilmoqda...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" /> Ha, o'chirilsin
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
