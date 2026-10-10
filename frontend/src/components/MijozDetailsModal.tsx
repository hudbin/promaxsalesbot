import React, { useState, useEffect } from "react";
import { 
  X, User, Phone, MapPin, HandCoins, History, ArrowDownLeft, 
  ShoppingBag, Edit2, Trash2, Check, AlertTriangle, Loader2,
  Send, MessageCircle, ExternalLink, FileText
} from "lucide-react";
import { pul, haptic, supabase } from "../lib/supabase";
import { toast } from "sonner";

interface MijozDetailsModalProps {
  mijoz: any;
  onClose: () => void;
  onTolovOchish: (mijoz: any) => void;
  onMijozYangilandi?: () => void;
}

export function standartEslatmaMatni(m: any) {
  const qarzUzs = Number(m?.qarz_uzs || 0);
  const qarzUsd = Number(m?.qarz_usd || 0);
  let qarzMatn = "";
  if (qarzUzs > 0) qarzMatn += `🔹 ${pul(qarzUzs)} so'm\n`;
  if (qarzUsd > 0) qarzMatn += `🔹 $${pul(qarzUsd)}\n`;

  return `Assalomu alaykum, hurmatli ${m?.nom || "Mijoz"}!\n\n` +
    `PROMAX Store do'konimizdan joriy hisobingiz bo'yicha qarzingiz:\n` +
    `${qarzMatn || "0 so'm\n"}\n` +
    `Iltimos, imkon qadar to'lovni amalga oshirishingizni so'raymiz.\n\n` +
    `Hurmat bilan, PROMAX Store!`;
}

export function getTelegramUrl(m: any, text: string) {
  const encoded = encodeURIComponent(text);
  let tg = (m?.telegram || "").trim();
  if (tg) {
    if (tg.startsWith("https://t.me/")) {
      tg = tg.replace("https://t.me/", "");
    } else if (tg.startsWith("http://t.me/")) {
      tg = tg.replace("http://t.me/", "");
    } else if (tg.startsWith("t.me/")) {
      tg = tg.replace("t.me/", "");
    }
    tg = tg.replace(/^@/, "");

    if (tg.startsWith("+") || /^\d+$/.test(tg)) {
      const phoneDigits = tg.replace(/[^\d]/g, "");
      return `https://t.me/+${phoneDigits}?text=${encoded}`;
    }
    return `https://t.me/${tg}?text=${encoded}`;
  }

  // Telegram username bo'lmasa, telefon raqami orqali t.me/+998...
  let tel = (m?.telefon || "").trim().replace(/[^\d]/g, "");
  if (tel) {
    return `https://t.me/+${tel}?text=${encoded}`;
  }

  return "";
}

