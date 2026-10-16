import { getSupabase, tgPost, pul, TELEGRAM_API } from "./config";

// -----------------------------------------------------------------------------
// QARZDORLAR RO'YXATINI AVTOMATIK PDF HUJJAT QILIB YUBORISH
// -----------------------------------------------------------------------------
export async function sendQarzdorlarPdf(chatId: number | string): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    const { data: qarzdorlar, error } = await client
      .from("mijozlar")
      .select("nom, qarz_uzs, qarz_usd, telefon, telegram")
      .eq("faol", true)
      .or("qarz_uzs.gt.0,qarz_usd.gt.0")
      .order("qarz_uzs", { ascending: false });

    if (error) throw error;
    if (!qarzdorlar || qarzdorlar.length === 0) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "✅ <b>Qarzdor mijozlar mavjud emas!</b> Barcha qarzlar to'liq yopilgan.",
        parse_mode: "HTML",
      });
      return { ok: true, count: 0 };
    }

    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Sarlavha
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("PROMAX B2B STORE - QARZDORLAR RO'YXATI", 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const sanaStr = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    doc.text(`Holat: ${sanaStr} | Jami qarzdorlar: ${qarzdorlar.length} ta`, 14, 25);

    let jamiUzs = 0;
    let jamiUsd = 0;

    const rows = qarzdorlar.map((m: any, idx: number) => {
      const uzs = Number(m.qarz_uzs || 0);
      const usd = Number(m.qarz_usd || 0);
      jamiUzs += uzs;
      jamiUsd += usd;

      return [
        String(idx + 1),
        m.nom || "-",
        uzs > 0 ? `${pul(uzs)} so'm` : "-",
        usd > 0 ? `$${pul(usd)}` : "-",
        m.telefon || "-",
        m.telegram || "-",
      ];
    });

    // Jami qatorini qo'shish
    rows.push([
      "",
      "JAMI UMUMIY QARZ:",
      `${pul(jamiUzs)} so'm`,
      `$${pul(jamiUsd)}`,
      "",
      "",
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["No", "Mijoz Nomi", "Qarzi (UZS)", "Qarzi (USD)", "Telefon Raqami", "Telegram"]],
      body: rows,
      theme: "striped",
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 48, fontStyle: "bold" },
        2: { cellWidth: 32, halign: "right" },
        3: { cellWidth: 24, halign: "right" },
        4: { cellWidth: 36 },
        5: { cellWidth: 38 },
      },
      didParseCell: (data: any) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `PROMAX_Qarzdorlar_${new Date().toISOString().slice(0, 10)}.pdf`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📄 <b>PROMAX STORE — QARZDORLAR RO'YXATI (PDF)</b>\n\n` +
      `👥 Qarzdorlar soni: <b>${qarzdorlar.length} ta</b>\n` +
      `💵 Jami so'm: <b>${pul(jamiUzs)} so'm</b>\n` +
      `💲 Jami dollar: <b>$${pul(jamiUsd)}</b>\n\n` +
      `📅 <i>${sanaStr} holatiga</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    if (!resData.ok) {
      console.error("sendDocument xatosi:", resData);
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `❌ <b>PDF yuborishda xatolik:</b>\n<code>${resData.description || "Noma'lum"}</code>`,
        parse_mode: "HTML",
      });
    }
    return { ok: resData.ok, count: qarzdorlar.length, error: resData.description };
  } catch (err: any) {
    console.error("sendQarzdorlarPdf xatosi:", err);
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>PDF yaratishda xatolik:</b>\n<code>${err.message}</code>`,
      parse_mode: "HTML",
    });
    return { ok: false, error: err?.message };
  }
}

