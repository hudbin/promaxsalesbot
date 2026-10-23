import {
  getSupabase,
  supabase,
  tgPost,
  pul,
  normalizeTolovTuri,
  GROUP_CHAT_ID,
} from "./config";
import {
  buildSavdoCard,
  buildRasxodCard,
  buildMultiRasxodCard,
  buildQarzTolovCard,
  buildQarzEslatmaCard,
  buildBalansSozlashCard,
  buildTashqiQarzCard,
  buildBoshqaKirimCard,
} from "./cards";
import {
  checkUserPermission,
  runTovarlarniOptimallashtirish,
  buildOptimizationReport,
} from "./entities";
import {
  sendMijozQarzPdf,
  sendQarzdorlarPdf,
  sendQarzdorlarExcel,
  sendKunlikHisobotPdf,
  sendTashqiQarzlarPdf,
  sendTashqiQarzAktSverkaPdf,
} from "./pdf";

export async function handleCallbackQuery(cq: any, res: any): Promise<any> {
  const data = cq.data || "";
  const chatId = cq.message?.chat?.id;
  const msgId = cq.message?.message_id;
  const fromName = `${cq.from?.first_name || ""} ${cq.from?.last_name || ""}`.trim() || "Xodim";

  // 1.0 MIJOZ TANLASH (SAVDO) (pk:m:draftId:choice)
  if (data.startsWith("pk:m:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const choice = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    if (choice === "new") {
      const nom = (p.mijoz_nomi || "Yangi mijoz").trim();
      const { data: newM } = await getSupabase()
        .from("mijozlar")
        .insert({
          nom: nom,
          nom_norm: nom.toLowerCase(),
          qarz_uzs: 0,
          qarz_usd: 0,
          faol: true,
        })
        .select()
        .single();
      p.selectedMijoz = newM;
      p.mijozStatus = "resolved";
    } else if (choice === "none") {
      p.selectedMijoz = null;
      p.mijozStatus = "resolved";
    } else {
      const { data: selM } = await supabase
        .from("mijozlar")
        .select("*")
        .eq("id", choice)
        .single();
      p.selectedMijoz = selM;
      p.mijozStatus = "resolved";
    }

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildSavdoCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Mijoz tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.1 TOVAR MODELINI TANLASH (SAVDO) (pk:t:draftId:idx:choice)
  if (data.startsWith("pk:t:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const idx = Number(parts[3]);
    const tChoice = parts[4];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    if (p.qatorlar && p.qatorlar[idx]) {
      if (tChoice === "free") {
        p.qatorlar[idx].tovar_id = null;
        p.qatorlar[idx].aniq_nom = p.qatorlar[idx].nom;
        p.qatorlar[idx].status = "resolved";
      } else {
        const { data: selT } = await supabase
          .from("tovarlar")
          .select("*")
          .eq("id", tChoice)
          .single();
        if (selT) {
          p.qatorlar[idx].tovar_id = selT.id;
          p.qatorlar[idx].aniq_nom = selT.nom;
          p.qatorlar[idx].qoldiq = Number(selT.qoldiq) || 0;
          p.qatorlar[idx].birlik = selT.birlik || "dona";
          p.qatorlar[idx].status = "resolved";
        }
      }
    }

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildSavdoCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Tovar tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.2 SAVDO UCHUN KIRIM HISOBINI TANLASH (pk:sh:draftId:hisobId)
  if (data.startsWith("pk:sh:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = hId;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildSavdoCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Kassa hisobi tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.2.B BALANS SOZLASH UCHUN HISOB TANLASH (bs:sh:draftId:hisobId)
  if (data.startsWith("bs:sh:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = hId;

    const { data: vb } = await getSupabase()
      .from("view_kassa_balans")
      .select("joriy_balans, valyuta, kassa_nomi")
      .eq("hisob_id", hId)
      .maybeSingle();

    p.joriy_balans = Number(vb?.joriy_balans || 0);
    if (vb?.valyuta) p.valyuta = vb.valyuta;
    if (vb?.kassa_nomi) p.hisob_nomi = vb.kassa_nomi;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase()
      .from("hisoblar")
      .select("id, nom, turi, valyuta")
      .eq("faol", true);

    const nextCard = buildBalansSozlashCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Hisob tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.2.C BALANS SOZLASH: HISOBNI QAYTA TANLASH (bs:ch:draftId)
  if (data.startsWith("bs:ch:")) {
    const draftId = data.replace("bs:ch:", "");

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = null;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase()
      .from("hisoblar")
      .select("id, nom, turi, valyuta")
      .eq("faol", true);

    const nextCard = buildBalansSozlashCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Hisobni qayta tanlang" });
    return res.status(200).send("OK");
  }

  // 1.2.D TANISHLAR QARZI: YO'NALISH TANLASH (tq:oylik / tq:h / tq:none / tq:reset)
  if (data.startsWith("tq:")) {
    const parts = data.split(":");
    const subAction = parts[1];
    const draftId = parts[2];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;

    if (subAction === "oylik") {
      p.bevosita_oylik = true;
      p.hisob_id = null;
      p.kassaTanlandi = true;
      p.kassasiz = false;
    } else if (subAction === "h") {
      const hId = parts[3];
      p.hisob_id = hId;
      p.bevosita_oylik = false;
      p.kassaTanlandi = true;
      p.kassasiz = false;
    } else if (subAction === "none") {
      p.hisob_id = null;
      p.bevosita_oylik = false;
      p.kassasiz = true;
      p.kassaTanlandi = true;
    } else if (subAction === "reset") {
      p.hisob_id = null;
      p.bevosita_oylik = false;
      p.kassasiz = false;
      p.kassaTanlandi = false;
    }

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase()
      .from("hisoblar")
      .select("id, nom, turi, valyuta")
      .eq("faol", true);

    const nextCard = buildTashqiQarzCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.3 QARZ TO'LOVI UCHUN MIJOZ TANLASH (pk:qm:draftId:mijozId)
  if (data.startsWith("pk:qm:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const mId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .single();

    if (!draft) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bu amal muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    const { data: selM } = await supabase
      .from("mijozlar")
      .select("*")
      .eq("id", mId)
      .single();
    p.selectedMijoz = selM;
    p.mijozStatus = "resolved";

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildQarzTolovCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Mijoz tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.4.0 BOSHQA KIRIM UCHUN HISOB TANLASH (pk:bkh:draftId:hisobId)
  if (data.startsWith("pk:bkh:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = hId;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildBoshqaKirimCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Kirim hisobi tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.4 CHIQIM (YAGONA RASXOD) UCHUN HISOB TANLASH (pk:rh:draftId:hisobId)
  if (data.startsWith("pk:rh:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = hId;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildRasxodCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Chiqim hisobi tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.4.1 KO'P RASXOD: BARCHASIGA BITTA HISOB BIRIKTIRISH (pk:mrh_all:draftId:hisobId)
  if (data.startsWith("pk:mrh_all:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.xarajatlar = Array.isArray(p.xarajatlar) ? p.xarajatlar : [];
    p.xarajatlar.forEach((it: any) => {
      it.hisob_id = hId;
    });
    delete p.pickIndex;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildMultiRasxodCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Barcha xarajatlarga hisob biriktirildi!" });
    return res.status(200).send("OK");
  }

  // 1.4.2 KO'P RASXOD: HAR BIRIGA ALOHIDA TANLASHNI BOSHLASH YOKI BITTA ELEMENTGA O'TISH (pk:mrh_pick_each:draftId:idx)
  if (data.startsWith("pk:mrh_pick_each:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const idx = Number(parts[3]) || 0;

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.pickIndex = idx;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildMultiRasxodCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: `${idx + 1}-xarajat hisobini tanlang` });
    return res.status(200).send("OK");
  }

  // 1.4.3 KO'P RASXOD: BITTA ANIQ ELEMENT UCHUN HISOBNI BIRIKTIRISH (pk:mrh_item:draftId:idx:hisobId)
  if (data.startsWith("pk:mrh_item:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const idx = Number(parts[3]);
    const hId = parts[4];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.xarajatlar = Array.isArray(p.xarajatlar) ? p.xarajatlar : [];
    if (p.xarajatlar[idx]) {
      p.xarajatlar[idx].hisob_id = hId;
    }

    // Keyingi hisobi yo'q element bormi?
    const nextUnassignedIdx = p.xarajatlar.findIndex((it: any) => !it.hisob_id);
    if (nextUnassignedIdx >= 0) {
      p.pickIndex = nextUnassignedIdx;
    } else {
      delete p.pickIndex;
    }

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildMultiRasxodCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: `Tanlandi!` });
    return res.status(200).send("OK");
  }

  // 1.4.4 KO'P RASXOD: HISOBLARNI TOZALASH / QAYTA TANLASH (pk:mrh_reset:draftId)
  if (data.startsWith("pk:mrh_reset:")) {
    const draftId = data.replace("pk:mrh_reset:", "");
    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (draft && draft.malumot) {
      const p = draft.malumot;
      p.xarajatlar = Array.isArray(p.xarajatlar) ? p.xarajatlar : [];
      p.xarajatlar.forEach((it: any) => {
        delete it.hisob_id;
      });
      delete p.pickIndex;

      await getSupabase()
        .from("tranzaksiya_qoralama")
        .update({ malumot: p })
        .eq("id", draftId);

      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
      const nextCard = buildMultiRasxodCard(draftId, p, hisoblarDB || []);
      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: nextCard.text,
        parse_mode: "HTML",
        reply_markup: nextCard.keyboard,
      });
    }

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Hisoblar tozalandi" });
    return res.status(200).send("OK");
  }

  // 1.4.5 KO'P RASXOD: ORQAGA (pk:mrh_back:draftId)
  if (data.startsWith("pk:mrh_back:")) {
    const draftId = data.replace("pk:mrh_back:", "");
    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (draft && draft.malumot) {
      delete draft.malumot.pickIndex;
      await getSupabase()
        .from("tranzaksiya_qoralama")
        .update({ malumot: draft.malumot })
        .eq("id", draftId);

      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
      const nextCard = buildMultiRasxodCard(draftId, draft.malumot, hisoblarDB || []);
      await tgPost("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: nextCard.text,
        parse_mode: "HTML",
        reply_markup: nextCard.keyboard,
      });
    }

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Asosiy oynaga qaytildi" });
    return res.status(200).send("OK");
  }

  // 1.5 QARZ TO'LOVI UCHUN KIRIM HISOBINI TANLASH (pk:qh:draftId:hisobId)
  if (data.startsWith("pk:qh:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const hId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    p.hisob_id = hId;

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
    const nextCard = buildQarzTolovCard(draftId, p, hisoblarDB || []);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Kirim hisobi tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.6 QARZ ESLATMASIDA MIJOZ TANLASH (pk:em:draftId:mijozId)
  if (data.startsWith("pk:em:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const mId = parts[3];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .single();

    if (!draft) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bu amal muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    const { data: selM } = await supabase
      .from("mijozlar")
      .select("*")
      .eq("id", mId)
      .single();
    p.selectedMijoz = selM;
    p.mijozStatus = "resolved";

    await getSupabase()
      .from("tranzaksiya_qoralama")
      .update({ malumot: p })
      .eq("id", draftId);

    const nextCard = buildQarzEslatmaCard(draftId, p);
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: nextCard.text,
      parse_mode: "HTML",
      reply_markup: nextCard.keyboard,
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Mijoz tanlandi!" });
    return res.status(200).send("OK");
  }

  // 1.7.0 QARZDORLAR RO'YXATI EXCEL CHIQARISH CALLBACK: dl_qarzdorlar_excel
  if (data === "dl_qarzdorlar_excel") {
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Qarzdorlar Excel fayli tayyorlanmoqda..." });
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendQarzdorlarExcel(chatId);
    return res.status(200).send("OK");
  }

  // 1.7 MIJOZ QARZ TARIXI (PDF AKT-SVERKA) CHIQARISH CALLBACK: pdf:m:mijozId
  if (data.startsWith("pdf:m:")) {
    const mId = data.replace("pdf:m:", "");
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "PDF tayyorlanmoqda..." });
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendMijozQarzPdf(chatId, mId);
    return res.status(200).send("OK");
  }

  // 1.7.1 KUNLIK YAKUNIY HISOBOT PDF YUKLASH CALLBACK: dl_daily_pdf:YYYY-MM-DD
  if (data.startsWith("dl_daily_pdf:")) {
    const targetDate = data.replace("dl_daily_pdf:", "");
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Kunlik hisobot PDF tayyorlanmoqda..." });
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendKunlikHisobotPdf(chatId, targetDate);
    return res.status(200).send("OK");
  }

  // 1.7.2 TASHQI QARZLAR UMUMIY BALANSI PDF: dl_tashqi_pdf
  if (data === "dl_tashqi_pdf") {
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Tashqi qarzlar PDF tayyorlanmoqda..." });
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendTashqiQarzlarPdf(chatId);
    return res.status(200).send("OK");
  }

  // 1.7.3 HAMKOR BILAN AKT-SVERKA PDF: dl_tashqi_akt:shaxsNomi
  if (data.startsWith("dl_tashqi_akt:")) {
    const shaxsNomi = data.replace("dl_tashqi_akt:", "");
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Akt-sverka PDF tayyorlanmoqda..." });
    await tgPost("sendChatAction", { chat_id: chatId, action: "upload_document" });
    await sendTashqiQarzAktSverkaPdf(chatId, shaxsNomi);
    return res.status(200).send("OK");
  }

  // 1.8 TASDIQLASH BOSILGANDA (cf:draftId)
  if (data.startsWith("cf:")) {
    const draftId = data.replace("cf:", "");
    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .single();

    if (!draft) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bu amal muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const p = draft.malumot;
    let javobMatn = "";

    // 1.8.A YAGONA RASXOD
    if (p.amal === "rasxod") {
      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);
      if (!p.hisob_id) {
        const nextCard = buildRasxodCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Iltimos, avval chiqim hisobini tanlang!" });
        return res.status(200).send("OK");
      }

      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const tolovTuriNorm = normalizeTolovTuri(p.tolov_turi, tanlanganHisob?.turi);

      const { error: rasxodErr } = await getSupabase().rpc("fn_rasxod_yaratish_v2", {
        p_summa: p.jami_summa,
        p_valyuta: p.valyuta || "UZS",
        p_kategoriya: p.kategoriya || "Boshqa",
        p_tolov_turi: tolovTuriNorm,
        p_hisob_id: p.hisob_id,
        p_izoh: p.izoh || "",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      if (rasxodErr) {
        console.error("fn_rasxod_yaratish xatosi:", rasxodErr);
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + rasxodErr.message });
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: `❌ <b>Xarajatni saqlashda xatolik:</b>\n<code>${rasxodErr.message}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).send("OK");
      }

      const hisobNom = tanlanganHisob?.nom || "Kassa";
      javobMatn = `✅ <b>RASXOD SAQLANDI</b>\n\n💵 Summa: <b>${pul(p.jami_summa)} ${p.valyuta || "UZS"}</b>\n📂 Kategoriya: <b>${p.kategoriya}</b>\n💳 Chiqim hisobi: <b>${hisobNom}</b>\n✍️ Kiritdi: <b>${fromName}</b>`;
    }

    // 1.8.B BIR NECHTA RASXODLAR (KO'P RASXOD)
    else if (p.amal === "kop_rasxod") {
      const xarajatlar: any[] = Array.isArray(p.xarajatlar) ? p.xarajatlar : [];
      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);

      // Agar birorta xarajatda hisob belgilanmagan bo'lsa
      const unassignedIdx = xarajatlar.findIndex((it: any) => !it.hisob_id);
      if (unassignedIdx >= 0) {
        const nextCard = buildMultiRasxodCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Iltimos, avval barcha xarajatlar uchun hisobni tanlang!" });
        return res.status(200).send("OK");
      }

      const hisobMap = new Map<string, any>((hisoblarDB || []).map((h: any) => [h.id, h]));
      const valyuta = p.valyuta || "UZS";
      let jamiMuvaffaqiyatli = 0;
      let jamiSumma = 0;
      let tafsilotQatorlari = "";

      for (let i = 0; i < xarajatlar.length; i++) {
        const it = xarajatlar[i];
        const h = hisobMap.get(it.hisob_id);
        const tolovTuriNorm = normalizeTolovTuri(it.tolov_turi, h?.turi);
        const summa = Number(it.summa) || 0;

        const { error: rErr } = await getSupabase().rpc("fn_rasxod_yaratish_v2", {
          p_summa: summa,
          p_valyuta: valyuta,
          p_kategoriya: it.kategoriya || "Boshqa",
          p_tolov_turi: tolovTuriNorm,
          p_hisob_id: it.hisob_id,
          p_izoh: it.izoh || "",
          p_xodim: fromName,
          p_telegram_user_id: cq.from?.id,
        });

        if (!rErr) {
          jamiMuvaffaqiyatli++;
          jamiSumma += summa;
          const hNom = h?.nom || "Kassa";
          tafsilotQatorlari += `  ${i + 1}️⃣ <b>${it.kategoriya || "Boshqa"}</b>: <code>${pul(summa)} ${valyuta}</code> (💳 ${hNom})\n`;
        } else {
          console.error(`Ko'p rasxod #${i + 1} xatosi:`, rErr);
        }
      }

      javobMatn = `✅ <b>${jamiMuvaffaqiyatli} TA XARAJAT MUVAFFAQIYATLI SAQLANDI</b>\n\n` +
        `${tafsilotQatorlari}\n` +
        `📊 <b>Jami xarajat:</b> <b>${pul(jamiSumma)} ${valyuta}</b>\n` +
        `✍️ Kiritdi: <b>${fromName}</b>`;
    }

    // 1.8.C QARZ TO'LOVI
    else if (p.amal === "qarz_tolov") {
      const mijozId = p.selectedMijoz?.id || null;
      const valyuta = p.valyuta || "UZS";
      const summa = Number(p.jami_summa) || 0;
      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);

      if (summa > 0 && !p.hisob_id) {
        const nextCard = buildQarzTolovCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Iltimos, avval kirim hisobini tanlang!" });
        return res.status(200).send("OK");
      }

      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const tolovTuriNorm = normalizeTolovTuri(p.tolov_turi, tanlanganHisob?.turi);

      const { error: tolovErr } = await getSupabase().rpc("fn_qarz_tolov_yaratish_v2", {
        p_mijoz_id: mijozId,
        p_summa: summa,
        p_valyuta: valyuta,
        p_tolov_turi: tolovTuriNorm,
        p_hisob_id: p.hisob_id,
        p_izoh: p.izoh || "Qarz to'landi",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      if (tolovErr) {
        console.error("fn_qarz_tolov_yaratish xatosi:", tolovErr);
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + tolovErr.message });
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: `❌ <b>Qarz to'lovini saqlashda xatolik:</b>\n<code>${tolovErr.message}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).send("OK");
      }

      const hisobNom = tanlanganHisob?.nom || "Kassa";
      const eskiQarz = p.selectedMijoz
        ? Number(valyuta === "USD" ? p.selectedMijoz.qarz_usd : p.selectedMijoz.qarz_uzs) || 0
        : 0;
      const yangiQarz = Math.max(0, eskiQarz - summa);

      javobMatn = `✅ <b>QARZ TO'LOVI QABUL QILINDI</b>\n\n` +
        `👤 Mijoz: <b>${p.selectedMijoz?.nom || p.mijoz_nomi || "Noma'lum"}</b>\n` +
        `💵 To'lov summasi: <b>${pul(summa)} ${valyuta}</b>\n` +
        `📥 Kirim hisobi: <b>${hisobNom}</b>\n` +
        (p.selectedMijoz
          ? `📂 Eski qarz: ${pul(eskiQarz)} ${valyuta} ➔ <b>Yangi qarz: ${pul(yangiQarz)} ${valyuta}</b>\n`
          : "") +
        `✍️ Qabul qildi: <b>${fromName}</b>`;
    }

    // 1.8.D SAVDO
    else if (p.amal === "savdo") {
      const valyuta = p.valyuta || "UZS";
      const jami = (p.qatorlar || []).reduce(
        (sum: number, it: any) => sum + (Number(it.soni) || 0) * (Number(it.narx) || 0),
        0
      ) || Number(p.jami_summa) || 0;
      const tolangan = Number(p.tolangan_summa) || 0;
      const qarz = Math.max(0, jami - tolangan);

      const { data: hisoblarDB } = await getSupabase().from("hisoblar").select("id, nom, turi, valyuta").eq("faol", true);

      if (tolangan > 0 && !p.hisob_id) {
        const nextCard = buildSavdoCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Iltimos, avval kirim hisobini tanlang!" });
        return res.status(200).send("OK");
      }

      const finalQatorlar = (p.qatorlar || []).map((it: any) => ({
        tovar_id: it.tovar_id || null,
        tovar_nomi: it.aniq_nom || it.nom || "Noma'lum mahsulot",
        soni: Number(it.soni) || 1,
        narx: Number(it.narx) || 0,
        summa: (Number(it.soni) || 1) * (Number(it.narx) || 0),
      }));

      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const tolovTuriNorm = normalizeTolovTuri(p.tolov_turi, tanlanganHisob?.turi);

      const { data: savdoId, error: saveErr } = await getSupabase().rpc("fn_savdo_yaratish_v2", {
        p_mijoz_id: p.selectedMijoz?.id || null,
        p_valyuta: valyuta,
        p_tolangan: tolangan,
        p_tolov_turi: tolovTuriNorm,
        p_hisob_id: tolangan > 0 ? p.hisob_id : null,
        p_izoh: p.izoh || "",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
        p_qatorlar: finalQatorlar,
      });

      if (saveErr) {
        console.error("fn_savdo_yaratish xatosi:", saveErr);
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + saveErr.message });
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: `❌ <b>Savdoni saqlashda xatolik yuz berdi:</b>\n<code>${saveErr.message}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).send("OK");
      }

      let itemsSummary = "";
      (finalQatorlar || []).forEach((it: any, i: number) => {
        const orig = (p.qatorlar || [])[i] || it;
        const soni = Number(it.soni) || 1;
        const narx = Number(it.narx) || 0;
        const s = soni * narx;
        const birlik = orig.birlik || "dona";
        itemsSummary += `  ${i + 1}️⃣ <b>${orig.aniq_nom || it.nom}</b>: <code>${soni} ${birlik}</code> × <code>${pul(narx)}</code> = <code>${pul(s)} ${valyuta}</code>\n`;
      });

      const hisobNom = tanlanganHisob?.nom || "Kassa";
      const eskiQarz = p.selectedMijoz
        ? Number(valyuta === "USD" ? p.selectedMijoz.qarz_usd : p.selectedMijoz.qarz_uzs) || 0
        : 0;
      const yangiQarz = eskiQarz + qarz;

      javobMatn = `✅ <b>SAVDO SAQLANDI VA DO'KONDAN AYIRILDI</b>\n\n` +
        `👤 Mijoz: <b>${p.selectedMijoz?.nom || "Chakana"}</b>\n` +
        (itemsSummary ? `📦 Mahsulotlar:\n${itemsSummary}\n` : "") +
        `💰 Jami: <b>${pul(jami)} ${valyuta}</b>\n` +
        `💵 To'landi: <b>${pul(tolangan)} ${valyuta}</b>\n` +
        (tolangan > 0 ? `📥 Kirim hisobi: <b>${hisobNom}</b>\n` : "") +
        `📝 Qarzga: <b>${pul(qarz)} ${valyuta}</b>\n` +
        (qarz > 0 && p.selectedMijoz
          ? `📂 Mijozning eski umumiy qarzi: <b>${pul(eskiQarz)} ${valyuta}</b>\n` +
            `📊 Mijozning yangi umumiy qarzi: <b>${pul(yangiQarz)} ${valyuta}</b>\n`
          : "") +
        `✍️ Sotuvchi: <b>${fromName}</b>`;
    }

    // 1.8.E TOVAR VOZVRAT
    else if (p.amal === "tovar_vozvrat") {
      const mijozId = p.selectedMijoz?.id || null;
      const valyuta = p.valyuta || "UZS";
      const jami = (p.qatorlar || []).reduce(
        (sum: number, it: any) => sum + (Number(it.soni) || 0) * (Number(it.narx) || 0),
        0
      ) || Number(p.jami_summa) || 0;
      const naqdQaytarildi = Number(p.naqd_qaytarildi) || 0;
      const qarzdanAyirildi = p.qarzdan_ayirish !== false ? Math.max(0, jami - naqdQaytarildi) : 0;

      const mappedQatorlar = (p.qatorlar || []).map((it: any) => ({
        tovar_id: it.tovar_id || null,
        tovar_nomi: it.aniq_nom || it.nom || "Qaytarilgan tovar",
        soni: Number(it.soni) || 1,
        narx: Number(it.narx) || 0,
        summa: (Number(it.soni) || 1) * (Number(it.narx) || 0),
      }));

      const { error: vozvratErr } = await getSupabase().rpc("fn_tovar_vozvrat_yaratish", {
        p_mijoz_id: mijozId,
        p_valyuta: valyuta,
        p_jami_summa: jami,
        p_qarzdan_ayirildi: qarzdanAyirildi,
        p_naqd_qaytarildi: naqdQaytarildi,
        p_hisob_id: p.hisob_id || null,
        p_izoh: p.izoh || "Tovar qaytarildi",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
        p_qatorlar: mappedQatorlar,
      });

      if (vozvratErr) {
        console.warn("fn_tovar_vozvrat_yaratish RPC xatosi, fallback:", vozvratErr.message);
        if (mijozId && qarzdanAyirildi > 0) {
          const client = getSupabase();
          const { data: curM } = await client.from("mijozlar").select("qarz_uzs, qarz_usd").eq("id", mijozId).maybeSingle();
          if (curM) {
            if (valyuta === "USD") {
              await client.from("mijozlar").update({ qarz_usd: Math.max(0, Number(curM.qarz_usd || 0) - qarzdanAyirildi) }).eq("id", mijozId);
            } else {
              await client.from("mijozlar").update({ qarz_uzs: Math.max(0, Number(curM.qarz_uzs || 0) - qarzdanAyirildi) }).eq("id", mijozId);
            }
          }
        }
        for (const it of mappedQatorlar) {
          if (it.tovar_id && it.soni > 0) {
            const client = getSupabase();
            const { data: curT } = await client.from("tovarlar").select("qoldiq").eq("id", it.tovar_id).maybeSingle();
            if (curT) {
              await client.from("tovarlar").update({ qoldiq: Number(curT.qoldiq || 0) + it.soni }).eq("id", it.tovar_id);
            }
          }
        }
      }

      const eskiQarz = p.selectedMijoz
        ? Number(valyuta === "USD" ? p.selectedMijoz.qarz_usd : p.selectedMijoz.qarz_uzs) || 0
        : 0;
      const yangiQarz = Math.max(0, eskiQarz - qarzdanAyirildi);

      let tovarlarRoyxatiMatn = mappedQatorlar
        .map((it: any) => `  📦 <b>${it.tovar_nomi}</b>: <code>${it.soni} dona</code> × <code>${pul(it.narx)}</code> = <b>${pul(it.summa)} ${valyuta}</b>`)
        .join("\n");

      javobMatn = `↩️ <b>TOVAR VOZVRAT (QAYTARISH) QABUL QILINDI</b>\n\n` +
        `👤 Mijoz: <b>${p.selectedMijoz?.nom || p.mijoz_nomi || "Chakana"}</b>\n` +
        `${tovarlarRoyxatiMatn}\n\n` +
        `💰 Jami vozvrat: <b>${pul(jami)} ${valyuta}</b>\n` +
        (qarzdanAyirildi > 0 ? `📉 Mijoz qarzidan chegirildi: <b>-${pul(qarzdanAyirildi)} ${valyuta}</b>\n` : "") +
        (p.selectedMijoz
          ? `📂 Eski qarz: ${pul(eskiQarz)} ${valyuta} ➔ <b>Yangi qarz: ${pul(yangiQarz)} ${valyuta}</b>\n`
          : "") +
        `📈 Do'konda tovar qoldig'i tiklandi (+${mappedQatorlar.reduce((s: number, i: any) => s + i.soni, 0)} dona)\n` +
        `✍️ Qabul qildi: <b>${fromName}</b>`;
    }

    // 1.8.F TOVAR KIRIMI
    else if (p.amal === "tovar_kirim") {
      const tovarNomi = (p.tovar_nomi || "").trim();
      if (!tovarNomi) {
        javobMatn = `⚠️ Tovar nomi aniqlanmadi.`;
      } else {
        const { data: mavjud } = await supabase
          .from("tovarlar")
          .select("*")
          .ilike("nom", tovarNomi)
          .limit(1)
          .maybeSingle();

        let yangiQoldiq = p.soni || 0;

        if (mavjud) {
          yangiQoldiq = (mavjud.qoldiq || 0) + (p.soni || 0);
          await supabase
            .from("tovarlar")
            .update({
              qoldiq: yangiQoldiq,
              tannarx: p.tannarx > 0 ? p.tannarx : mavjud.tannarx,
              narx_optom: p.narx_optom > 0 ? p.narx_optom : mavjud.narx_optom,
              valyuta: p.valyuta || mavjud.valyuta,
              faol: true,
            })
            .eq("id", mavjud.id);

          javobMatn = `✅ <b>DO'KONGA TOVAR QO'SHILDI</b>\n\n` +
            `📦 Tovar: <b>${mavjud.nom}</b>\n` +
            `➕ Kirim soni: <b>+${p.soni} ${p.birlik || mavjud.birlik || "dona"}</b>\n` +
            `📊 Do'kondagi yangi qoldiq: <b>${yangiQoldiq} ${mavjud.birlik || "dona"}</b>\n` +
            (p.tannarx > 0 ? `💲 Yangi tannarx: <b>${pul(p.tannarx)} ${p.valyuta || mavjud.valyuta}</b>\n` : "") +
            (p.narx_optom > 0 ? `💰 Yangi sotish narxi: <b>${pul(p.narx_optom)} ${p.valyuta || mavjud.valyuta}</b>\n` : "") +
            `✍️ Kiritdi: <b>${fromName}</b>`;
        } else {
          await getSupabase().from("tovarlar").insert({
            nom: tovarNomi,
            model: p.model || tovarNomi,
            birlik: p.birlik || "dona",
            qoldiq: p.soni || 0,
            tannarx: p.tannarx || 0,
            narx_optom: p.narx_optom || 0,
            valyuta: p.valyuta || "UZS",
            faol: true,
          });

          javobMatn = `✅ <b>YANGI TOVAR DO'KONGA KIRITILDI</b>\n\n` +
            `📦 Tovar: <b>${tovarNomi}</b>\n` +
            `🔢 Soni: <b>${p.soni} ${p.birlik || "dona"}</b>\n` +
            (p.tannarx > 0 ? `💲 Tannarx: <b>${pul(p.tannarx)} ${p.valyuta}</b>\n` : "") +
            (p.narx_optom > 0 ? `💰 Sotish (optom) narxi: <b>${pul(p.narx_optom)} ${p.valyuta}</b>\n` : "") +
            `✍️ Kiritdi: <b>${fromName}</b>`;
        }
      }
    }

    // 1.8.G PUL O'TKAZMA
    else if (p.amal === "pul_otkazma") {
      const { error: otkazmaErr } = await getSupabase().rpc("fn_pul_otkazish", {
        p_chiqim_hisob_id: p.chiqim_hisob_id,
        p_kirim_hisob_id: p.kirim_hisob_id,
        p_summa: p.jami_summa,
        p_valyuta: p.valyuta || "UZS",
        p_izoh: p.izoh || "O'tkazma",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      if (otkazmaErr) {
        console.error("fn_pul_otkazish xatosi:", otkazmaErr);
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + otkazmaErr.message });
        return res.status(200).send("OK");
      }

      const { data: hList } = await getSupabase().from("hisoblar").select("id, nom").in("id", [p.chiqim_hisob_id, p.kirim_hisob_id]);
      const getHNom = (id: string) => hList?.find((h: any) => h.id === id)?.nom || id;

      javobMatn = `✅ <b>PUL O'TKAZMA MUVAFFAQIYATLI BAJARILDI</b>\n\n` +
        `💰 Summa: <b>${pul(p.jami_summa)} ${p.valyuta || "UZS"}</b>\n` +
        `📤 Qayerdan: <b>${getHNom(p.chiqim_hisob_id)}</b>\n` +
        `📥 Qayerga: <b>${getHNom(p.kirim_hisob_id)}</b>\n` +
        `✍️ Bajardi: <b>${fromName}</b>`;
    }

    // 1.8.H KASSA BALANSINI TO'G'IRLASH (KORREKTIROVKA)
    else if (p.amal === "balans_sozlash") {
      const { data: hisoblarDB } = await getSupabase()
        .from("hisoblar")
        .select("id, nom, turi, valyuta")
        .eq("faol", true);

      if (!p.hisob_id) {
        const nextCard = buildBalansSozlashCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Iltimos, avval to'g'irlanadigan hisobni tanlang!" });
        return res.status(200).send("OK");
      }

      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const hisobNomi = tanlanganHisob?.nom || p.hisob_nomi || "Kassa";
      const yangiBalans = Number(p.yangi_balans) || 0;
      const valyuta = p.valyuta || tanlanganHisob?.valyuta || "UZS";
      const izoh = p.izoh || "Balans to'g'rilandi (korrektirovka)";

      // RPC chaqirib balansni to'g'irlaymiz
      const { data: rpcRes, error: rpcErr } = await getSupabase().rpc("fn_kassa_balans_sozlash", {
        p_hisob_id: p.hisob_id,
        p_yangi_balans: yangiBalans,
        p_izoh: izoh,
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      let eskiBalans = Number(p.joriy_balans || 0);

      if (rpcErr) {
        console.warn("fn_kassa_balans_sozlash RPC xatosi, to'g'ridan-to'g'ri yozish fallback:", rpcErr.message);
        const { data: curBal } = await getSupabase()
          .from("view_kassa_balans")
          .select("joriy_balans")
          .eq("hisob_id", p.hisob_id)
          .maybeSingle();

        if (curBal) eskiBalans = Number(curBal.joriy_balans || 0);
        const farq = yangiBalans - eskiBalans;

        if (farq !== 0) {
          const amalTur = farq > 0 ? "kirim" : "chiqim";
          await getSupabase().from("kassa_harakatlari").insert({
            amal: amalTur,
            summa: Math.abs(farq),
            valyuta: valyuta,
            manba_turi: "korrektirovka",
            manba_id: p.hisob_id,
            hisob_id: p.hisob_id,
            izoh: `${izoh} (${eskiBalans} ➔ ${yangiBalans})`,
          });
        }
      } else if (rpcRes && rpcRes.eski_balans !== undefined) {
        eskiBalans = Number(rpcRes.eski_balans);
      }

      const farq = yangiBalans - eskiBalans;
      let farqMatn = "";
      if (farq > 0) {
        farqMatn = `📈 Farq (Kirim): <b>+${pul(farq)} ${valyuta}</b>`;
      } else if (farq < 0) {
        farqMatn = `📉 Farq (Chiqim): <b>-${pul(Math.abs(farq))} ${valyuta}</b>`;
      } else {
        farqMatn = `⚖️ Farq: <b>0 ${valyuta} (O'zgarishsiz)</b>`;
      }

      javobMatn = `⚖️ <b>KASSA BALANSI MUVAFFAQIYATLI TO'G'IRLANDI</b>\n\n` +
        `🏦 Hisob: <b>${hisobNomi}</b>\n` +
        `📊 Eski balans: <code>${pul(eskiBalans)} ${valyuta}</code>\n` +
        `🎯 Yangi real balans: <b>${pul(yangiBalans)} ${valyuta}</b>\n` +
        `${farqMatn}\n` +
        `📝 Izoh: <i>${izoh}</i>\n` +
        `✍️ Sozladi: <b>${fromName} (Admin)</b>`;
    }

    // 1.8.G TANISHLAR QARZI (TASHQI QARZ) TASDIQLASH
    else if (p.amal === "tashqi_qarz") {
      const { data: hisoblarDB } = await getSupabase()
        .from("hisoblar")
        .select("id, nom, turi, valyuta")
        .eq("faol", true);

      // Agar yo'nalish belgilanmagan bo'lsa
      if (!p.kassaTanlandi && !p.hisob_id && !p.bevosita_oylik && !p.kassasiz) {
        const nextCard = buildTashqiQarzCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "Iltimos, avval mablag' yo'nalishini tanlang!",
        });
        return res.status(200).send("OK");
      }

      const valyuta = p.valyuta || "UZS";
      const { data: rpcRes, error: rpcErr } = await getSupabase().rpc("fn_tashqi_qarz_yaratish", {
        p_shaxs_nomi: p.shaxs_nomi,
        p_amal: p.qarz_amali || "oldim",
        p_summa: Number(p.summa),
        p_valyuta: valyuta,
        p_hisob_id: p.hisob_id || null,
        p_bevosita_oylik: !!p.bevosita_oylik,
        p_maqsad: p.maqsad || null,
        p_izoh: p.izoh || null,
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      if (rpcErr) {
        console.error("fn_tashqi_qarz_yaratish xatosi:", rpcErr);
        await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + rpcErr.message });
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: `❌ <b>Qarz yozuvini saqlashda xatolik:</b>\n<code>${rpcErr.message}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).send("OK");
      }

      const qarzAmali = p.qarz_amali || "oldim";
      const shaxsNomi = p.shaxs_nomi;
      const summa = Number(p.summa);

      let sarlavha = "";
      let tafsilot = "";
      let qoldiqSatr = "";

      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const hisobNomi = tanlanganHisob?.nom || "Kassa";

      let joylashuvMatn = "";
      if (p.bevosita_oylik) {
        joylashuvMatn = `💼 <b>Yo'nalish:</b> To'g'ridan-to'g'ri ishchiga (Oylik rasxodi yozildi)\n`;
      } else if (p.hisob_id) {
        const harakat = qarzAmali === "oldim" || qarzAmali === "qaytdi" ? "Kirim qilindi" : "Chiqim qilindi";
        joylashuvMatn = `🏦 <b>Kassa:</b> ${hisobNomi} (${harakat})\n`;
      } else {
        joylashuvMatn = `📝 <b>Hisob:</b> Kassaga aloqasiz (Qarz daftari)\n`;
      }

      if (qarzAmali === "oldim") {
        sarlavha = "✅ <b>QARZ OLINDI</b>";
        tafsilot = `👤 <b>Qarz beruvchi:</b> <b>${shaxsNomi}</b>\n➕ <b>Olingan summa:</b> <b>${pul(summa)} ${valyuta}</b>\n`;
        const qoldiq = rpcRes?.biz_berishimiz_kerak ?? summa;
        qoldiqSatr = `📊 <b>${shaxsNomi} oldidagi joriy qarzimiz:</b> <code>${pul(qoldiq)} ${valyuta}</code>\n`;
      } else if (qarzAmali === "qaytardim") {
        sarlavha = "✅ <b>QARZ QAYTARILDI</b>";
        tafsilot = `👤 <b>Qarz qaytarilgan shaxs:</b> <b>${shaxsNomi}</b>\n➖ <b>Qaytarilgan summa:</b> <b>${pul(summa)} ${valyuta}</b>\n`;
        const qoldiq = rpcRes?.biz_berishimiz_kerak ?? 0;
        qoldiqSatr = `📊 <b>${shaxsNomi} oldidagi qoldiq qarzimiz:</b> <code>${pul(qoldiq)} ${valyuta}</code>\n`;
      } else if (qarzAmali === "berdim") {
        sarlavha = "✅ <b>QARZ BERILDI</b>";
        tafsilot = `👤 <b>Qarz olgan shaxs:</b> <b>${shaxsNomi}</b>\n💸 <b>Berilgan summa:</b> <b>${pul(summa)} ${valyuta}</b>\n`;
        const qoldiq = rpcRes?.biz_olishimiz_kerak ?? summa;
        qoldiqSatr = `📊 <b>${shaxsNomi} bizga qaytarishi kerak:</b> <code>${pul(qoldiq)} ${valyuta}</code>\n`;
      } else if (qarzAmali === "qaytdi") {
        sarlavha = "✅ <b>BERILGAN QARZ QAYTDI</b>";
        tafsilot = `👤 <b>Qarzni qaytargan shaxs:</b> <b>${shaxsNomi}</b>\n📥 <b>Qaytarilgan summa:</b> <b>${pul(summa)} ${valyuta}</b>\n`;
        const qoldiq = rpcRes?.biz_olishimiz_kerak ?? 0;
        qoldiqSatr = `📊 <b>${shaxsNomi}ning qoldiq qarzi:</b> <code>${pul(qoldiq)} ${valyuta}</code>\n`;
      }

      javobMatn =
        `${sarlavha}\n\n` +
        `${tafsilot}` +
        `${joylashuvMatn}` +
        `${qoldiqSatr}` +
        (p.maqsad ? `💬 <b>Maqsad:</b> <i>${p.maqsad}</i>\n` : "") +
        (p.izoh ? `📝 <b>Izoh:</b> <i>${p.izoh}</i>\n` : "") +
        `✍️ Kiritdi: <b>${fromName}</b>`;
    }

    // 1.8.H BOSHQA KIRIM (DAROMAD / XIZMATLAR UCHUN TUSHUM) TASDIQLASH
    else if (p.amal === "boshqa_kirim") {
      const { data: hisoblarDB } = await getSupabase()
        .from("hisoblar")
        .select("id, nom, turi, valyuta")
        .eq("faol", true);

      // Agar hisob belgilanmagan bo'lsa
      if (!p.hisob_id) {
        const nextCard = buildBoshqaKirimCard(draftId, p, hisoblarDB || []);
        await tgPost("editMessageText", {
          chat_id: chatId,
          message_id: msgId,
          text: nextCard.text,
          parse_mode: "HTML",
          reply_markup: nextCard.keyboard,
        });
        await tgPost("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "Iltimos, avval kirim hisobini tanlang!",
        });
        return res.status(200).send("OK");
      }

      const valyuta = p.valyuta || "UZS";
      const summa = Number(p.summa || p.jami_summa) || 0;
      const tanlanganHisob = hisoblarDB?.find((h: any) => h.id === p.hisob_id);
      const hisobNomi = tanlanganHisob?.nom || "Kassa";
      const kategoriya = p.kategoriya || "Boshqa daromad";

      // RPC chaqirish (yoki fallback to'g'ridan-to'g'ri yozish)
      const { error: rpcErr } = await getSupabase().rpc("fn_boshqa_kirim_yaratish", {
        p_summa: summa,
        p_valyuta: valyuta,
        p_kategoriya: kategoriya,
        p_manba_nomi: p.manba_nomi || null,
        p_hisob_id: p.hisob_id,
        p_izoh: p.izoh || "",
        p_xodim: fromName,
        p_telegram_user_id: cq.from?.id,
      });

      if (rpcErr) {
        console.warn("fn_boshqa_kirim_yaratish RPC xatosi, fallback to'g'ridan-to'g'ri yozish:", rpcErr.message);

        // Fallback: boshqa_kirimlar jadvaliga yozish
        const { data: bData } = await getSupabase()
          .from("boshqa_kirimlar")
          .insert({
            summa: summa,
            valyuta: valyuta,
            kategoriya: kategoriya,
            manba_nomi: p.manba_nomi || null,
            hisob_id: p.hisob_id,
            izoh: p.izoh || "",
            xodim: fromName,
            telegram_user_id: cq.from?.id,
          })
          .select("id")
          .maybeSingle();

        const kirimId = bData?.id || p.hisob_id;
        let izohMatn = kategoriya;
        if (p.manba_nomi) izohMatn += ` (${p.manba_nomi})`;
        if (p.izoh) izohMatn += `: ${p.izoh}`;

        // kassa_harakatlariga kirim yozish
        await getSupabase().from("kassa_harakatlari").insert({
          hisob_id: p.hisob_id,
          kassa_turi: tanlanganHisob?.turi || "naqd",
          amal: "kirim",
          summa: summa,
          valyuta: valyuta,
          manba_turi: "boshqa_kirim",
          manba_id: kirimId,
          izoh: izohMatn,
        });
      }

      javobMatn =
        `✅ <b>MABLAG' KASSA HISOBIGA KIRIM QILINDI</b>\n\n` +
        `💵 Summa: <b>${pul(summa)} ${valyuta}</b>\n` +
        `📂 Kategoriya: <b>${kategoriya}</b>\n` +
        (p.manba_nomi ? `👤 Manba: <b>${p.manba_nomi}</b>\n` : "") +
        `🏦 Kirim hisobi: <b>${hisobNomi}</b>\n` +
        (p.izoh ? `💬 Izoh: <i>${p.izoh}</i>\n` : "") +
        `✍️ Kiritdi: <b>${fromName}</b>`;
    }

    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: javobMatn,
      parse_mode: "HTML",
    });

    if (GROUP_CHAT_ID && String(GROUP_CHAT_ID) !== String(chatId)) {
      await tgPost("sendMessage", {
        chat_id: GROUP_CHAT_ID,
        text: javobMatn,
        parse_mode: "HTML",
      });
    }

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Muvaffaqiyatli saqlandi!" });
    return res.status(200).send("OK");
  }

  // 1.9 BEKOR QILISH (cn:draftId)
  if (data.startsWith("cn:")) {
    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "❌ <i>Amal bekor qilindi. Baza o'zgartirilmadi.</i>",
      parse_mode: "HTML",
    });
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Bekor qilindi" });
    return res.status(200).send("OK");
  }

  // 1.10 TOVARLARNI OPTIMALLASHTIRISH (opt:run)
  if (data === "opt:run") {
    const senderId = String(cq.from?.id || "");
    const perm = await checkUserPermission(senderId);
    if (perm.role !== "admin") {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Faqat admin uchun!", show_alert: true });
      return res.status(200).send("OK");
    }

    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "⏳ <b>Tovarlar bazasi tahlil qilinmoqda va birlashtirilmoqda...</b>\n\n<i>Har bir model bo'yicha ranglar qoldig'i hisoblanmoqda, iltimos kuting...</i>",
      parse_mode: "HTML",
    });

    const optResult = await runTovarlarniOptimallashtirish();
    const reportText = buildOptimizationReport(optResult);

    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: reportText,
      parse_mode: "HTML",
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Optimallashtirish yakunlandi!" });
    return res.status(200).send("OK");
  }

  // 1.11 XODIM RUXSATINI TASDIQLASH (xod:appr:draftId:role)
  if (data.startsWith("xod:appr:")) {
    const parts = data.split(":");
    const draftId = parts[2];
    const role = parts[3] || "sotuvchi";

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft || !draft.malumot) {
      await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "So'rov muddati o'tgan yoki topilmadi." });
      return res.status(200).send("OK");
    }

    const req = draft.malumot;

    const { data: mavjudXodim } = await supabase
      .from("xodimlar")
      .select("id")
      .or(`telegram_id.eq.${req.telegram_id},telefon.eq.${req.telefon}`)
      .maybeSingle();

    if (mavjudXodim) {
      await supabase
        .from("xodimlar")
        .update({
          telegram_id: req.telegram_id,
          ism: req.ism,
          telefon: req.telefon,
          telegram_username: req.username || null,
          rol: role,
          faol: true,
        })
        .eq("id", mavjudXodim.id);
    } else {
      await getSupabase().from("xodimlar").insert({
        telegram_id: req.telegram_id,
        ism: req.ism,
        telefon: req.telefon,
        telegram_username: req.username || null,
        rol: role,
        faol: true,
      });
    }

    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: `✅ <b>Xodim tasdiqlandi!</b>\n\n👤 <b>Ism:</b> ${req.ism} ${req.username || ""}\n📞 <b>Tel:</b> <code>${req.telefon}</code>\n🎭 <b>Roli:</b> <b>${role === "admin" ? "👑 Admin" : "💼 Sotuvchi"}</b>\n✍️ <b>Tasdiqladi:</b> ${fromName}`,
      parse_mode: "HTML",
    });

    await tgPost("sendMessage", {
      chat_id: req.telegram_id,
      text: `🎉 <b>Assalomu alaykum, ${req.ism}!</b>\n\nAdministrator sizga PROMAX tizimidan foydalanish uchun ruxsat berdi.\n🎭 Sizning rolingiz: <b>${role === "admin" ? "👑 Administrator" : "💼 Sotuvchi"}</b>.\n\nEndi botga ovozli/matnli xabar yuborishingiz yoki do'kon Mini App ilovasidan to'liq foydalanishingiz mumkin!`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });

    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Xodim muvaffaqiyatli qabul qilindi!" });
    return res.status(200).send("OK");
  }

  // 1.12 XODIM RUXSATINI RAD ETISH (xod:rej:draftId)
  if (data.startsWith("xod:rej:")) {
    const parts = data.split(":");
    const draftId = parts[2];

    const { data: draft } = await supabase
      .from("tranzaksiya_qoralama")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (draft && draft.malumot) {
      await tgPost("sendMessage", {
        chat_id: draft.malumot.telegram_id,
        text: `❌ <b>Kechirasiz, administrator ruxsat so'rovingizni rad etdi.</b>\n\nSavollar bo'lsa, do'kon ma'muriyati bilan bog'laning.`,
        parse_mode: "HTML",
      });
    }

    await tgPost("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: `❌ <i>Xodimning ruxsat so'rovi rad etildi.</i>`,
      parse_mode: "HTML",
    });
    await tgPost("answerCallbackQuery", { callback_query_id: cq.id, text: "Rad etildi" });
    return res.status(200).send("OK");
  }

  return res.status(200).send("OK");
}
