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

// -----------------------------------------------------------------------------
// TASHQI QARZLAR (BIZNING QARZLARIMIZ VA BIZGA QARZLAR) UMUMIY PDF RO'YXATI
// -----------------------------------------------------------------------------
export async function sendTashqiQarzlarPdf(chatId: number | string): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    const { data: qarzlar, error } = await client
      .from("view_tashqi_qarzlar_balans")
      .select("*")
      .or("biz_berishimiz_kerak.gt.0,biz_olishimiz_kerak.gt.0")
      .order("biz_berishimiz_kerak", { ascending: false });

    if (error) throw error;
    if (!qarzlar || qarzlar.length === 0) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: "✅ <b>Tashqi qarzlar mavjud emas!</b> Barcha hisob-kitoblar nolga teng.",
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
    doc.text("PROMAX STORE - TASHQI QARZLAR BALANSI", 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const sanaStr = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    doc.text(`Holat: ${sanaStr} | Hamkorlar soni: ${qarzlar.length} ta`, 14, 25);

    let nextY = 32;

    // 1. Biz berishimiz kerak bo'lganlar (Bizning qarzlarimiz)
    const bizBerishimiz = qarzlar.filter((q: any) => Number(q.biz_berishimiz_kerak || 0) > 0);
    let jamiBerishimizUzs = 0;
    let jamiBerishimizUsd = 0;

    if (bizBerishimiz.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(225, 29, 72); // rose-600
      doc.text(`1. BIZNING QARZLARIMIZ (Biz berishimiz kerak bo'lgan summa): ${bizBerishimiz.length} ta`, 14, nextY);

      const rows1 = bizBerishimiz.map((q: any, idx: number) => {
        const val = q.valyuta || "UZS";
        const olingan = Number(q.jami_olingan || 0);
        const qaytarilgan = Number(q.jami_qaytarilgan || 0);
        const qoldiq = Number(q.biz_berishimiz_kerak || 0);
        if (val === "USD") jamiBerishimizUsd += qoldiq;
        else jamiBerishimizUzs += qoldiq;

        return [
          String(idx + 1),
          q.shaxs_nomi || "-",
          `${pul(olingan)} ${val}`,
          `${pul(qaytarilgan)} ${val}`,
          `${pul(qoldiq)} ${val}`,
          q.oxirgi_harakat ? new Date(q.oxirgi_harakat).toLocaleDateString("ru-RU") : "-",
        ];
      });

      rows1.push([
        "",
        "JAMI BIZNING QARZIMIZ:",
        "",
        "",
        `${pul(jamiBerishimizUzs)} so'm${jamiBerishimizUsd > 0 ? ` | $${pul(jamiBerishimizUsd)}` : ""}`,
        "",
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["No", "Hamkor / Tanish", "Jami olingan", "Qaytarilgan", "Bizning qarzimiz", "Oxirgi sana"]],
        body: rows1,
        theme: "striped",
        headStyles: { fillColor: [225, 29, 72], textColor: 255, fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 46, fontStyle: "bold" },
          2: { cellWidth: 32, halign: "right" },
          3: { cellWidth: 32, halign: "right" },
          4: { cellWidth: 38, halign: "right", fontStyle: "bold" },
          5: { cellWidth: 26, halign: "center" },
        },
        didParseCell: (data: any) => {
          if (data.row.index === rows1.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [254, 242, 242];
          }
        },
      });

      nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : nextY + 50;
    }

    // 2. Biz olishimiz kerak bo'lganlar (Biz bergan qarzlar)
    const bizOlishimiz = qarzlar.filter((q: any) => Number(q.biz_olishimiz_kerak || 0) > 0);
    let jamiOlishimizUzs = 0;
    let jamiOlishimizUsd = 0;

    if (bizOlishimiz.length > 0) {
      if (nextY > 230) {
        doc.addPage();
        nextY = 20;
      }

      doc.setFontSize(11);
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(`2. BIZGA QAYTARILISHI KERAK BO'LGANLAR (Biz bergan qarzlar): ${bizOlishimiz.length} ta`, 14, nextY);

      const rows2 = bizOlishimiz.map((q: any, idx: number) => {
        const val = q.valyuta || "UZS";
        const berilgan = Number(q.jami_berilgan || 0);
        const qaytgan = Number(q.jami_qaytgan || 0);
        const qoldiq = Number(q.biz_olishimiz_kerak || 0);
        if (val === "USD") jamiOlishimizUsd += qoldiq;
        else jamiOlishimizUzs += qoldiq;

        return [
          String(idx + 1),
          q.shaxs_nomi || "-",
          `${pul(berilgan)} ${val}`,
          `${pul(qaytgan)} ${val}`,
          `${pul(qoldiq)} ${val}`,
          q.oxirgi_harakat ? new Date(q.oxirgi_harakat).toLocaleDateString("ru-RU") : "-",
        ];
      });

      rows2.push([
        "",
        "JAMI BIZ OLISHIMIZ KERAK:",
        "",
        "",
        `${pul(jamiOlishimizUzs)} so'm${jamiOlishimizUsd > 0 ? ` | $${pul(jamiOlishimizUsd)}` : ""}`,
        "",
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["No", "Hamkor / Tanish", "Jami berilgan", "Qaytarilgan", "Biz olishimiz kerak", "Oxirgi sana"]],
        body: rows2,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 46, fontStyle: "bold" },
          2: { cellWidth: 32, halign: "right" },
          3: { cellWidth: 32, halign: "right" },
          4: { cellWidth: 38, halign: "right", fontStyle: "bold" },
          5: { cellWidth: 26, halign: "center" },
        },
        didParseCell: (data: any) => {
          if (data.row.index === rows2.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [240, 253, 244];
          }
        },
      });
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `PROMAX_Tashqi_Qarzlar_${new Date().toISOString().slice(0, 10)}.pdf`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📄 <b>PROMAX STORE — TASHQI QARZLAR BALANSI (PDF)</b>\n\n` +
      `🔴 <b>Bizning qarzimiz:</b> <b>${pul(jamiBerishimizUzs)} so'm</b>${jamiBerishimizUsd > 0 ? ` | <b>$${pul(jamiBerishimizUsd)}</b>` : ""}\n` +
      `🟢 <b>Biz olishimiz kerak:</b> <b>${pul(jamiOlishimizUzs)} so'm</b>${jamiOlishimizUsd > 0 ? ` | <b>$${pul(jamiOlishimizUsd)}</b>` : ""}\n\n` +
      `📅 <i>${sanaStr} holatiga</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    return { ok: resData.ok, count: qarzlar.length, error: resData.description };
  } catch (err: any) {
    console.error("sendTashqiQarzlarPdf xatosi:", err);
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>Tashqi qarzlar PDF yaratishda xatolik:</b>\n<code>${err.message}</code>`,
      parse_mode: "HTML",
    });
    return { ok: false, error: err?.message };
  }
}

