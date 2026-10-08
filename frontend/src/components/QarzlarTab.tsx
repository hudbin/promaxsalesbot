import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { 
  Search, Phone, MapPin, HandCoins, CheckCircle, ChevronRight, 
  Users, UserPlus, FileText, DollarSign, Wallet, Plus, X,
  MessageCircle, Send
} from "lucide-react";
import { MijozDetailsModal, yuborTelegramEslatma, standartEslatmaMatni } from "./MijozDetailsModal";
import { Combobox } from "./ui/Combobox";
import { toast } from "sonner";

interface QarzlarTabProps {
  xodimNomi?: string;
  telegramUserId?: number | string | null;
}

type SubTab = "qarzlar" | "mijozlar";

export function QarzlarTab({ xodimNomi, telegramUserId }: QarzlarTabProps = {}) {
  const [subTab, setSubTab] = useState<SubTab>("qarzlar");
  const [barchaMijozlar, setBarchaMijozlar] = useState<any[]>([]);
  const [qidiruv, setQidiruv] = useState("");
  const [tanlanganMijoz, setTanlanganMijoz] = useState<any>(null);
  const [tanlanganMijozDetali, setTanlanganMijozDetali] = useState<any>(null);
  const [tolovSumma, setTolovSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [tolovTuri, setTolovTuri] = useState("naqd");
  const [kassaTuri, setKassaTuri] = useState("naqd_uzs");
  const [izoh, setIzoh] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  // Yangi mijoz qo'shish modal holati
  const [yangiMijozModalOchiq, setYangiMijozModalOchiq] = useState(false);
  const [yangiNom, setYangiNom] = useState("");
  const [yangiTelefon, setYangiTelefon] = useState("");
  const [yangiTelegram, setYangiTelegram] = useState("");
  const [yangiManzil, setYangiManzil] = useState("");
  const [yangiQarzUzs, setYangiQarzUzs] = useState("");
  const [yangiQarzUsd, setYangiQarzUsd] = useState("");
  const [yangiIzoh, setYangiIzoh] = useState("");
  const [yangiSaqlanmoqda, setYangiSaqlanmoqda] = useState(false);
  const [formaXato, setFormaXato] = useState("");

  useEffect(() => {
    yuklaMijozlar();
  }, []);

  async function yuklaMijozlar() {
    setYuklanmoqda(true);
    const { data, error } = await supabase
      .from("mijozlar")
      .select("*")
      .eq("faol", true)
      .order("nom", { ascending: true });

    if (data) {
      setBarchaMijozlar(data);
    }
    if (error) {
      console.error("Mijozlarni yuklash xatosi:", error);
    }
    setYuklanmoqda(false);
  }

  // Faqat qarzdor mijozlar (UZS yoki USD qarzi bo'lganlar)
  const qarzdorMijozlar = barchaMijozlar
    .filter((m) => Number(m.qarz_uzs || 0) > 0 || Number(m.qarz_usd || 0) > 0)
    .sort((a, b) => Number(b.qarz_uzs || 0) - Number(a.qarz_uzs || 0));

  const jamiQarzUZS = qarzdorMijozlar.reduce((sum, m) => sum + Number(m.qarz_uzs || 0), 0);
  const jamiQarzUSD = qarzdorMijozlar.reduce((sum, m) => sum + Number(m.qarz_usd || 0), 0);

  // Qidiruv bo'yicha filtrlash
  const saralanganQarzdorlar = qarzdorMijozlar.filter(
    (m) =>
      m.nom.toLowerCase().includes(qidiruv.toLowerCase()) ||
      (m.telefon && m.telefon.includes(qidiruv)) ||
      (m.manzil && m.manzil.toLowerCase().includes(qidiruv.toLowerCase()))
  );

  const saralanganBarcha = barchaMijozlar.filter(
    (m) =>
      m.nom.toLowerCase().includes(qidiruv.toLowerCase()) ||
      (m.telefon && m.telefon.includes(qidiruv)) ||
      (m.manzil && m.manzil.toLowerCase().includes(qidiruv.toLowerCase()))
  );

  async function qarzTolovSaqla() {
    const sonSumma = Number(tolovSumma);
    if (!sonSumma || sonSumma <= 0 || !tanlanganMijoz) return;

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const { error } = await supabase.rpc("fn_qarz_tolov_yaratish", {
        p_mijoz_id: tanlanganMijoz.id,
        p_summa: sonSumma,
        p_valyuta: valyuta,
        p_tolov_turi: tolovTuri,
        p_kassa_turi: kassaTuri,
        p_izoh: izoh.trim() || null,
        p_xodim: xodimNomi || "Mini App",
        p_telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      });

      if (error) throw error;

      haptic("success");
      toast.success("Qarz to'lovi qabul qilindi!", {
        description: `${tanlanganMijoz.nom}: ${pul(sonSumma)} ${valyuta}`,
      });
      setTanlanganMijoz(null);
      setTolovSumma("");
      setIzoh("");
      await yuklaMijozlar();
    } catch (err: any) {
      haptic("error");
      toast.error("Xatolik", { description: err.message });
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Yangi mijoz saqlash
  async function yangiMijozSaqla() {
    if (!yangiNom.trim()) {
      setFormaXato("Mijoz ismini kiritish majburiy!");
      return;
    }

    setYangiSaqlanmoqda(true);
    setFormaXato("");
    haptic("medium");

    try {
      const { data, error } = await supabase
        .from("mijozlar")
        .insert({
          nom: yangiNom.trim(),
          nom_norm: yangiNom.trim().toLowerCase(),
          telefon: yangiTelefon.trim() || null,
          telegram: yangiTelegram.trim() || null,
          manzil: yangiManzil.trim() || null,
          qarz_uzs: Number(yangiQarzUzs) || 0,
          qarz_usd: Number(yangiQarzUsd) || 0,
          izoh: yangiIzoh.trim() || null,
          faol: true,
        })
        .select()
        .single();

      if (error) throw error;

      haptic("success");
      toast.success("Mijoz muvaffaqiyatli qo'shildi!", {
        description: `"${data.nom}" mijozlar bazasiga qo'shildi.`,
      });
      
      // Tozalash va modalni yopish
      setYangiNom("");
      setYangiTelefon("");
      setYangiTelegram("");
      setYangiManzil("");
      setYangiQarzUzs("");
      setYangiQarzUsd("");
      setYangiIzoh("");
      setYangiMijozModalOchiq(false);

      await yuklaMijozlar();
    } catch (err: any) {
      haptic("error");
      setFormaXato("Xatolik: " + err.message);
      toast.error("Mijozni saqlashda xatolik", { description: err.message });
    } finally {
      setYangiSaqlanmoqda(false);
    }
  }

  function ochTolovModali(m: any) {
    setTanlanganMijoz(m);
    if (m.qarz_usd > 0 && m.qarz_uzs <= 0) {
      setValyuta("USD");
      setKassaTuri("naqd_usd");
      setTolovSumma(String(m.qarz_usd));
    } else {
      setValyuta("UZS");
      setKassaTuri("naqd_uzs");
      setTolovSumma(String(m.qarz_uzs || ""));
    }
    haptic("medium");
  }

  const kassaOptions = [
    { value: "naqd_uzs", label: "Naqd (So'm)" },
    { value: "naqd_usd", label: "Naqd (Dollar)" },
    { value: "plastik_uzs", label: "Plastik karta" },
    { value: "bank_uzs", label: "Bank hisobi" },
  ];

  return (
    <div className="space-y-3 pb-8">
      {/* 2 TA ASOSIY TAB (QARZLAR & MIJOZLAR BAZASI) */}
      <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex gap-1 border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => {
            setSubTab("qarzlar");
            haptic("light");
          }}
          className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
            subTab === "qarzlar"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Wallet className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Qarzlar</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            subTab === "qarzlar" ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
          }`}>
            {qarzdorMijozlar.length}
          </span>
        </button>

        <button
          onClick={() => {
            setSubTab("mijozlar");
            haptic("light");
          }}
          className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
            subTab === "mijozlar"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Mijozlar bazasi</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            subTab === "mijozlar" ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-300" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
          }`}>
            {barchaMijozlar.length}
          </span>
        </button>
      </div>

      {/* 1-TAB: QARZLAR (QARZDORLAR VA BALANS) */}
      {subTab === "qarzlar" && (
        <div className="space-y-3 animate-fade-in">
          {/* Jami Qarzdorlik Balansi */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">So'mdagi jami qarz</span>
              <p className="text-base font-black text-amber-950 dark:text-amber-200 tabular-nums mt-0.5">{pul(jamiQarzUZS)} so'm</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-2.5 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">Dollardagi jami qarz</span>
              <p className="text-base font-black text-emerald-950 dark:text-emerald-200 tabular-nums mt-0.5">${pul(jamiQarzUSD)}</p>
            </div>
          </div>

          {/* Qidiruv */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Qarzdor ismi, telefon yoki bozor..."
              value={qidiruv}
              onChange={(e) => setQidiruv(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-xs font-medium shadow-2xs focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Qarzdor Mijozlar Ro'yxati */}
          <div className="space-y-2">
            {saralanganQarzdorlar.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Wallet className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs">Qarzdor mijozlar mavjud emas</p>
                <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">Barcha savdolar bo'yicha to'lovlar qabul qilingan.</p>
              </div>
            ) : (
              saralanganQarzdorlar.map((m) => (
                <div
                  key={m.id}
                  onClick={() => {
                    setTanlanganMijozDetali(m);
                    haptic("light");
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600 p-2.5 rounded-xl shadow-2xs flex justify-between items-center cursor-pointer active:bg-slate-50 dark:active:bg-slate-800 transition-all group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-amber-800 dark:group-hover:text-amber-400 truncate leading-snug">{m.nom}</h4>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors flex-shrink-0" />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      {m.telefon && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {m.telefon}
                        </span>
                      )}
                      {m.telegram && (
                        <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                          <MessageCircle className="w-3 h-3 text-sky-500" /> {m.telegram}
                        </span>
                      )}
                      {m.manzil && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {m.manzil}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2.5 mt-1 text-xs font-black">
                      {m.qarz_uzs > 0 && <span className="text-amber-700 dark:text-amber-400 tabular-nums">{pul(m.qarz_uzs)} so'm</span>}
                      {m.qarz_usd > 0 && <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">${pul(m.qarz_usd)}</span>}
                    </div>
                  </div>

                  {/* Amallar: Eslatma va To'lov */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(m.telegram || m.telefon) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          yuborTelegramEslatma(m, standartEslatmaMatni(m));
                        }}
                        title="Telegram orqali qarz eslatmasini yuborish"
                        className="p-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900 text-sky-600 dark:text-sky-400 rounded-lg flex items-center justify-center transition-all active:scale-90 border border-sky-200 dark:border-sky-800"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        ochTolovModali(m);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs active:scale-95 transition-transform text-xs"
                    >
                      <HandCoins className="w-3.5 h-3.5" /> To'lov
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2-TAB: MIJOZLAR BAZASI */}
      {subTab === "mijozlar" && (
        <div className="space-y-3 animate-fade-in">
          {/* Header & Qidiruv & Yangi mijoz tugmasi */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Mijoz ismi, telefon yoki do'koni..."
                value={qidiruv}
                onChange={(e) => setQidiruv(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-xs font-medium shadow-2xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                setYangiMijozModalOchiq(true);
                setFormaXato("");
                haptic("light");
              }}
              className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all flex-shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Yangi mijoz</span>
            </button>
          </div>

          {/* Barcha Mijozlar Ro'yxati */}
          <div className="space-y-2">
            {saralanganBarcha.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs">Mijozlar topilmadi</p>
                <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">"+ Yangi mijoz" tugmasi orqali yangi xaridor qo'shishingiz mumkin.</p>
              </div>
            ) : (
              saralanganBarcha.map((m) => {
                const hasUzsDebt = Number(m.qarz_uzs || 0) > 0;
                const hasUsdDebt = Number(m.qarz_usd || 0) > 0;
                const hasAnyDebt = hasUzsDebt || hasUsdDebt;

                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      setTanlanganMijozDetali(m);
                      haptic("light");
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600 p-3 rounded-xl shadow-2xs flex justify-between items-center cursor-pointer active:bg-slate-50 dark:active:bg-slate-800 transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        {/* Avatar monogramma */}
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 font-black text-xs flex items-center justify-center flex-shrink-0">
                          {m.nom.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate leading-tight">
                            {m.nom}
                          </h4>
                          {m.izoh && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[200px] mt-0.5">{m.izoh}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5 ml-9">
                        {m.telefon && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {m.telefon}
                          </span>
                        )}
                        {m.telegram && (
                          <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                            <MessageCircle className="w-3 h-3 text-sky-500" /> {m.telegram}
                          </span>
                        )}
                        {m.manzil && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {m.manzil}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Qarz holati / Ko'rsatkich */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {hasAnyDebt ? (
                        <>
                          {hasUzsDebt && (
                            <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300 rounded-md font-black text-[11px] tabular-nums">
                              {pul(m.qarz_uzs)} so'm
                            </span>
                          )}
                          {hasUsdDebt && (
                            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded-md font-black text-[11px] tabular-nums">
                              ${pul(m.qarz_usd)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 rounded-md font-semibold text-[10px]">
                          Qarzi yo'q
                        </span>
                      )}

                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mt-0.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* YANGI MIJOZ QO'SHISH MODALI (SUPABASE MIJOZLAR JADVALIGA MOS MAYDONLAR) */}
      {yangiMijozModalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-3 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-4 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Yangi mijoz qo'shish</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Mijozlar bazasiga yangi kontragent</p>
                </div>
              </div>
              <button 
                onClick={() => setYangiMijozModalOchiq(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {formaXato && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400 font-semibold rounded-xl">
                {formaXato}
              </div>
            )}

            {/* 1. Nomi (Majburiy) */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Mijoz / Do'kon nomi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={yangiNom}
                onChange={(e) => setYangiNom(e.target.value)}
                placeholder="Masalan: Sardor aka (Qo'yliq bozori)"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 2. Telefon */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Telefon raqami:</label>
              <input
                type="tel"
                value={yangiTelefon}
                onChange={(e) => setYangiTelefon(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Telegram */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Telegram manzili:</label>
              <input
                type="text"
                value={yangiTelegram}
                onChange={(e) => setYangiTelegram(e.target.value)}
                placeholder="@username yoki https://t.me/..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 3. Manzil */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Manzil / Do'kon joylashuvi:</label>
              <input
                type="text"
                value={yangiManzil}
                onChange={(e) => setYangiManzil(e.target.value)}
                placeholder="Shahar, bozor, qator, do'kon raqami..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 4. Boshlang'ich qarz (Ixtiyoriy) */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                Boshlang'ich qarz balansi (agar bo'lsa):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-0.5">So'mda (UZS):</label>
                  <input
                    type="number"
                    value={yangiQarzUzs}
                    onChange={(e) => setYangiQarzUzs(e.target.value)}
                    placeholder="0 so'm"
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-0.5">Dollarda (USD):</label>
                  <input
                    type="number"
                    value={yangiQarzUsd}
                    onChange={(e) => setYangiQarzUsd(e.target.value)}
                    placeholder="$0"
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* 5. Izoh */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Qo'shimcha izoh / eslatma:</label>
              <textarea
                value={yangiIzoh}
                onChange={(e) => setYangiIzoh(e.target.value)}
                rows={2}
                placeholder="Mijoz haqida eslatma..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Saqlash va Bekor qilish tugmalari */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setYangiMijozModalOchiq(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                Bekor qilish
              </button>
              <button
                onClick={yangiMijozSaqla}
                disabled={yangiSaqlanmoqda}
                className="flex-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {yangiSaqlanmoqda ? "Saqlanmoqda..." : "✅ Mijozni Saqlash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Qarz To'lovini Qabul Qilish Modali */}
      {tanlanganMijoz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-3 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{tanlanganMijoz.nom}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Qarz to'lovini qabul qilish</p>
              </div>
              <button onClick={() => setTanlanganMijoz(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 font-bold text-lg">
                ✕
              </button>
            </div>

            {/* Joriy qarz */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between font-bold text-xs">
              <span className="text-slate-600 dark:text-slate-400">Joriy qarz:</span>
              <span className="text-amber-800 dark:text-amber-300 tabular-nums">
                {tanlanganMijoz.qarz_uzs > 0 ? `${pul(tanlanganMijoz.qarz_uzs)} so'm ` : ""}
                {tanlanganMijoz.qarz_usd > 0 ? `$${pul(tanlanganMijoz.qarz_usd)}` : ""}
              </span>
            </div>

            {/* Valyuta tanlash */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setValyuta("UZS");
                  setKassaTuri("naqd_uzs");
                  setTolovSumma(String(tanlanganMijoz.qarz_uzs || ""));
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs border ${
                  valyuta === "UZS" ? "bg-amber-600 text-white border-amber-600 shadow-2xs" : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                So'm (UZS)
              </button>
              <button
                onClick={() => {
                  setValyuta("USD");
                  setKassaTuri("naqd_usd");
                  setTolovSumma(String(tanlanganMijoz.qarz_usd || ""));
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs border ${
                  valyuta === "USD" ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs" : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                Dollar (USD)
              </button>
            </div>

            {/* Summa */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">Qaytarilayotgan summa:</label>
              <input
                type="number"
                value={tolovSumma}
                onChange={(e) => setTolovSumma(e.target.value)}
                placeholder="0"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-lg text-slate-900 dark:text-white tabular-nums focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Kassa Combobox */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 block">Qaysi kassaga tushdi:</label>
              <Combobox
                title="Kassani tanlang"
                value={kassaTuri}
                onChange={setKassaTuri}
                options={kassaOptions}
              />
            </div>

            {/* Izoh */}
            <input
              type="text"
              placeholder="Izoh (masalan: do'konga olib kelib berdi)..."
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
            />

            {/* Saqlash */}
            <button
              onClick={qarzTolovSaqla}
              disabled={yuklanmoqda}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ To'lovni Qabul Qilish"}
            </button>
          </div>
        </div>
      )}

      {/* Mijoz Tafsilotlari Modali */}
      {tanlanganMijozDetali && (
        <MijozDetailsModal
          mijoz={tanlanganMijozDetali}
          onClose={() => setTanlanganMijozDetali(null)}
          onTolovOchish={(m) => {
            setTanlanganMijozDetali(null);
            ochTolovModali(m);
          }}
          onMijozYangilandi={() => {
            setTanlanganMijozDetali(null);
            yuklaMijozlar();
          }}
        />
      )}
    </div>
  );
}