// -----------------------------------------------------------------------------
// BITTA QARZDOR MIJOZNING TO'LIQ QARZ VA TO'LOVLAR TARIXI (AKT-SVERKA) PDF HUJJATI
// -----------------------------------------------------------------------------
export async function sendMijozQarzPdf(
  chatId: number | string,
  mijozIdOrNom: string,
  boshSana?: string | null,
  tugashSana?: string | null
): Promise<{ ok: boolean; mijoz?: any; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    // 1. Mijozni aniqlash
    let mijoz: any = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mijozIdOrNom.trim());
    
    if (isUuid) {
      const { data } = await client.from("mijozlar").select("*").eq("id", mijozIdOrNom.trim()).maybeSingle();
      mijoz = data;
    } else {
      const { data: topilganlar } = await client.rpc("fn_ai_mijoz_qidirish", {
        qidiruv_sozi: mijozIdOrNom.trim(),
      });
      if (topilganlar && topilganlar.length > 0) {
        const { data } = await client.from("mijozlar").select("*").eq("id", topilganlar[0].id).maybeSingle();
        mijoz = data;
      }
    }

    if (!mijoz) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>Mijoz topilmadi:</b> <i>"${mijozIdOrNom}"</i> bo'yicha ma'lumot topilmadi.`,
        parse_mode: "HTML",
      });
      return { ok: false, error: "Mijoz topilmadi" };
    }

    // Sanalarni normalizatsiya qilish va ISO formatga keltirish
    let boshSanaIso: string | null = null;
    let tugashSanaIso: string | null = null;
    let davrMatni = "";

    if (boshSana && String(boshSana).trim()) {
      const s = String(boshSana).trim();
      boshSanaIso = s.length === 10 ? `${s}T00:00:00.000+05:00` : new Date(s).toISOString();
    }
    if (tugashSana && String(tugashSana).trim()) {
      const s = String(tugashSana).trim();
      tugashSanaIso = s.length === 10 ? `${s}T23:59:59.999+05:00` : new Date(s).toISOString();
    }

    if (boshSanaIso && tugashSanaIso) {
      davrMatni = `${new Date(boshSanaIso).toLocaleDateString("ru-RU")} — ${new Date(tugashSanaIso).toLocaleDateString("ru-RU")}`;
    } else if (tugashSanaIso) {
      davrMatni = `${new Date(tugashSanaIso).toLocaleDateString("ru-RU")} gacha`;
    } else if (boshSanaIso) {
      davrMatni = `${new Date(boshSanaIso).toLocaleDateString("ru-RU")} dan boshlab`;
    }

    let boshlangichQarzUzs = 0;
    let boshlangichQarzUsd = 0;
    let oxirgiQarzUzs = Number(mijoz.qarz_uzs || 0);
    let oxirgiQarzUsd = Number(mijoz.qarz_usd || 0);

    // 2. Savdolar, to'lovlar va vozvratlar tarixini yuklash
    let savdoQuery = client
      .from("savdolar")
      .select("id, raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, izoh, holat, qatorlar:savdo_qatorlari(tovar_nomi, soni, narx, summa)")
      .eq("mijoz_id", mijoz.id)
      .neq("holat", "bekor_qilindi")
      .order("sana_vaqt", { ascending: true });

    let tolovQuery = client
      .from("qarz_tolovlari")
      .select("id, sana_vaqt, valyuta, summa, tolov_turi, izoh")
      .eq("mijoz_id", mijoz.id)
      .order("sana_vaqt", { ascending: true });

    let vozvratQuery = client
      .from("tovar_qaytarishlar")
      .select("id, raqam, sana_vaqt, valyuta, jami_summa, qarzdan_ayirildi, naqd_qaytarildi, izoh, holat, qatorlar:tovar_qaytarish_qatorlari(tovar_nomi, soni, narx, summa)")
      .eq("mijoz_id", mijoz.id)
      .neq("holat", "bekor_qilindi")
      .order("sana_vaqt", { ascending: true });

    if (boshSanaIso) {
      savdoQuery = savdoQuery.gte("sana_vaqt", boshSanaIso);
      tolovQuery = tolovQuery.gte("sana_vaqt", boshSanaIso);
      vozvratQuery = vozvratQuery.gte("sana_vaqt", boshSanaIso);
    }
    if (tugashSanaIso) {
      savdoQuery = savdoQuery.lte("sana_vaqt", tugashSanaIso);
      tolovQuery = tolovQuery.lte("sana_vaqt", tugashSanaIso);
      vozvratQuery = vozvratQuery.lte("sana_vaqt", tugashSanaIso);
    }

    const [{ data: savdolar }, { data: tolovlar }, { data: vozvratlar }] = await Promise.all([
      savdoQuery,
      tolovQuery,
      vozvratQuery,
    ]);

    // Reverse calculation (agar tugashSanaIso berilgan bo'lsa)
    if (tugashSanaIso) {
      const [{ data: keyingiSavdolar }, { data: keyingiTolovlar }, { data: keyingiVozvratlar }] = await Promise.all([
        client.from("savdolar").select("valyuta, qarz_summa").eq("mijoz_id", mijoz.id).gt("sana_vaqt", tugashSanaIso).neq("holat", "bekor_qilindi"),
        client.from("qarz_tolovlari").select("valyuta, summa").eq("mijoz_id", mijoz.id).gt("sana_vaqt", tugashSanaIso),
        client.from("tovar_qaytarishlar").select("valyuta, qarzdan_ayirildi").eq("mijoz_id", mijoz.id).gt("sana_vaqt", tugashSanaIso).neq("holat", "bekor_qilindi"),
      ]);
      let kSavdoUzs = 0, kSavdoUsd = 0, kTolovUzs = 0, kTolovUsd = 0, kVozvratUzs = 0, kVozvratUsd = 0;
      (keyingiSavdolar || []).forEach((s: any) => {
        if (s.valyuta === "USD") kSavdoUsd += Number(s.qarz_summa || 0);
        else kSavdoUzs += Number(s.qarz_summa || 0);
      });
      (keyingiTolovlar || []).forEach((t: any) => {
        if (t.valyuta === "USD") kTolovUsd += Number(t.summa || 0);
        else kTolovUzs += Number(t.summa || 0);
      });
      (keyingiVozvratlar || []).forEach((v: any) => {
        if (v.valyuta === "USD") kVozvratUsd += Number(v.qarzdan_ayirildi || 0);
        else kVozvratUzs += Number(v.qarzdan_ayirildi || 0);
      });
      oxirgiQarzUzs = Math.max(0, Number(mijoz.qarz_uzs || 0) - kSavdoUzs + kTolovUzs + kVozvratUzs);
      oxirgiQarzUsd = Math.max(0, Number(mijoz.qarz_usd || 0) - kSavdoUsd + kTolovUsd + kVozvratUsd);
    }

    // Tarix qatorlarini birlashtirish
    const hodisalar: any[] = [];
    let jamiSavdoUzs = 0;
    let jamiSavdoUsd = 0;
    let jamiTolandiUzs = 0;
    let jamiTolandiUsd = 0;
    let davrdagiQarzSavdoUzs = 0;
    let davrdagiQarzSavdoUsd = 0;

    let jamiVozvratUzs = 0;
    let jamiVozvratUsd = 0;
    let jamiVozvratQarzUzs = 0;
    let jamiVozvratQarzUsd = 0;

    if (savdolar) {
      savdolar.forEach((s: any) => {
        const jami = Number(s.jami_summa || 0);
        const tolandi = Number(s.tolangan_summa || 0);
        const qarz = Number(s.qarz_summa || 0);
        const val = s.valyuta || "UZS";
        if (val === "USD") {
          jamiSavdoUsd += jami;
          jamiTolandiUsd += tolandi;
          davrdagiQarzSavdoUsd += qarz;
        } else {
          jamiSavdoUzs += jami;
          jamiTolandiUzs += tolandi;
          davrdagiQarzSavdoUzs += qarz;
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
          summa: jami,
        });
      });
    }

    if (tolovlar) {
      tolovlar.forEach((t: any) => {
        const summa = Number(t.summa || 0);
        if (t.valyuta === "USD") {
          jamiTolandiUsd += summa;
        } else {
          jamiTolandiUzs += summa;
        }
        hodisalar.push({
          sana: t.sana_vaqt,
          turi: "Qarz to'lovi",
          tafsilot: `Qarz to'landi (${t.tolov_turi || "naqd"})${t.izoh ? ` - ${t.izoh}` : ""}`,
          valyuta: t.valyuta || "UZS",
          berilganQarz: 0,
          tolanganQarz: summa,
          summa: summa,
        });
      });
    }

    if (vozvratlar && vozvratlar.length > 0) {
      vozvratlar.forEach((v: any) => {
        const jami = Number(v.jami_summa || 0);
        const qarzdanAyirildi = Number(v.qarzdan_ayirildi || 0);
        const naqdQaytarildi = Number(v.naqd_qaytarildi || 0);
        const val = v.valyuta || "UZS";

        if (val === "USD") {
          jamiVozvratUsd += jami;
          jamiVozvratQarzUsd += qarzdanAyirildi;
        } else {
          jamiVozvratUzs += jami;
          jamiVozvratQarzUzs += qarzdanAyirildi;
        }

        const qatorMatn =
          Array.isArray(v.qatorlar) && v.qatorlar.length > 0
            ? v.qatorlar
                .map((q: any) => {
                  const qSoni = Number(q.soni || 1);
                  const qNarx = Number(q.narx || 0);
                  const qSum = Number(q.summa || qSoni * qNarx);
                  return `${q.tovar_nomi}: ${qSoni} dona x ${pul(qNarx)} = ${pul(qSum)} ${val}`;
                })
                .join("; ")
            : "";

        const naqdMatn = naqdQaytarildi > 0 ? ` (Naqd berildi: ${pul(naqdQaytarildi)} ${val})` : "";
        const izohMatn = v.izoh ? ` [${v.izoh}]` : "";

        hodisalar.push({
          sana: v.sana_vaqt,
          turi: "Vozvrat",
          tafsilot: `Vozvrat #${v.raqam || ""}${qatorMatn ? ` — ${qatorMatn}` : ""}${naqdMatn}${izohMatn}`,
          valyuta: val,
          berilganQarz: 0,
          tolanganQarz: qarzdanAyirildi, // Qarzdan chegirilgan summa
          summa: jami,
        });
      });
    }

    // Boshlang'ich qarzni aniq hisoblash
    if (boshSanaIso) {
      boshlangichQarzUzs = Math.max(0, oxirgiQarzUzs - davrdagiQarzSavdoUzs + jamiTolandiUzs + jamiVozvratQarzUzs);
      boshlangichQarzUsd = Math.max(0, oxirgiQarzUsd - davrdagiQarzSavdoUsd + jamiTolandiUsd + jamiVozvratQarzUsd);
    }

    // Sanasi bo'yicha tartiblash
    hodisalar.sort((a, b) => new Date(a.sana).getTime() - new Date(b.sana).getTime());

    // 3. jsPDF orqali professional PDF yaratish
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Yuqori shlyapa / Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 26, "F");

    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("PROMAX STORE - MIJOZ QARZ HISOBOTI (AKT-SVERKA)", 14, 12);

    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    const hozirgiVaqt = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (davrMatni) {
      doc.text(`Hisobot davri: ${davrMatni} | Chop etildi: ${hozirgiVaqt}`, 14, 20);
    } else {
      doc.text(`Chop etilgan vaqt: ${hozirgiVaqt}`, 14, 20);
    }

    // Mijoz haqida ma'lumot bloki (Karta ko'rinishida)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 31, 182, 34, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 31, 182, 34, 2, 2, "S");

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Mijoz: ${mijoz.nom || "Noma'lum"}`, 18, 38);

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Telefon: ${mijoz.telefon || "Kiritilmagan"}`, 18, 45);
    doc.text(`Telegram: ${mijoz.telegram || "Mavjud emas"}`, 18, 51);
    doc.text(`Manzil: ${mijoz.manzil || "Ko'rsatilmagan"}`, 18, 57);

    // Qarz bloki (O'ng tarafda)
    if (davrMatni) {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`HISOBOT DAVRI: ${davrMatni}`, 115, 36);

      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Boshlang'ich qarz: ${pul(boshlangichQarzUzs)} UZS`, 115, 41);
      doc.text(`Savdodan qarz: +${pul(davrdagiQarzSavdoUzs)} UZS`, 115, 46);
      doc.text(`To'langan to'lov: -${pul(jamiTolandiUzs)} UZS`, 115, 51);
      if (jamiVozvratQarzUzs > 0) {
        doc.text(`Vozvrat chegirildi: -${pul(jamiVozvratQarzUzs)} UZS`, 115, 56);
      }

      doc.setFontSize(10);
      doc.setTextColor(185, 28, 28); // Qizil
      doc.text(`Davr oxiriga: ${pul(oxirgiQarzUzs)} UZS`, 115, jamiVozvratQarzUzs > 0 ? 62 : 58);
      if (oxirgiQarzUsd > 0) {
        doc.setFontSize(8.5);
        doc.text(`USD qoldiq: $${pul(oxirgiQarzUsd)}`, 115, jamiVozvratQarzUzs > 0 ? 67 : 63);
      }
    } else {
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("JORIY QARZ BALANSI:", 120, 38);

      doc.setFontSize(11);
      doc.setTextColor(185, 28, 28); // Qizil
      doc.text(`UZS: ${pul(oxirgiQarzUzs)} so'm`, 120, 46);
      if (oxirgiQarzUsd > 0) {
        doc.text(`USD: $${pul(oxirgiQarzUsd)}`, 120, 53);
      }
      if (jamiVozvratUzs > 0) {
        doc.setFontSize(8);
        doc.setTextColor(147, 51, 234);
        doc.text(`Jami vozvrat: ${pul(jamiVozvratUzs)} UZS`, 120, oxirgiQarzUsd > 0 ? 60 : 54);
      }
    }

    // Jadval yaratish
    const tableRows: any[] = [];

    // Agar boshlang'ich sana ko'rsatilgan bo'lsa, jadvalning birinchi qatoriga boshlang'ich saldo kiritiladi
    if (boshSanaIso) {
      const sanaBosh = new Date(boshSanaIso).toLocaleDateString("ru-RU");
      tableRows.push([
        "•",
        sanaBosh,
        "Boshlang'ich qoldiq",
        "Hisobot davri boshidagi qarz saldosi",
        "UZS",
        boshlangichQarzUzs > 0 ? pul(boshlangichQarzUzs) : "-",
        "-",
      ]);
    }

    hodisalar.forEach((h, idx) => {
      const sanaFormatted = new Date(h.sana).toLocaleDateString("ru-RU") + " " + new Date(h.sana).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      tableRows.push([
        String(idx + 1),
        sanaFormatted,
        h.turi,
        h.tafsilot,
        h.valyuta,
        h.berilganQarz > 0 ? `${pul(h.berilganQarz)}` : "-",
        h.tolanganQarz > 0 ? `${pul(h.tolanganQarz)}` : "-",
      ]);
    });

    // Jami yig'indi qatori
    const vozvratXulosa = jamiVozvratUzs > 0 ? ` | Vozvrat: ${pul(jamiVozvratUzs)}` : "";
    tableRows.push([
      "",
      davrMatni ? "YAKUNIY SALDO:" : "JAMI:",
      `${hodisalar.length} ta amal`,
      `Savdolar: ${pul(jamiSavdoUzs)} | To'lov: ${pul(jamiTolandiUzs)}${vozvratXulosa} UZS`,
      "",
      davrMatni ? "Davr oxiriga qarz:" : "Qolgan qarz:",
      `${pul(oxirgiQarzUzs)} UZS` + (oxirgiQarzUsd > 0 ? ` / $${pul(oxirgiQarzUsd)}` : ""),
    ]);

    autoTable(doc, {
      startY: 70,
      head: [["No", "Sana / Vaqt", "Amal turi", "Tafsilot / Mahsulotlar", "Valyuta", "Qarzga berildi (+)", "Qaytarildi / Chegirildi (-)"]],
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
        2: { cellWidth: 24, fontStyle: "bold" },
        3: { cellWidth: 54 },
        4: { cellWidth: 14, halign: "center" },
        5: { cellWidth: 27, halign: "right", textColor: [185, 28, 28] },
        6: { cellWidth: 27, halign: "right", textColor: [16, 149, 90] },
      },
      didParseCell: (data: any) => {
        if (data.row.index === tableRows.length - 1 || (boshSanaIso && data.row.index === 0)) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [241, 245, 249];
        } else {
          const turi = data.row.raw?.[2];
          if (data.column.index === 2) {
            if (turi === "Vozvrat") {
              data.cell.styles.textColor = [147, 51, 234]; // Purple
              data.cell.styles.fontStyle = "bold";
            } else if (turi === "Qarz to'lovi") {
              data.cell.styles.textColor = [16, 149, 90]; // Green
              data.cell.styles.fontStyle = "bold";
            }
          }
          if (data.column.index === 6 && turi === "Vozvrat") {
            data.cell.styles.textColor = [147, 51, 234];
          }
        }
      },
    });

    // Pastki izoh / Footer
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    if (finalY < 270) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Ushbu hujjat PROMAX STORE avtomatlashtirilgan tizimi orqali shakllantirildi.", 14, finalY + 12);
      doc.text("Imzo / Muhir: _____________________", 140, finalY + 12);
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const xavfsizNom = (mijoz.nom || "Mijoz").replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
    const davrFaylNom = davrMatni ? `_${davrMatni.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
    const filename = `PROMAX_Qarz_${xavfsizNom}${davrFaylNom}_${new Date().toISOString().slice(0, 10)}.pdf`;

    let captionText = `📄 <b>MIJOZ QARZ HISOBOTI (AKT-SVERKA): ${mijoz.nom}</b>\n\n` +
      `👤 <b>Mijoz:</b> ${mijoz.nom}\n` +
      `📞 <b>Telefon:</b> ${mijoz.telefon || "Yo'q"}\n`;

    if (davrMatni) {
      captionText += `📅 <b>Davr:</b> <b>${davrMatni}</b>\n` +
        `💰 <b>Boshlang'ich qarz:</b> <b>${pul(boshlangichQarzUzs)} so'm</b>\n` +
        `📦 <b>Olingan yangi qarz:</b> +${pul(davrdagiQarzSavdoUzs)} so'm\n` +
        `💳 <b>Qaytarilgan to'lov:</b> -${pul(jamiTolandiUzs)} so'm\n` +
        (jamiVozvratQarzUzs > 0 ? `↩️ <b>Vozvrat (chegirildi):</b> -${pul(jamiVozvratQarzUzs)} so'm\n` : "") +
        `📊 <b>Davr oxiridagi qarz:</b> <b>${pul(oxirgiQarzUzs)} so'm</b>` +
        (oxirgiQarzUsd > 0 ? ` (va $${pul(oxirgiQarzUsd)})` : "") + `\n\n`;
    } else {
      captionText += `💵 <b>Joriy qarzi (UZS):</b> <b>${pul(oxirgiQarzUzs)} so'm</b>\n` +
        `💲 <b>Joriy qarzi (USD):</b> <b>$${pul(oxirgiQarzUsd)}</b>\n` +
        (jamiVozvratUzs > 0 ? `↩️ <b>Jami vozvratlar:</b> ${pul(jamiVozvratUzs)} so'm\n` : "") + `\n`;
    }

    const savdoSoni = savdolar?.length || 0;
    const tolovSoni = tolovlar?.length || 0;
    const vozvratSoni = vozvratlar?.length || 0;

    captionText += `📊 <i>Oxirgi amallar: ${hodisalar.length} ta (Savdo: ${savdoSoni}, To'lov: ${tolovSoni}, Vozvrat: ${vozvratSoni})</i>\n` +
      `📅 <i>Sana: ${hozirgiVaqt}</i>`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("caption", captionText);
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    if (!resData.ok) {
      console.error("sendMijozQarzPdf sendDocument xatosi:", resData);
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `❌ <b>PDF yuborishda xatolik:</b>\n<code>${resData.description || "Noma'lum"}</code>`,
        parse_mode: "HTML",
      });
    }
    return { ok: resData.ok, mijoz, error: resData.description };
  } catch (err: any) {
    console.error("sendMijozQarzPdf xatosi:", err);
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>PDF yaratishda xatolik:</b>\n<code>${err.message}</code>`,
      parse_mode: "HTML",
    });
    return { ok: false, error: err?.message };
  }
}