// -----------------------------------------------------------------------------
// BITTA HAMKOR / TANISH BILAN AKT-SVERKA (SOLISHTIRMA DALOLATNOMA) PDF
// -----------------------------------------------------------------------------
export async function sendTashqiQarzAktSverkaPdf(
  chatId: number | string,
  shaxsNomi: string,
  boshSana?: string | null,
  tugashSana?: string | null
): Promise<{ ok: boolean; shaxs?: any; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    const norm = (shaxsNomi || "").toLowerCase().trim();
    if (!norm) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>Shaxs nomi ko'rsatilmadi.</b>`,
        parse_mode: "HTML",
      });
      return { ok: false, error: "Shaxs nomi ko'rsatilmadi" };
    }

    // 1. Shaxs bo'yicha operatsiyalarni olish
    let q = client
      .from("tashqi_qarzlar")
      .select("*, hisob:hisoblar(nom)")
      .ilike("shaxs_nomi_norm", `%${norm}%`)
      .eq("holat", "faol")
      .order("sana_vaqt", { ascending: true });

    if (boshSana) q = q.gte("sana_vaqt", `${boshSana}T00:00:00+05:00`);
    if (tugashSana) q = q.lte("sana_vaqt", `${tugashSana}T23:59:59.999+05:00`);

    const { data: amallar, error: amallarErr } = await q;
    if (amallarErr) throw amallarErr;

    if (!amallar || amallar.length === 0) {
      await tgPost("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>"${shaxsNomi}" bo'yicha hech qanday tashqi qarz amali topilmadi.</b>`,
        parse_mode: "HTML",
      });
      return { ok: false, error: "Amallar topilmadi" };
    }

    // Shaxsning aniq nomi
    const haqiqiyNom = amallar[0].shaxs_nomi;

    // Balans
    const { data: balansRow } = await client
      .from("view_tashqi_qarzlar_balans")
      .select("*")
      .ilike("shaxs_nomi_norm", `%${norm}%`);

    let bizBerishimiz = 0;
    let bizOlishimiz = 0;
    let valyuta = amallar[0].valyuta || "UZS";

    (balansRow || []).forEach((b: any) => {
      bizBerishimiz += Number(b.biz_berishimiz_kerak || 0);
      bizOlishimiz += Number(b.biz_olishimiz_kerak || 0);
    });

    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Sarlavha
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("PROMAX STORE - HAMKOR BILAN AKT-SVERKA", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Hamkor / Tanish: ${haqiqiyNom}`, 14, 25);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const sanaStr = new Date().toLocaleDateString("ru-RU") + " " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const davrStr = boshSana && tugashSana ? `Davr: ${boshSana} — ${tugashSana}` : `Barcha davr uchun`;
    doc.text(`${davrStr} | Shakllantirildi: ${sanaStr}`, 14, 30);

    // Qisqacha xulosa blok
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 33, 182, 14, 2, 2, "F");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    if (bizBerishimiz > 0) {
      doc.text(`Joriy holat: BIZNING QARZIMIZ: ${pul(bizBerishimiz)} ${valyuta} (Biz ${haqiqiyNom}ga berishimiz kerak)`, 18, 42);
    } else if (bizOlishimiz > 0) {
      doc.text(`Joriy holat: BIZGA QARZ: ${pul(bizOlishimiz)} ${valyuta} (${haqiqiyNom} bizga qaytarishi kerak)`, 18, 42);
    } else {
      doc.text(`Joriy holat: O'zaro hisob-kitoblar to'liq yopilgan (0 ${valyuta})`, 18, 42);
    }

    const rows = amallar.map((a: any, idx: number) => {
      let amalNomi = a.amal;
      if (a.amal === "oldim") amalNomi = "Qarz oldik (+)";
      else if (a.amal === "qaytardim") amalNomi = "Qarz qaytardik (-)";
      else if (a.amal === "berdim") amalNomi = "Qarz berdik (-)";
      else if (a.amal === "qaytdi") amalNomi = "Qarz qaytdi (+)";

      const sana = a.sana_vaqt ? new Date(a.sana_vaqt).toLocaleDateString("ru-RU") : "-";
      return [
        String(idx + 1),
        sana,
        amalNomi,
        `${pul(a.summa)} ${a.valyuta}`,
        a.maqsad || "-",
        a.hisob?.nom || "Kassaga ta'sirsiz",
        a.izoh || "-",
      ];
    });

    autoTable(doc, {
      startY: 50,
      head: [["No", "Sana", "Amal turi", "Summa", "Maqsad", "Hisob / Kassa", "Izoh"]],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 28, fontStyle: "bold" },
        3: { cellWidth: 28, halign: "right", fontStyle: "bold" },
        4: { cellWidth: 28 },
        5: { cellWidth: 32 },
        6: { cellWidth: 38 },
      },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const safeNom = haqiqiyNom.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_]/g, "_");
    const filename = `PROMAX_AktSverka_${safeNom}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📄 <b>PROMAX STORE — HAMKOR BILAN AKT-SVERKA (PDF)</b>\n\n` +
      `👤 <b>Hamkor:</b> ${haqiqiyNom}\n` +
      (bizBerishimiz > 0 ? `🔴 <b>Bizning qarzimiz:</b> <b>${pul(bizBerishimiz)} ${valyuta}</b>\n` : "") +
      (bizOlishimiz > 0 ? `🟢 <b>Biz olishimiz kerak:</b> <b>${pul(bizOlishimiz)} ${valyuta}</b>\n` : "") +
      (bizBerishimiz === 0 && bizOlishimiz === 0 ? `✅ <b>Hisob-kitoblar to'liq nolga tenglashgan!</b>\n` : "") +
      `📊 <i>Amallar soni: ${amallar.length} ta</i>\n` +
      `📅 <i>${sanaStr} holatiga</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    return { ok: resData.ok, shaxs: haqiqiyNom, error: resData.description };
  } catch (err: any) {
    console.error("sendTashqiQarzAktSverkaPdf xatosi:", err);
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>Akt-sverka PDF yaratishda xatolik:</b>\n<code>${err.message}</code>`,
      parse_mode: "HTML",
    });
    return { ok: false, error: err?.message };
  }
}

