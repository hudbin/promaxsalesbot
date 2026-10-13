import React, { useState, useEffect } from "react";
import { 
  X, User, Phone, MapPin, HandCoins, History, ArrowDownLeft, 
  ShoppingBag, Edit2, Trash2, Check, AlertTriangle, Loader2,
  Send, MessageCircle, ExternalLink, FileText
} from "lucide-react";
import { pul, haptic, supabase, getJoriyXodimNomi, yuborTelegramXabar } from "../lib/supabase";
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

  // O'chirish holati (Mijozni o'chirish)
  const [ochirishTasdiq, setOchirishTasdiq] = useState(false);
  const [ochirilmoqda, setOchirilmoqda] = useState(false);
  const [ochirishXato, setOchirishXato] = useState("");

  // Tarix filtri va alohida amalni (savdo / qarz to'lovi) o'chirish holati
  const [tarixFilter, setTarixFilter] = useState<"barchasi" | "savdo" | "qarz_tolov">("barchasi");
  const [amalOchirishId, setAmalOchirishId] = useState<string | null>(null);
  const [amalOchirilmoqda, setAmalOchirilmoqda] = useState(false);

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
      // Mijozning yangilangan qarz balansini ham olish
      const { data: yangiMijoz } = await supabase
        .from("mijozlar")
        .select("qarz_uzs, qarz_usd")
        .eq("id", mijoz.id)
        .maybeSingle();

      if (yangiMijoz) {
        mijoz.qarz_uzs = yangiMijoz.qarz_uzs;
        mijoz.qarz_usd = yangiMijoz.qarz_usd;
      }

      // 1. Oxirgi savdolar (bekor qilinmaganlari va ichidagi tovar qatorlari bilan)
      const { data: savdolar } = await supabase
        .from("savdolar")
        .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, izoh, holat, qatorlar:savdo_qatorlari(id, tovar_id, tovar_nomi, soni, narx, summa)")
        .eq("mijoz_id", mijoz.id)
        .neq("holat", "bekor_qilindi")
        .order("sana_vaqt", { ascending: false })
        .limit(30);

      // 2. Oxirgi qarz to'lovlari
      const { data: tolovlar } = await supabase
        .from("qarz_tolovlari")
        .select("id, sana_vaqt, valyuta, summa, tolov_turi, izoh")
        .eq("mijoz_id", mijoz.id)
        .order("sana_vaqt", { ascending: false })
        .limit(30);

      const birlashgan: any[] = [];
      if (savdolar) {
        savdolar.forEach((s) => {
          birlashgan.push({
            id: s.id,
            tur: "savdo",
            raqam: s.raqam,
            sana: s.sana_vaqt,
            summa: Number(s.jami_summa || 0),
            tolangan: Number(s.tolangan_summa || 0),
            qarz: Number(s.qarz_summa || 0),
            valyuta: s.valyuta || "UZS",
            tolov_turi: s.tolov_turi,
            izoh: s.izoh,
            qatorlar: s.qatorlar || [],
          });
        });
      }
      if (tolovlar) {
        tolovlar.forEach((t) => {
          birlashgan.push({
            id: t.id,
            tur: "qarz_tolov",
            sana: t.sana_vaqt,
            summa: Number(t.summa || 0),
            valyuta: t.valyuta || "UZS",
            tolov_turi: t.tolov_turi,
            izoh: t.izoh,
          });
        });
      }

      birlashgan.sort((a, b) => new Date(b.sana).getTime() - new Date(a.sana).getTime());
      setTarix(birlashgan.slice(0, 40));
    } catch (e) {
      console.error(e);
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Tarixdagi savdo yoki qarz to'lovini bekor qilish / o'chirish
  async function amalniBekorQilish(item: any) {
    setAmalOchirilmoqda(true);
    haptic("medium");
    const xodimNom = getJoriyXodimNomi();
    const sanaStr =
      new Date(item.sana).toLocaleDateString("ru-RU") +
      " " +
      new Date(item.sana).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    try {
      if (item.tur === "qarz_tolov") {
        const { error: rpcErr } = await supabase.rpc("fn_qarz_tolov_bekor_qilish", {
          p_tolov_id: item.id,
          p_xodim: xodimNom,
        });

        // Agar bazada RPC funksiya o'rnatilmagan yoki xato bergan bo'lsa, xavfsiz fallback
        if (rpcErr) {
          await supabase
            .from("kassa_harakatlari")
            .delete()
            .eq("manba_turi", "qarz_tolov")
            .eq("manba_id", item.id);

          const { data: mData } = await supabase
            .from("mijozlar")
            .select("qarz_uzs, qarz_usd")
            .eq("id", mijoz.id)
            .single();

          if (mData) {
            if (item.valyuta === "USD") {
              await supabase
                .from("mijozlar")
                .update({ qarz_usd: Number(mData.qarz_usd || 0) + Number(item.summa || 0) })
                .eq("id", mijoz.id);
            } else {
              await supabase
                .from("mijozlar")
                .update({ qarz_uzs: Number(mData.qarz_uzs || 0) + Number(item.summa || 0) })
                .eq("id", mijoz.id);
            }
          }

          const { error: delErr } = await supabase
            .from("qarz_tolovlari")
            .delete()
            .eq("id", item.id);
          if (delErr) throw delErr;
        }
        toast.success("Qarz to'lovi bekor qilindi va o'chirildi");

        await yuklaMijozTarixi();

        // Telegram guruh va botga xabar yuborish
        const yangiQarz =
          item.valyuta === "USD" ? `$${pul(mijoz.qarz_usd)}` : `${pul(mijoz.qarz_uzs)} UZS`;
        const xabarMatn =
          `🗑 <b>QARZ TO'LOVI BEKOR QILINDI (O'CHIRILDI)</b>\n\n` +
          `👤 Mijoz: <b>${mijoz.nom}</b>\n` +
          `💵 Bekor qilingan to'lov: <b>${pul(item.summa)} ${item.valyuta}</b>\n` +
          `📅 Amal sanasi: <code>${sanaStr}</code>\n` +
          (item.izoh ? `💬 Izoh: <i>${item.izoh}</i>\n` : "") +
          `📈 Mijozning yangilangan qarzi: <b>${yangiQarz}</b>\n` +
          `✍️ O'chirdi: <b>${xodimNom}</b>`;
        yuborTelegramXabar(xabarMatn);
      } else {
        const { error: rpcErr } = await supabase.rpc("fn_savdoni_bekor_qilish", {
          p_savdo_id: item.id,
          p_xodim: xodimNom,
        });

        // Agar bazada RPC funksiya o'rnatilmagan yoki eski versiya bo'lsa, xavfsiz fallback
        if (rpcErr) {
          // 1. Tovarlar qoldig'ini omborga qaytarish
          const qatorlar = item.qatorlar || [];
          for (const q of qatorlar) {
            if (q.tovar_id && Number(q.soni) > 0) {
              const { data: tData } = await supabase
                .from("tovarlar")
                .select("qoldiq")
                .eq("id", q.tovar_id)
                .maybeSingle();
              if (tData) {
                await supabase
                  .from("tovarlar")
                  .update({ qoldiq: Number(tData.qoldiq || 0) + Number(q.soni) })
                  .eq("id", q.tovar_id);
              }
            }
          }

          // 2. Mijoz qarzini kamaytirish
          if (Number(item.qarz) > 0) {
            const { data: mData } = await supabase
              .from("mijozlar")
              .select("qarz_uzs, qarz_usd")
              .eq("id", mijoz.id)
              .single();

            if (mData) {
              if (item.valyuta === "USD") {
                await supabase
                  .from("mijozlar")
                  .update({ qarz_usd: Math.max(0, Number(mData.qarz_usd || 0) - Number(item.qarz)) })
                  .eq("id", mijoz.id);
              } else {
                await supabase
                  .from("mijozlar")
                  .update({ qarz_uzs: Math.max(0, Number(mData.qarz_uzs || 0) - Number(item.qarz)) })
                  .eq("id", mijoz.id);
              }
            }
          }

          // 3. Kassa harakatini o'chirish
          await supabase
            .from("kassa_harakatlari")
            .delete()
            .eq("manba_turi", "savdo")
            .eq("manba_id", item.id);

          // 4. Savdo holatini bekor_qilindi ga o'zgartirish
          const { error: updErr } = await supabase
            .from("savdolar")
            .update({
              holat: "bekor_qilindi",
              izoh: (item.izoh ? item.izoh + " " : "") + `(BEKOR QILINDI: ${xodimNom})`,
            })
            .eq("id", item.id);
          if (updErr) throw updErr;
        }
        toast.success("Savdo bekor qilindi va o'chirildi");

        await yuklaMijozTarixi();

        // Telegram guruh va botga xabar yuborish
        let tovarlarText = "";
        if (Array.isArray(item.qatorlar) && item.qatorlar.length > 0) {
          tovarlarText =
            `📦 Omborga qaytarilgan tovarlar:\n` +
            item.qatorlar
              .map((q: any) => `  • <b>${q.tovar_nomi}</b>: ${q.soni} × ${pul(q.narx)} = ${pul(q.summa)} ${item.valyuta}`)
              .join("\n") +
            `\n`;
        }
        const yangiQarz =
          item.valyuta === "USD" ? `$${pul(mijoz.qarz_usd)}` : `${pul(mijoz.qarz_uzs)} UZS`;
        const xabarMatn =
          `🗑 <b>SAVDO BEKOR QILINDI (O'CHIRILDI)</b>\n\n` +
          `👤 Mijoz: <b>${mijoz.nom}</b>\n` +
          (item.raqam ? `🧾 Chek raqami: <b>#${item.raqam}</b>\n` : "") +
          `📅 Savdo sanasi: <code>${sanaStr}</code>\n` +
          tovarlarText +
          `💰 Jami savdo: <b>${pul(item.summa)} ${item.valyuta}</b>\n` +
          (item.tolangan > 0 ? `💵 Bekor qilingan to'lov: <b>${pul(item.tolangan)} ${item.valyuta}</b>\n` : "") +
          (item.qarz > 0 ? `📉 Ayirilgan qarz: <b>−${pul(item.qarz)} ${item.valyuta}</b>\n` : "") +
          `📊 Mijozning qolgan qarzi: <b>${yangiQarz}</b>\n` +
          `✍️ O'chirdi: <b>${xodimNom}</b>`;
        yuborTelegramXabar(xabarMatn);
      }

      haptic("success");
      setAmalOchirishId(null);
      if (onMijozYangilandi) onMijozYangilandi();
    } catch (err: any) {
      haptic("error");
      toast.error("Xatolik: " + err.message);
    } finally {
      setAmalOchirilmoqda(false);
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
          .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, izoh, qatorlar:savdo_qatorlari(tovar_nomi, soni, narx, summa)")
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
        barchaSavdolar.forEach((s: any) => {
          const jami = Number(s.jami_summa || 0);
          const tolandi = Number(s.tolangan_summa || 0);
          const qarz = Number(s.qarz_summa || 0);
          const val = s.valyuta || "UZS";
          if (val === "USD") {
            jamiSavdoUsd += jami;
          } else {
            jamiSavdoUzs += jami;
          }
          const qatorMatn =
            Array.isArray(s.qatorlar) && s.qatorlar.length > 0
              ? s.qatorlar
                  .map((q: any) => {
                    const qSoni = Number(q.soni || 1);
                    const qNarx = Number(q.narx || 0);
                    const qSum = Number(q.summa || qSoni * qNarx);
                    return `${q.tovar_nomi}: ${qSoni} dona x ${pul(qNarx)} = ${pul(qSum)} ${val}`;
                  })
                  .join("; ")
              : "";
          hodisalar.push({
            sana: s.sana_vaqt,
            turi: "Savdo",
            tafsilot: `Savdo #${s.raqam || ""}${qatorMatn ? ` — ${qatorMatn}` : ""}${s.izoh ? ` (${s.izoh})` : ""}`,
            valyuta: val,
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
    const xodimNom = getJoriyXodimNomi();

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

      yuborTelegramXabar(
        `🗑 <b>MIJOZ O'CHIRILDI / ARXIVLANDI</b>\n\n` +
        `👤 Mijoz: <b>${mijoz.nom}</b>\n` +
        (mijoz.telefon ? `📞 Tel: <code>${mijoz.telefon}</code>\n` : "") +
        `✍️ O'chirdi: <b>${xodimNom}</b>`
      );

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
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-400" /> Savdolar va To'lovlar Tarixi
                </h4>
                <span className="text-[10px] font-semibold text-slate-400">
                  {tarix.length} ta yozuv
                </span>
              </div>

              {/* Filtr tugmalari: Barchasi / Savdolar / To'lovlar */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-800">
                {[
                  { id: "barchasi", label: "Barchasi", count: tarix.length },
                  { id: "savdo", label: "Savdolar", count: tarix.filter((x) => x.tur === "savdo").length },
                  { id: "qarz_tolov", label: "To'lovlar", count: tarix.filter((x) => x.tur === "qarz_tolov").length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTarixFilter(tab.id as any);
                      setAmalOchirishId(null);
                      haptic("light");
                    }}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-all ${
                      tarixFilter === tab.id
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {yuklanmoqda ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">Tarix yuklanmoqda...</p>
              ) : tarix.filter((item) => tarixFilter === "barchasi" || item.tur === tarixFilter).length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">
                  {tarixFilter === "savdo"
                    ? "Bu mijoz bo'yicha savdolar topilmadi."
                    : tarixFilter === "qarz_tolov"
                    ? "Bu mijoz bo'yicha qarz to'lovlari topilmadi."
                    : "Bu mijoz bo'yicha tarix mavjud emas."}
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                  {tarix
                    .filter((item) => tarixFilter === "barchasi" || item.tur === tarixFilter)
                    .map((item) => {
                      const itemKey = item.id + item.tur;
                      const isConfirming = amalOchirishId === itemKey;

                      return (
                        <div
                          key={itemKey}
                          className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
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
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-slate-900 dark:text-white leading-tight">
                                    {item.tur === "savdo"
                                      ? `Savdo ${item.raqam ? `#${item.raqam}` : ""}`
                                      : "Qarz to'lovi"}
                                  </p>
                                  {item.tur === "savdo" && (
                                    <span
                                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                                        item.qarz > 0 && item.tolangan > 0
                                          ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300"
                                          : item.qarz > 0
                                          ? "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300"
                                          : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300"
                                      }`}
                                    >
                                      {item.qarz > 0 && item.tolangan > 0
                                        ? "Qisman qarz"
                                        : item.qarz > 0
                                        ? "Qarzga"
                                        : "To'langan"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(item.sana).toLocaleDateString("ru-RU")} ·{" "}
                                  {new Date(item.sana).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {item.tolov_turi ? ` · ${item.tolov_turi}` : ""}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <p
                                  className={`font-black tabular-nums ${
                                    item.tur === "savdo"
                                      ? "text-slate-900 dark:text-white"
                                      : "text-emerald-700 dark:text-emerald-400"
                                  }`}
                                >
                                  {item.tur === "qarz_tolov" ? "−" : ""}
                                  {pul(item.summa)} {item.valyuta}
                                </p>
                                {item.tur === "savdo" && item.tolangan > 0 && item.qarz > 0 && (
                                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                    to'landi: {pul(item.tolangan)}
                                  </p>
                                )}
                                {item.tur === "savdo" && item.qarz > 0 && (
                                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                                    qarz: +{pul(item.qarz)}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                title="Bekor qilish / O'chirish"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  haptic("light");
                                  setAmalOchirishId(isConfirming ? null : itemKey);
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isConfirming
                                    ? "text-rose-600 bg-rose-100 dark:bg-rose-900/50"
                                    : "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Savdo ichidagi tovarlar ro'yxati */}
                          {item.tur === "savdo" && Array.isArray(item.qatorlar) && item.qatorlar.length > 0 && (
                            <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 rounded-lg px-2.5 py-1.5 space-y-1">
                              {item.qatorlar.map((q: any, idx: number) => (
                                <div key={q.id || idx} className="flex justify-between items-center text-[11px]">
                                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate pr-2">
                                    • {q.tovar_nomi}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400 font-semibold tabular-nums flex-shrink-0">
                                    {q.soni} × {pul(q.narx)} = <b className="text-slate-800 dark:text-slate-200">{pul(q.summa)}</b>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Izoh (agar bo'lsa) */}
                          {item.izoh && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic px-1">
                              Izoh: "{item.izoh}"
                            </p>
                          )}

                          {/* O'chirishni tasdiqlash qatori (Savdo uchun ham, Qarz to'lovi uchun ham bir xil) */}
                          {isConfirming && (
                            <div className="pt-1.5 border-t border-rose-200/70 dark:border-rose-900/50 flex items-center justify-between gap-2 animate-fade-in">
                              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                                {item.tur === "savdo"
                                  ? "Savdoni bekor qilib o'chirasizmi? (Tovar omborga qaytadi, qarz kamayadi)"
                                  : "To'lovni bekor qilib o'chirasizmi? (Qarz qayta tiklanadi)"}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  disabled={amalOchirilmoqda}
                                  onClick={() => setAmalOchirishId(null)}
                                  className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-[11px]"
                                >
                                  Yo'q
                                </button>
                                <button
                                  type="button"
                                  disabled={amalOchirilmoqda}
                                  onClick={() => amalniBekorQilish(item)}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1"
                                >
                                  {amalOchirilmoqda ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  <span>O'chirish</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
