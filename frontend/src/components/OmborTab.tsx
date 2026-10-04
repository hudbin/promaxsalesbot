import React, { useState, useEffect, useRef } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { Search, Plus, AlertTriangle, Package, CheckCircle, ChevronRight, Camera, ImagePlus, Trash2, Loader2, Link2 } from "lucide-react";
import { TovarDetailsModal } from "./TovarDetailsModal";
import { Combobox } from "./ui/Combobox";
import { uploadTovarRasm } from "../lib/imageUtils";

export function OmborTab() {
  const [tovarlar, setTovarlar] = useState<any[]>([]);
  const [qidiruv, setQidiruv] = useState("");
  const [tanlanganTovarDetali, setTanlanganTovarDetali] = useState<any>(null);
  const [modalOchiq, setModalOchiq] = useState(false);
  const [nom, setNom] = useState("");
  const [model, setModel] = useState("");
  const [shtrixkod, setShtrixkod] = useState("");
  const [rasmUrl, setRasmUrl] = useState("");
  const [rasmYuklanmoqda, setRasmYuklanmoqda] = useState(false);
  const [rasmStatistika, setRasmStatistika] = useState<string | null>(null);
  const [urlKiritishRejimi, setUrlKiritishRejimi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tannarx, setTannarx] = useState("");
  const [narxOptom, setNarxOptom] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [qoldiq, setQoldiq] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    yuklaTovarlar();
  }, []);

  async function yuklaTovarlar() {
    setYuklanmoqda(true);
    const { data } = await supabase.from("tovarlar").select("*").eq("faol", true).order("nom");
    if (data) setTovarlar(data);
    setYuklanmoqda(false);
  }

  async function rasmTanlandi(e: React.ChangeEvent<HTMLInputElement>) {
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
      haptic("success");
    } catch (err: any) {
      haptic("error");
      alert(err.message || "Rasm yuklashda xatolik yuz berdi");
    } finally {
      setRasmYuklanmoqda(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function tovarSaqla() {
    if (!nom.trim() || !narxOptom) {
      alert("Iltimos, tovar nomi va narxini kiriting!");
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const { error } = await supabase.from("tovarlar").insert({
        nom: nom.trim(),
        model: model.trim() || null,
        shtrixkod: shtrixkod.trim() || null,
        rasm_url: rasmUrl.trim() || null,
        tannarx: Number(tannarx) || 0,
        narx_optom: Number(narxOptom) || 0,
        valyuta: valyuta,
        qoldiq: Number(qoldiq) || 0,
      });

      if (error) throw error;

      haptic("success");
      setXabar("Yangi tovar omborga qo'shildi!");
      setModalOchiq(false);
      setNom("");
      setModel("");
      setShtrixkod("");
      setRasmUrl("");
      setRasmStatistika(null);
      setUrlKiritishRejimi(false);
      setTannarx("");
      setNarxOptom("");
      setQoldiq("");
      await yuklaTovarlar();

      setTimeout(() => setXabar(null), 3000);
    } catch (err: any) {
      haptic("error");
      alert("Xatolik: " + err.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  const kamQolganlar = tovarlar.filter((t) => t.qoldiq <= (t.ogohlantirish_qoldiq || 5));
  const jamiDona = tovarlar.reduce((sum, t) => sum + Number(t.qoldiq || 0), 0);

  const saralangan = tovarlar.filter(
    (t) =>
      t.nom.toLowerCase().includes(qidiruv.toLowerCase()) ||
      (t.model && t.model.toLowerCase().includes(qidiruv.toLowerCase())) ||
      (t.shtrixkod && t.shtrixkod.includes(qidiruv))
  );

  return (
    <div className="space-y-3">
      {/* Xabar */}
      {xabar && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl flex items-center gap-2 shadow-2xs text-xs font-semibold">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <p>{xabar}</p>
        </div>
      )}

      {/* Ombor Umumiy Xulosasi */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Jami Mahsulotlar</span>
          <p className="text-base font-black text-slate-900 tabular-nums mt-0.5">{tovarlar.length} ta</p>
          <p className="text-[10px] text-slate-400 font-medium">turli xil tovar</p>
        </div>
        <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ombor Qoldig'i</span>
          <p className="text-base font-black text-emerald-800 tabular-nums mt-0.5">{pul(jamiDona)} dona</p>
          <p className="text-[10px] text-slate-400 font-medium">jami fizik miqdor</p>
        </div>
      </div>

      {/* Kam qolgan tovarlar ogohlantirishi */}
      {kamQolganlar.length > 0 && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-bold">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            Diqqat: {kamQolganlar.length} ta tovar kam qoldi!
          </span>
        </div>
      )}

      {/* Qidiruv va Yangi tovar qo'shish */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Tovar yoki model qidirish..."
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium shadow-2xs focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={() => {
            setModalOchiq(true);
            haptic("medium");
          }}
          className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl flex items-center gap-1 shadow-2xs active:scale-95 transition-transform text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Tovar
        </button>
      </div>

      {/* Tovarlar Ro'yxati */}
      <div className="space-y-2">
        {saralangan.length === 0 ? (
          <p className="text-slate-400 text-center py-6 font-medium text-xs">Tovarlar topilmadi.</p>
        ) : (
          saralangan.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                haptic("light");
                setTanlanganTovarDetali(t);
              }}
              className="bg-white border border-slate-200 hover:border-emerald-300 p-2.5 rounded-xl shadow-2xs flex items-center gap-2.5 cursor-pointer active:scale-[0.99] transition-all"
            >
              {/* Tovar rasmi */}
              <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-100">
                {t.rasm_url ? (
                  <img src={t.rasm_url} alt={t.nom} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-5 h-5 text-slate-400" />
                )}
              </div>

              {/* Tovar Tafsilotlari */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-xs text-slate-900 truncate leading-snug">{t.nom}</h4>
                  {t.model && (
                    <span className="bg-slate-100 text-slate-600 px-1 py-0.2 rounded text-[10px] font-bold">
                      #{t.model}
                    </span>
                  )}
                </div>
                <p className="text-xs font-black text-emerald-800 tabular-nums mt-0.5">
                  {pul(t.narx_optom)} {t.valyuta}
                </p>
                {t.tannarx > 0 && (
                  <p className="text-[10px] text-slate-400 font-medium">
                    Tannarx: {pul(t.tannarx)} {t.valyuta}
                  </p>
                )}
              </div>

              {/* Qoldiq va o'tish ko'rsatkichi */}
              <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                <div>
                  <span
                    className={`text-sm font-black tabular-nums block ${
                      t.qoldiq <= 5 ? "text-rose-600" : "text-slate-900"
                    }`}
                  >
                    {pul(t.qoldiq)}
                  </span>
                  <p className="text-[10px] font-semibold text-slate-500">{t.birlik}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Yangi Tovar Qo'shish Modali */}
      {modalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-3">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-4 space-y-2.5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-sm font-bold text-slate-900">Yangi tovar qo'shish</h3>
              <button onClick={() => setModalOchiq(false)} className="text-slate-400 p-1 font-bold text-lg">
                ✕
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Tovar nomi *</label>
              <input
                type="text"
                placeholder="masalan: Velikan Uzun"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full p-2 border rounded-lg font-semibold text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Model / Artikul</label>
                <input
                  type="text"
                  placeholder="5017"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full p-2 border rounded-lg font-semibold text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Shtrix-kod</label>
                <input
                  type="text"
                  placeholder="Shtrix-kod..."
                  value={shtrixkod}
                  onChange={(e) => setShtrixkod(e.target.value)}
                  className="w-full p-2 border rounded-lg font-semibold text-xs"
                />
              </div>
            </div>

            {/* Tovar Rasmi (Kamera yoki Galereya) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-700">Tovar rasmi (Ixtiyoriy):</label>
                <button
                  type="button"
                  onClick={() => setUrlKiritishRejimi(!urlKiritishRejimi)}
                  className="text-[10px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                >
                  <Link2 className="w-3 h-3" />
                  {urlKiritishRejimi ? "Kameradan yuklash" : "URL orqali kiritish"}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={rasmTanlandi}
                className="hidden"
              />

              {urlKiritishRejimi ? (
                <input
                  type="url"
                  placeholder="https://... rasm havolasi"
                  value={rasmUrl}
                  onChange={(e) => setRasmUrl(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg font-medium text-xs bg-slate-50 focus:bg-white"
                />
              ) : rasmYuklanmoqda ? (
                <div className="w-full p-3.5 border-2 border-dashed border-emerald-300 rounded-xl bg-emerald-50/50 flex flex-col items-center justify-center gap-1 text-emerald-800 text-xs font-bold animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <span>Kvadrat qilib siqilmoqda va yuklanmoqda...</span>
                </div>
              ) : rasmUrl ? (
                <div className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-slate-200 shadow-2xs">
                    <img src={rasmUrl} alt="Tanlangan" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      ✅ Kvadrat qilib saqlandi
                    </span>
                    {rasmStatistika && (
                      <p className="text-[10px] text-slate-500 font-medium mt-1 truncate">
                        {rasmStatistika}
                      </p>
                    )}
                    <div className="flex gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs active:scale-95"
                      >
                        Almashtirish
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRasmUrl("");
                          setRasmStatistika(null);
                        }}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-800 px-1 py-0.5"
                      >
                        O'chirish
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-3 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl bg-slate-50/80 hover:bg-emerald-50/20 cursor-pointer flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 text-slate-600">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-700">Kamera yoki Galereya</span>
                    <ImagePlus className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium text-center">
                    Rasm avtomatik 1:1 kvadrat qilinadi va siqiladi (~80KB)
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Ulgurji Narxi *</label>
                <input
                  type="number"
                  placeholder="95000"
                  value={narxOptom}
                  onChange={(e) => setNarxOptom(e.target.value)}
                  className="w-full p-2 border rounded-lg font-black text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Tannarxi</label>
                <input
                  type="number"
                  placeholder="70000"
                  value={tannarx}
                  onChange={(e) => setTannarx(e.target.value)}
                  className="w-full p-2 border rounded-lg font-black text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Valyuta:</label>
                <Combobox
                  title="Valyutani tanlang"
                  value={valyuta}
                  onChange={(v) => setValyuta(v as any)}
                  options={[
                    { value: "UZS", label: "So'm (UZS)" },
                    { value: "USD", label: "Dollar (USD)" },
                  ]}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Boshlang'ich qoldiq:</label>
                <input
                  type="number"
                  placeholder="100"
                  value={qoldiq}
                  onChange={(e) => setQoldiq(e.target.value)}
                  className="w-full p-2 border rounded-lg font-black text-sm tabular-nums"
                />
              </div>
            </div>

            <button
              onClick={tovarSaqla}
              disabled={yuklanmoqda}
              className="w-full py-2.5 bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ Omborda Saqlash"}
            </button>
          </div>
        </div>
      )}

      {/* Tovar Tafsilotlari Modali */}
      {tanlanganTovarDetali && (
        <TovarDetailsModal
          tovar={tanlanganTovarDetali}
          onClose={() => setTanlanganTovarDetali(null)}
          onUpdate={yuklaTovarlar}
        />
      )}
    </div>
  );
}