// -----------------------------------------------------------------------------
// KUNLIK YAKUNIY MOLIYAVIY HISOBOT PDF (A4 JADVAL VA XULOSA)
// -----------------------------------------------------------------------------
export async function sendKunlikHisobotPdf(chatId: number | string, dateStr?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getSupabase();
    if (!client) throw new Error("Supabase ulanishi mavjud emas");

    // Sanani aniqlash (Toshkent vaqti bo'yicha)
    let targetDateStr = dateStr?.trim();
    if (!targetDateStr || targetDateStr === "today" || targetDateStr === "bugun") {
      targetDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
    } else if (targetDateStr.includes(".")) {
      const parts = targetDateStr.split(".");
      if (parts.length === 3) targetDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const startIso = `${targetDateStr}T00:00:00+05:00`;
    const endIso = `${targetDateStr}T23:59:59.999+05:00`;

    const [{ data: savdolar }, { data: rasxodlar }, { data: qarzTolovlari }, { data: hisoblar }] = await Promise.all([
      client
        .from("savdolar")
        .select("*, mijoz:mijozlar(nom)")
        .eq("holat", "yakunlandi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true }),
      client
        .from("rasxodlar")
        .select("*, hisob:hisoblar(nom)")
        .neq("holat", "bekor_qilindi")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true }),
      client
        .from("qarz_tolovlari")
        .select("*, mijoz:mijozlar(nom), hisob:hisoblar(nom)")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .order("sana_vaqt", { ascending: true }),
      client
        .from("hisoblar")
        .select("id, nom, turi, valyuta, balans, faol, masul_xodim")
        .eq("faol", true)
        .order("tartib", { ascending: true }),
    ]);

    // Hisob-kitoblar
    let savdoUzs = 0, savdoUsd = 0;
    let naqdUzs = 0, naqdUsd = 0;
    let qarzBerildiUzs = 0, qarzBerildiUsd = 0;
    (savdolar || []).forEach((s: any) => {
      const jami = Number(s.jami_summa || 0);
      const tolandi = Number(s.tolangan_summa || 0);
      const qarz = Number(s.qarz_summa || 0);
      if (s.valyuta === "USD") {
        savdoUsd += jami;
        naqdUsd += tolandi;
        qarzBerildiUsd += qarz;
      } else {
        savdoUzs += jami;
        naqdUzs += tolandi;
        qarzBerildiUzs += qarz;
      }
    });

    let eskiQarzTushdiUzs = 0, eskiQarzTushdiUsd = 0;
    (qarzTolovlari || []).forEach((q: any) => {
      const sum = Number(q.summa || 0);
      if (q.valyuta === "USD") eskiQarzTushdiUsd += sum;
      else eskiQarzTushdiUzs += sum;
    });

    let rasxodUzs = 0, rasxodUsd = 0;
    const katMap: Record<string, number> = {};
    (rasxodlar || []).forEach((r: any) => {
      const sum = Number(r.summa || 0);
      if (r.valyuta === "USD") rasxodUsd += sum;
      else {
        rasxodUzs += sum;
        const kat = r.kategoriya || "Boshqa";
        katMap[kat] = (katMap[kat] || 0) + sum;
      }
    });

    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = (autoTableModule.default || autoTableModule) as any;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const [yyyy, mm, dd] = targetDateStr.split("-");
    const kun = `${dd}.${mm}.${yyyy}`;
    const hozirgiVaqt = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    // Sarlavha
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("PROMAX B2B STORE - KUNLIK YAKUNIY HISOBOT", 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Sana: ${kun} | Yaratildi: ${kun} ${hozirgiVaqt}`, 14, 25);

    // KPI Kartochkalari (A4 yuqorisida 3 ta blok)
    // Blok 1: Savdo
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(14, 30, 58, 26, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(22, 101, 52);
    doc.text("SAVDO TUSHUMI", 18, 36);
    doc.setFontSize(11);
    doc.text(`${pul(savdoUzs)} so'm`, 18, 42);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Kassaga: ${pul(naqdUzs)} | Qarz: ${pul(qarzBerildiUzs)}`, 18, 48);
    if (savdoUsd > 0) doc.text(`Dollar: $${pul(savdoUsd)}`, 18, 53);

    // Blok 2: Chiqimlar (Rasxod)
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(76, 30, 58, 26, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(159, 18, 57);
    doc.text("XARAJATLAR (RASXOD)", 80, 36);
    doc.setFontSize(11);
    doc.text(`${pul(rasxodUzs)} so'm`, 80, 42);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const topKats = Object.entries(katMap).slice(0, 2).map(([k, v]) => `${k}: ${pul(v)}`).join(", ");
    doc.text(topKats || "Xarajat yo'q", 80, 48);
    if (rasxodUsd > 0) doc.text(`Dollar: $${pul(rasxodUsd)}`, 80, 53);

    // Blok 3: Qarzdan tushum
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(138, 30, 58, 26, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14);
    doc.text("ESKI QARZDAN TUSHUM", 142, 36);
    doc.setFontSize(11);
    doc.text(`${pul(eskiQarzTushdiUzs)} so'm`, 142, 42);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Qaytarilgan qarzlar: ${(qarzTolovlari || []).length} ta`, 142, 48);
    if (eskiQarzTushdiUsd > 0) doc.text(`Dollar: $${pul(eskiQarzTushdiUsd)}`, 142, 53);

    let nextY = 62;

    // 1. Savdolar jadvali
    if ((savdolar || []).length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(`Savdolar (${savdolar.length} ta)`, 14, nextY);

      const sRows = savdolar.map((s: any) => [
        s.raqam ? `#${s.raqam}` : "-",
        s.sana_vaqt ? new Date(s.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "-",
        s.mijoz?.nom || "Chakana xaridor",
        `${pul(s.jami_summa)} ${s.valyuta}`,
        `${pul(s.tolangan_summa)} ${s.valyuta}`,
        Number(s.qarz_summa) > 0 ? `${pul(s.qarz_summa)} ${s.valyuta}` : "-",
        s.tolov_turi || "naqd",
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["Chek", "Vaqt", "Mijoz", "Jami", "To'landi", "Qarz", "To'lov"]],
        body: sRows,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 16, halign: "center" },
          1: { cellWidth: 14, halign: "center" },
          2: { cellWidth: 46, fontStyle: "bold" },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 26, halign: "right" },
          6: { cellWidth: 24, halign: "center" },
        },
      });

      nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
    }

    // 2. Chiqimlar jadvali
    if ((rasxodlar || []).length > 0) {
      if (nextY > 230) {
        doc.addPage();
        nextY = 20;
      }
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(`Xarajatlar (${rasxodlar.length} ta)`, 14, nextY);

      const rRows = rasxodlar.map((r: any) => [
        r.sana_vaqt ? new Date(r.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "-",
        r.kategoriya || "Chiqim",
        r.izoh || "-",
        `${pul(r.summa)} ${r.valyuta}`,
        r.hisob?.nom || r.tolov_turi || "naqd",
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["Vaqt", "Kategoriya", "Izoh", "Summa", "Hisob / Kassa"]],
        body: rRows,
        theme: "striped",
        headStyles: { fillColor: [244, 63, 94], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 16, halign: "center" },
          1: { cellWidth: 34, fontStyle: "bold" },
          2: { cellWidth: 64 },
          3: { cellWidth: 32, halign: "right", fontStyle: "bold" },
          4: { cellWidth: 36 },
        },
      });

      nextY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : nextY + 40;
    }

    // 3. Kassalar balansi jadvali
    if ((hisoblar || []).length > 0) {
      if (nextY > 220) {
        doc.addPage();
        nextY = 20;
      }
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text("Kassalar va xodimlar hisoblari joriy balansi", 14, nextY);

      const hRows = hisoblar.map((h: any, idx: number) => [
        String(idx + 1),
        h.nom || "-",
        h.masul_xodim || "Asosiy Do'kon",
        h.turi || "kassa",
        `${pul(h.balans)} ${h.valyuta || "UZS"}`,
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["No", "Hisob nomi", "Mas'ul", "Turi", "Joriy balans"]],
        body: hRows,
        theme: "grid",
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 54, fontStyle: "bold" },
          2: { cellWidth: 44 },
          3: { cellWidth: 30 },
          4: { cellWidth: 44, halign: "right", fontStyle: "bold" },
        },
      });
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `PROMAX_Kunlik_Hisobot_${targetDateStr}.pdf`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "caption",
      `📊 <b>PROMAX STORE — KUNLIK YAKUNIY HISOBOT (PDF)</b>\n\n` +
      `📅 <b>Sana:</b> ${kun}\n` +
      `🛒 <b>Jami savdo:</b> <b>${pul(savdoUzs)} so'm</b>${savdoUsd > 0 ? ` | <b>$${pul(savdoUsd)}</b>` : ""}\n` +
      `💵 <b>Kassaga tushdi:</b> <b>${pul(naqdUzs)} so'm</b>\n` +
      `🧾 <b>Jami chiqim:</b> <b>${pul(rasxodUzs)} so'm</b>\n` +
      `💳 <b>Qarzdan tushum:</b> <b>${pul(eskiQarzTushdiUzs)} so'm</b>\n\n` +
      `<i>PDF hujjat orqali to'liq tafsilotlarni ko'rishingiz mumkin.</i>`
    );
    formData.append("parse_mode", "HTML");
    formData.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const resData = await resp.json();
    return { ok: resData.ok, error: resData.description };
  } catch (err: any) {
    console.error("sendKunlikHisobotPdf xatosi:", err);
    await tgPost("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>Kunlik hisobot PDF yaratishda xatolik:</b>\n<code>${err.message}</code>`,
      parse_mode: "HTML",
    });
    return { ok: false, error: err?.message };
  }
}