export function yuborTelegramEslatma(m: any, text: string) {
  const url = getTelegramUrl(m, text);
  if (!url) {
    toast.error("Mijozning telegram manzili yoki telefon raqami kiritilmagan!");
    return;
  }

  haptic("medium");
  const tgApp = (window as any)?.Telegram?.WebApp;
  if (tgApp && typeof tgApp.openTelegramLink === "function") {
    tgApp.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

export function MijozDetailsModal({ mijoz, onClose, onTolovOchish, onMijozYangilandi }: MijozDetailsModalProps) {
  const [tarix, setTarix] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  
  // Tahrirlash holati
  const [tahrirlashRejimi, setTahrirlashRejimi] = useState(false);
  const [tahrirNom, setTahrirNom] = useState(mijoz?.nom || "");
  const [tahrirTelefon, setTahrirTelefon] = useState(mijoz?.telefon || "");
  const [tahrirTelegram, setTahrirTelegram] = useState(mijoz?.telegram || "");
  const [tahrirManzil, setTahrirManzil] = useState(mijoz?.manzil || "");
  const [tahrirIzoh, setTahrirIzoh] = useState(mijoz?.izoh || "");
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [tahrirXato, setTahrirXato] = useState("");

  // Qarz eslatmasi yuborish holati
  const [eslatmaOchiq, setEslatmaOchiq] = useState(false);
  const [eslatmaMatn, setEslatmaMatn] = useState("");

  // O'chirish holati
  const [ochirishTasdiq, setOchirishTasdiq] = useState(false);
  const [ochirilmoqda, setOchirilmoqda] = useState(false);
  const [ochirishXato, setOchirishXato] = useState("");

  useEffect(() => {
    if (mijoz?.id) {
      yuklaMijozTarixi();
      setTahrirNom(mijoz.nom || "");
      setTahrirTelefon(mijoz.telefon || "");
      setTahrirTelegram(mijoz.telegram || "");
      setTahrirManzil(mijoz.manzil || "");
      setTahrirIzoh(mijoz.izoh || "");
      setEslatmaMatn(standartEslatmaMatni(mijoz));
    }
  }, [mijoz]);

  async function yuklaMijozTarixi() {
    setYuklanmoqda(true);
    try {
      // 1. Oxirgi savdolar
      const { data: savdolar } = await supabase
        .from("savdolar")
        .select("id, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, izoh")
        .eq("mijoz_id", mijoz.id)
        .order("sana_vaqt", { ascending: false })
        .limit(10);

      // 2. Oxirgi qarz to'lovlari
      const { data: tolovlar } = await supabase
        .from("qarz_tolovlari")
        .select("id, sana_vaqt, valyuta, summa, tolov_turi, izoh")
        .eq("mijoz_id", mijoz.id)
        .order("sana_vaqt", { ascending: false })
        .limit(10);

      const birlashgan: any[] = [];
      if (savdolar) {
        savdolar.forEach((s) => {
          birlashgan.push({
            id: s.id,
            tur: "savdo",
            sana: s.sana_vaqt,
            summa: s.jami_summa,
            qarz: s.qarz_summa,
            valyuta: s.valyuta,
            izoh: s.izoh,
          });
        });
      }
      if (tolovlar) {
        tolovlar.forEach((t) => {
          birlashgan.push({
            id: t.id,
            tur: "qarz_tolov",
            sana: t.sana_vaqt,
            summa: t.summa,
            valyuta: t.valyuta,
            izoh: t.izoh,
          });
        });
      }

      birlashgan.sort((a, b) => new Date(b.sana).getTime() - new Date(a.sana).getTime());
      setTarix(birlashgan.slice(0, 15));
    } catch (e) {
      console.error(e);
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Mijoz qarz akti va tarixini PDF qilib yuklab olish
  const [pdfYuklanmoqda, setPdfYuklanmoqda] = useState(false);

  async function exportQarzPdf() {
    setPdfYuklanmoqda(true);
    haptic("medium");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = (autoTableModule.default || autoTableModule) as any;

      // Mijozning barcha savdo va to'lovlarini to'liq yuklash
      const [{ data: barchaSavdolar }, { data: barchaTolovlar }] = await Promise.all([
        supabase
          .from("savdolar")
          .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, izoh")
          .eq("mijoz_id", mijoz.id)
          .neq("holat", "bekor_qilindi")
          .order("sana_vaqt", { ascending: true }),
        supabase
          .from("qarz_tolovlari")
          .select("id, sana_vaqt, valyuta, summa, tolov_turi, izoh")
          .eq("mijoz_id", mijoz.id)
          .order("sana_vaqt", { ascending: true }),
      ]);

      const hodisalar: any[] = [];
      let jamiSavdoUzs = 0;
      let jamiSavdoUsd = 0;

      if (barchaSavdolar) {
        barchaSavdolar.forEach((s) => {
          const jami = Number(s.jami_summa || 0);
          const tolandi = Number(s.tolangan_summa || 0);
          const qarz = Number(s.qarz_summa || 0);
          if (s.valyuta === "USD") {
            jamiSavdoUsd += jami;
          } else {
            jamiSavdoUzs += jami;
          }
          hodisalar.push({
            sana: s.sana_vaqt,
            turi: "Savdo",
            tafsilot: `Savdo #${s.raqam || ""}${s.izoh ? ` (${s.izoh})` : ""}`,
            valyuta: s.valyuta || "UZS",
            berilganQarz: qarz,
            tolanganQarz: tolandi,
          });
        });
      }

      if (barchaTolovlar) {
        barchaTolovlar.forEach((t) => {
          const summa = Number(t.summa || 0);
          hodisalar.push({
            sana: t.sana_vaqt,
            turi: "Qarz to'lovi",
            tafsilot: `Qarz to'landi (${t.tolov_turi || "naqd"})${t.izoh ? ` - ${t.izoh}` : ""}`,
            valyuta: t.valyuta || "UZS",
            berilganQarz: 0,
            tolanganQarz: summa,
          });
        });
      }

      hodisalar.sort((a, b) => new Date(a.sana).getTime() - new Date(b.sana).getTime());

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Sarlavha
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 210, 26, "F");

      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text("PROMAX STORE - MIJOZ QARZ HISOBOTI (AKT-SVERKA)", 14, 12);

      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      const hozirgiVaqt = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      doc.text(`Chop etilgan vaqt: ${hozirgiVaqt}`, 14, 20);

      // Mijoz kartasi
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 31, 182, 32, 2, 2, "F");
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 31, 182, 32, 2, 2, "S");

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`Mijoz: ${mijoz.nom || "Noma'lum"}`, 18, 38);

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Telefon: ${mijoz.telefon || "Kiritilmagan"}`, 18, 45);
      doc.text(`Telegram: ${mijoz.telegram || "Mavjud emas"}`, 18, 51);
      doc.text(`Manzil: ${mijoz.manzil || "Ko'rsatilmagan"}`, 18, 57);

      const qarzUzs = Number(mijoz.qarz_uzs || 0);
      const qarzUsd = Number(mijoz.qarz_usd || 0);

      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("JORIY QARZ BALANSI:", 120, 38);

      doc.setFontSize(11);
      doc.setTextColor(185, 28, 28);
      doc.text(`UZS: ${pul(qarzUzs)} so'm`, 120, 46);
      doc.text(`USD: $${pul(qarzUsd)}`, 120, 54);

      // Jadval
      const tableRows = hodisalar.map((h, idx) => {
        const sanaFormatted = new Date(h.sana).toLocaleDateString("ru-RU") + " " + new Date(h.sana).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        return [
          String(idx + 1),
          sanaFormatted,
          h.turi,
          h.tafsilot,
          h.valyuta,
          h.berilganQarz > 0 ? `${pul(h.berilganQarz)}` : "-",
          h.tolanganQarz > 0 ? `${pul(h.tolanganQarz)}` : "-",
        ];
      });

      tableRows.push([
        "",
        "JAMI:",
        `${hodisalar.length} ta amal`,
        `Jami savdolar: ${pul(jamiSavdoUzs)} UZS | $${pul(jamiSavdoUsd)}`,
        "",
        "Qolgan qarz:",
        `${pul(qarzUzs)} UZS / $${pul(qarzUsd)}`,
      ]);

      autoTable(doc, {
        startY: 68,
        head: [["No", "Sana / Vaqt", "Amal turi", "Tafsilot / Izoh", "Valyuta", "Qarzga berildi (+)", "Qaytarildi (-)"]],
        body: tableRows,
        theme: "grid",
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 7.5,
          halign: "center",
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: [30, 41, 59],
        },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 28 },
          2: { cellWidth: 20, fontStyle: "bold" },
          3: { cellWidth: 58 },
          4: { cellWidth: 14, halign: "center" },
          5: { cellWidth: 27, halign: "right", textColor: [185, 28, 28] },
          6: { cellWidth: 27, halign: "right", textColor: [16, 149, 90] },
        },
        didParseCell: (data: any) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [241, 245, 249];
          }
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      if (finalY < 270) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Ushbu hisobot PROMAX STORE avtomatlashtirilgan tizimi orqali shakllantirildi.", 14, finalY + 12);
        doc.text("Imzo / Muhir: _____________________", 140, finalY + 12);
      }

      const xavfsizNom = (mijoz.nom || "Mijoz").replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
      doc.save(`PROMAX_Qarz_${xavfsizNom}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF hisobot muvaffaqiyatli yuklab olindi!");
      haptic("success");
    } catch (err: any) {
      console.error("PDF yaratishda xatolik:", err);
      toast.error("PDF yaratishda xatolik: " + err.message);
      haptic("error");
    } finally {
      setPdfYuklanmoqda(false);
    }
  }

  // Mijoz ma'lumotlarini saqlash
  async function mijozniSaqlash() {
    if (!tahrirNom.trim()) {
      setTahrirXato("Mijoz ismini kiritish majburiy!");
      return;
    }

    setSaqlanmoqda(true);
    setTahrirXato("");
    haptic("medium");

    try {
      const { error } = await supabase
        .from("mijozlar")
        .update({
          nom: tahrirNom.trim(),
          nom_norm: tahrirNom.trim().toLowerCase(),
          telefon: tahrirTelefon.trim() || null,
          telegram: tahrirTelegram.trim() || null,
          manzil: tahrirManzil.trim() || null,
          izoh: tahrirIzoh.trim() || null,
        })
        .eq("id", mijoz.id);

      if (error) throw error;

      mijoz.nom = tahrirNom.trim();
      mijoz.telefon = tahrirTelefon.trim() || null;
      mijoz.telegram = tahrirTelegram.trim() || null;
      mijoz.manzil = tahrirManzil.trim() || null;
      mijoz.izoh = tahrirIzoh.trim() || null;

      haptic("success");
      toast.success("Mijoz ma'lumotlari yangilandi!");
      setTahrirlashRejimi(false);
      if (onMijozYangilandi) onMijozYangilandi();
    } catch (err: any) {
      haptic("error");
      setTahrirXato("Xatolik: " + err.message);
      toast.error("Xatolik", { description: err.message });
    } finally {
      setSaqlanmoqda(false);
    }
  }

  // Mijozni o'chirish / arxivlash
  async function mijozniOchirish() {
    const qarzUzs = Number(mijoz.qarz_uzs || 0);
    const qarzUsd = Number(mijoz.qarz_usd || 0);

    if (qarzUzs > 0 || qarzUsd > 0) {
      const xatoMatn = `Ushbu mijozning qarzi mavjud (${qarzUzs > 0 ? pul(qarzUzs) + " so'm " : ""}${qarzUsd > 0 ? "$" + pul(qarzUsd) : ""}). Avval qarz to'liq yopilishi shart!`;
      setOchirishXato(xatoMatn);
      toast.error("Mijozni o'chirib bo'lmaydi", { description: xatoMatn });
      haptic("error");
      return;
    }

    setOchirilmoqda(true);
    setOchirishXato("");
    haptic("medium");

    try {
      // Savdolar mavjudligini tekshirish
      const { count } = await supabase
        .from("savdolar")
        .select("*", { count: "exact", head: true })
        .eq("mijoz_id", mijoz.id);

      if (count && count > 0) {
        // Avval savdo qilingan -> Arxivlash (faol = false)
        const { error } = await supabase
          .from("mijozlar")
          .update({ faol: false })
          .eq("id", mijoz.id);

        if (error) throw error;
        toast.success("Mijoz arxivlandi (savdolar tarixi saqlangan holda)");
      } else {
        // Savdo bo'lmagan -> Butunlay o'chirish
        const { error } = await supabase
          .from("mijozlar")
          .delete()
          .eq("id", mijoz.id);

        if (error) throw error;
        toast.success("Mijoz butunlay o'chirildi");
      }

      haptic("success");
      if (onMijozYangilandi) onMijozYangilandi();
      onClose();
    } catch (err: any) {
      haptic("error");
      setOchirishXato("O'chirishda xatolik: " + err.message);
      toast.error("O'chirishda xatolik", { description: err.message });
      setOchirilmoqda(false);
    }
  }

  if (!mijoz) return null;

  const hasDebt = Number(mijoz.qarz_uzs || 0) > 0 || Number(mijoz.qarz_usd || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[88vh] overflow-y-auto border border-transparent dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                {tahrirlashRejimi ? "Mijozni Tahrirlash" : mijoz.nom}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">B2B Mijoz kartochkasi</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!tahrirlashRejimi && (
              <button
                onClick={() => {
                  setTahrirlashRejimi(true);
                  haptic("light");
                }}
                title="Tahrirlash"
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAHRIRLASH FORMASI */}
        {tahrirlashRejimi ? (
          <div className="space-y-3 p-1 animate-fade-in">
            {tahrirXato && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {tahrirXato}
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Mijoz nomi / Do'koni *
              </label>
              <input
                type="text"
                value={tahrirNom}
                onChange={(e) => setTahrirNom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Telefon raqami
              </label>
              <input
                type="tel"
                value={tahrirTelefon}
                onChange={(e) => setTahrirTelefon(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Telegram manzili (@username yoki link)
              </label>
              <input
                type="text"
                value={tahrirTelegram}
                onChange={(e) => setTahrirTelegram(e.target.value)}
                placeholder="@username yoki https://t.me/..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Manzil / Do'kon joylashuvi
              </label>
              <input
                type="text"
                value={tahrirManzil}
                onChange={(e) => setTahrirManzil(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Izoh / Eslatma
              </label>
              <textarea
                value={tahrirIzoh}
                onChange={(e) => setTahrirIzoh(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTahrirlashRejimi(false)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
              >
                Bekor
              </button>
              <button
                type="button"
                onClick={mijozniSaqlash}
                disabled={saqlanmoqda}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {saqlanmoqda ? "Saqlanmoqda..." : "Saqlash"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Aloqa va Manzil */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              {mijoz.telefon && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${mijoz.telefon}`} className="font-bold hover:underline">
                    {mijoz.telefon}
                  </a>
                </div>
              )}
              {mijoz.telegram && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MessageCircle className="w-3.5 h-3.5 text-sky-500" />
                  <a
                    href={getTelegramUrl(mijoz, "")}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>{mijoz.telegram}</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                </div>
              )}
              {mijoz.manzil && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="font-medium">{mijoz.manzil}</span>
                </div>
              )}
              {mijoz.izoh && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-slate-200 dark:border-slate-700">
                  "{mijoz.izoh}"
                </p>
              )}
            </div>

            {/* Qarz Balansi */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block">
                  So'mdagi qarzi
                </span>
                <p className="text-base font-black text-amber-950 dark:text-amber-200 tabular-nums mt-0.5">
                  {pul(mijoz.qarz_uzs || 0)} so'm
                </p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                  Dollardagi qarzi
                </span>
                <p className="text-base font-black text-emerald-950 dark:text-emerald-200 tabular-nums mt-0.5">
                  ${pul(mijoz.qarz_usd || 0)}
                </p>
              </div>
            </div>

            {/* Qarz Amallari: To'lov qabul qilish, Eslatma va PDF Hujjat */}
            <div className="space-y-2">
              {hasDebt && (
                <>
                  <button
                    onClick={() => onTolovOchish(mijoz)}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <HandCoins className="w-4 h-4" /> Qarz To'lovini Qabul Qilish
                  </button>

                  <button
                    onClick={() => {
                      setEslatmaMatn(standartEslatmaMatni(mijoz));
                      setEslatmaOchiq(true);
                      haptic("light");
                    }}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <Send className="w-4 h-4" /> 📩 Qarz Eslatmasini Yuborish (Telegram)
                  </button>
                </>
              )}

              <button
                onClick={exportQarzPdf}
                disabled={pdfYuklanmoqda}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              >
                {pdfYuklanmoqda ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>{pdfYuklanmoqda ? "PDF tayyorlanmoqda..." : "📄 Qarz Tarixi va Akt-Sverka (PDF)"}</span>
              </button>
            </div>

            {/* O'chirish ogohlantirish / xatoligi */}
            {ochirishXato && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>{ochirishXato}</p>
              </div>
            )}

            {/* O'chirishni tasdiqlash */}
            {ochirishTasdiq && (
              <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 p-3 rounded-2xl space-y-2 text-xs animate-fade-in">
                <p className="font-bold text-rose-900 dark:text-rose-200">
                  Haqiqatan ham ushbu mijozni o'chirmoqchimisiz?
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Agar bu mijoz bilan avval savdo qilingan bo'lsa, hisobotlar buzilmasligi uchun u arxivlanadi.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setOchirishTasdiq(false)}
                    disabled={ochirilmoqda}
                    className="flex-1 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
                  >
                    Bekor
                  </button>
                  <button
                    onClick={mijozniOchirish}
                    disabled={ochirilmoqda}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center justify-center gap-1"
                  >
                    {ochirilmoqda ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>{ochirilmoqda ? "Bajarilmoqda..." : "Tasdiqlayman"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Savdolar va To'lovlar Tarixi */}
            <div className="space-y-2 pt-1">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" /> Oxirgi Amallar Tarixi
              </h4>

              {yuklanmoqda ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">Tarix yuklanmoqda...</p>
              ) : tarix.length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">Bu mijoz bo'yicha tarix mavjud emas.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {tarix.map((item) => (
                    <div
                      key={item.id + item.tur}
                      className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            item.tur === "savdo"
                              ? "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400"
                              : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {item.tur === "savdo" ? (
                            <ShoppingBag className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white leading-tight">
                            {item.tur === "savdo" ? "Savdo (Qarzga)" : "Qarz to'lovi"}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(item.sana).toLocaleDateString("ru-RU")} ·{" "}
                            {new Date(item.sana).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p
                            className={`font-black tabular-nums ${
                              item.tur === "savdo" ? "text-slate-900 dark:text-white" : "text-emerald-700 dark:text-emerald-400"
                            }`}
                          >
                            {item.tur === "qarz_tolov" ? "−" : ""}
                            {pul(item.summa)} {item.valyuta}
                          </p>
                          {item.tur === "savdo" && item.qarz > 0 && (
                            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              qarz: {pul(item.qarz)}
                            </p>
                          )}
                        </div>
                        <button
                          title="Bekor qilish / O'chirish"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm("Bu amalni bekor qilib o'chirib yubormoqchimisiz?")) return;
                            
                            try {
                              setYuklanmoqda(true);
                              if (item.tur === "qarz_tolov") {
                                const { error } = await supabase.rpc("fn_qarz_tolov_bekor_qilish", { p_tolov_id: item.id, p_xodim: "Admin" });
                                if (error) throw error;
                              } else {
                                const { error } = await supabase.rpc("fn_savdoni_bekor_qilish", { p_savdo_id: item.id, p_xodim: "Admin" });
                                if (error) throw error;
                              }
                              toast.success("Muvaffaqiyatli bekor qilindi");
                              await yuklaMijozTarixi();
                              if (onMijozYangilandi) onMijozYangilandi();
                            } catch (err: any) {
                              toast.error(err.message);
                            } finally {
                              setYuklanmoqda(false);
                            }
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* O'chirish va Yopish tugmalari */}
            {!ochirishTasdiq && (
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOchirishTasdiq(true);
                    setOchirishXato("");
                    haptic("light");
                  }}
                  className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-200 dark:border-rose-900/60"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>O'chirish</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-colors"
                >
                  Yopish
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* QARZ ESLATMASI YUBORISH MODALI */}
      {eslatmaOchiq && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Qarz Eslatmasi</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{mijoz.nom}</p>
                </div>
              </div>
              <button 
                onClick={() => setEslatmaOchiq(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aloqa ma'lumoti holati */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Manzil turi:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {mijoz.telegram ? "Telegram username" : mijoz.telefon ? "Telefon orqali Telegram" : "Aloqa yo'q"}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Manzil:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">
                  {mijoz.telegram || mijoz.telefon || "Mavjud emas"}
                </span>
              </div>
            </div>

            {/* Xabar tahrirlash */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Xabar matni (ixtiyoriy o'zgartirish mumkin):
                </label>
                <button
                  type="button"
                  onClick={() => setEslatmaMatn(standartEslatmaMatni(mijoz))}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                >
                  Standart matn
                </button>
              </div>
              <textarea
                value={eslatmaMatn}
                onChange={(e) => setEslatmaMatn(e.target.value)}
                rows={6}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Tugmalar */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEslatmaOchiq(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  yuborTelegramEslatma(mijoz, eslatmaMatn);
                  setEslatmaOchiq(false);
                }}
                disabled={!mijoz.telegram && !mijoz.telefon}
                className="flex-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram orqali yuborish</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
