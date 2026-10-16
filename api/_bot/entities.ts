import { getSupabase, supabase, ADMIN_TELEGRAM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, pul } from "./config";

// -----------------------------------------------------------------------------
// AQLLI ENTITY ANIQLASHTIRISH (SAVDO, VOZVRAT, QARZ TO'LOV, QARZ ESLATMA)
// -----------------------------------------------------------------------------

export async function resolveSavdoEntities(data: any): Promise<any> {
  const client = getSupabase();
  if (!client) return data;

  // 1. Mijozni aniqlash
  if (data.mijoz_nomi && String(data.mijoz_nomi).trim()) {
    try {
      const { data: mList } = await client.rpc("fn_ai_mijoz_qidirish", {
        qidiruv_sozi: String(data.mijoz_nomi).trim(),
      });

      if (mList && mList.length > 0) {
        const topSim = Number(mList[0].oxshashlik) || 0;
        const secondSim = Number(mList[1]?.oxshashlik) || 0;

        // Bitta yaqqol kuchli moslik bormi? (oxshashlik >= 0.75 va boshqasidan ancha oldinda)
        if (topSim >= 0.75 && (mList.length === 1 || (topSim - secondSim) >= 0.2)) {
          data.selectedMijoz = mList[0];
          data.mijozStatus = "resolved";
        } else {
          data.selectedMijoz = null;
          data.mijozStatus = "ambiguous";
          data.mijozCandidates = mList.slice(0, 4);
        }
      } else {
        data.selectedMijoz = null;
        data.mijozStatus = "not_found";
      }
    } catch (e) {
      console.error("Mijoz qidirish xatosi:", e);
      data.mijozStatus = "resolved";
    }
  } else {
    data.selectedMijoz = null;
    data.mijozStatus = "resolved"; // Chakana
  }

  // 2. Tovarlarni aniqlash
  data.qatorlar = Array.isArray(data.qatorlar) ? data.qatorlar : [];
  if (data.qatorlar.length === 0 && Number(data.jami_summa || 0) > 0) {
    data.qatorlar = [
      {
        nom: data.izoh || "Mahsulot",
        soni: 1,
        narx: Number(data.jami_summa),
      },
    ];
  } else if (data.qatorlar.length === 1 && Number(data.jami_summa || 0) > 0) {
    const first = data.qatorlar[0];
    first.soni = Number(first.soni) || 1;
    if (!Number(first.narx)) {
      first.narx = Math.round((Number(data.jami_summa) / first.soni) * 100) / 100;
    }
  }

  for (const it of data.qatorlar) {
    it.soni = Number(it.soni) || 1;
    it.narx = Number(it.narx) || 0;
    if (it.nom && !it.status) {
      try {
        const { data: tList } = await client.rpc("fn_ai_tovar_qidirish", {
          qidiruv_sozi: String(it.nom).trim(),
        });

        if (tList && tList.length > 0) {
          const topT = Number(tList[0].oxshashlik) || 0;
          const secondT = Number(tList[1]?.oxshashlik) || 0;

          // Maxsus: Agar topilgan tovarlar bitta modelga (artikulga) tegishli bo'lsa (RANGLAR)
          const itNomLower = String(it.nom).trim().toLowerCase();
          const firstModel = (tList[0].model || "").trim();
          const sameModelList = firstModel
            ? tList.filter((t: any) => (t.model || "").trim().toLowerCase() === firstModel.toLowerCase())
            : [];

          const isColorVariation = firstModel && (
            sameModelList.length === tList.length || 
            sameModelList.length >= 2 || 
            firstModel.toLowerCase() === itNomLower ||
            itNomLower.includes(firstModel.toLowerCase()) ||
            firstModel.toLowerCase().includes(itNomLower)
          );

          if (isColorVariation) {
            // Sotuvchidan rang so'rab o'tirmaymiz! Model nomi bilan avtomatik tasdiqlaymiz
            const modelTovarlar = sameModelList.length > 0 ? sameModelList : tList;
            const jamiModelQoldiq = modelTovarlar.reduce((sum: number, t: any) => sum + (Number(t.qoldiq) || 0), 0);
            
            // Asosiy tovar qilib eng ko'p qoldig'i bor tovar tanlanadi
            const bestT = [...modelTovarlar].sort((a: any, b: any) => (Number(b.qoldiq) || 0) - (Number(a.qoldiq) || 0))[0] || tList[0];
            
            it.tovar_id = bestT.id;
            it.aniq_nom = firstModel || bestT.nom;
            it.qoldiq = jamiModelQoldiq;
            it.birlik = bestT.birlik || "dona";
            if (!it.narx && Number(bestT.narx_optom) > 0) {
              it.narx = Number(bestT.narx_optom);
            }
            it.status = "resolved";
          } else if (topT >= 0.75 && (tList.length === 1 || (topT - secondT) >= 0.25)) {
            it.tovar_id = tList[0].id;
            it.aniq_nom = tList[0].nom;
            it.qoldiq = Number(tList[0].qoldiq) || 0;
            it.birlik = tList[0].birlik || "dona";
            if (!it.narx && Number(tList[0].narx_optom) > 0) {
              it.narx = Number(tList[0].narx_optom);
            }
            it.status = "resolved";
          } else {
            it.status = "ambiguous";
            it.candidates = tList.slice(0, 4);
          }
        } else {
          it.status = "resolved";
          it.tovar_id = null;
          it.aniq_nom = it.nom;
        }
      } catch (e) {
        console.error("Tovar qidirish xatosi:", e);
        it.status = "resolved";
        it.tovar_id = null;
        it.aniq_nom = it.nom;
      }
    }
  }

  return data;
}

export async function resolveQarzTolovEntities(data: any): Promise<any> {
  const client = getSupabase();
  if (!client || !data.mijoz_nomi) return data;

  try {
    const { data: mList } = await client.rpc("fn_ai_mijoz_qidirish", {
      qidiruv_sozi: String(data.mijoz_nomi).trim(),
    });

    if (mList && mList.length > 0) {
      const topSim = Number(mList[0].oxshashlik) || 0;
      const secondSim = Number(mList[1]?.oxshashlik) || 0;

      if (topSim >= 0.75 && (mList.length === 1 || (topSim - secondSim) >= 0.2)) {
        data.selectedMijoz = mList[0];
        data.mijozStatus = "resolved";
      } else {
        data.selectedMijoz = null;
        data.mijozStatus = "ambiguous";
        data.mijozCandidates = mList.slice(0, 4);
      }
    } else {
      data.selectedMijoz = null;
      data.mijozStatus = "not_found";
    }
  } catch (e) {
    console.error("Qarz to'lovida mijoz qidirish xatosi:", e);
    data.mijozStatus = "resolved";
  }

  return data;
}

export async function resolveQarzEslatmaEntities(data: any): Promise<any> {
  const client = getSupabase();
  if (!client || !data.mijoz_nomi) return data;

  try {
    const { data: mList } = await client.rpc("fn_ai_mijoz_qidirish", {
      qidiruv_sozi: String(data.mijoz_nomi).trim(),
    });

    if (mList && mList.length > 0) {
      const topSim = Number(mList[0].oxshashlik) || 0;
      const secondSim = Number(mList[1]?.oxshashlik) || 0;

      if (topSim >= 0.75 && (mList.length === 1 || (topSim - secondSim) >= 0.2)) {
        data.selectedMijoz = mList[0];
        data.mijozStatus = "resolved";
      } else {
        data.selectedMijoz = null;
        data.mijozStatus = "ambiguous";
        data.mijozCandidates = mList.slice(0, 4);
      }
    } else {
      data.selectedMijoz = null;
      data.mijozStatus = "not_found";
    }
  } catch (e) {
    console.error("Qarz eslatmasida mijoz qidirish xatosi:", e);
    data.mijozStatus = "resolved";
  }

  return data;
}

// -----------------------------------------------------------------------------
// FOYDALANUVCHI RUXSATINI TEKSHIRISH
// -----------------------------------------------------------------------------
export async function checkUserPermission(
  telegramId?: number | string
): Promise<{ isAllowed: boolean; role: string; xodim?: any }> {
  if (!telegramId) return { isAllowed: false, role: "" };
  const idStr = String(telegramId);

  // 1. Netlify / Vercel muhit o'zgaruvchisidagi ADMIN_TELEGRAM_ID
  if (ADMIN_TELEGRAM_ID) {
    const adminIds = ADMIN_TELEGRAM_ID.split(",").map((s: string) => s.trim());
    if (adminIds.includes(idStr)) {
      return { isAllowed: true, role: "admin" };
    }
  }

  // 2. Supabase xodimlar jadvali
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const numId = Number(telegramId);
      const { data: x } = await supabase
        .from("xodimlar")
        .select("*")
        .eq("telegram_id", !isNaN(numId) ? numId : telegramId)
        .eq("faol", true)
        .maybeSingle();

      if (x) {
        return { isAllowed: true, role: x.rol || "sotuvchi", xodim: x };
      }
    } catch (e) {
      console.error("Xodim ruxsatini tekshirish xatosi:", e);
    }
  }

  return { isAllowed: false, role: "" };
}

// -----------------------------------------------------------------------------
// TOVARLARNI MODELLAR BO'YICHA OPTIMALLASHTIRISH (RANGLARNI BIRLASHTIRISH)
// -----------------------------------------------------------------------------
export async function runTovarlarniOptimallashtirish(): Promise<{
  ok: boolean;
  rpcUsed: boolean;
  summary: Array<{ model: string; count: number; totalStock: number }>;
  error?: string;
}> {
  const client = getSupabase();
  if (!client) {
    return { ok: false, rpcUsed: false, summary: [], error: "Supabase bilan aloqa o'rnatilmadi" };
  }

  // 1. Agar DB da fn_tovarlarni_model_boyicha_birlashtirish RPC funksiyasi bo'lsa
  try {
    const { data: rpcData, error: rpcErr } = await client.rpc("fn_tovarlarni_model_boyicha_birlashtirish");
    if (!rpcErr && Array.isArray(rpcData)) {
      return {
        ok: true,
        rpcUsed: true,
        summary: rpcData.map((r: any) => ({
          model: r.model_nomi,
          count: Number(r.birlashgan_ranglar_soni) || 0,
          totalStock: Number(r.jami_yangi_qoldiq) || 0,
        })),
      };
    }
  } catch (e) {
    // RPC xato bersa to'g'ridan-to'g'ri TypeScript fallback ga o'tamiz
  }

  // 2. TypeScript to'g'ridan-to'g'ri konsolidatsiya
  try {
    const { data: allTovarlar, error: fetchErr } = await client
      .from("tovarlar")
      .select("id, nom, model, qoldiq, narx_optom, tannarx, narx_chakana, valyuta, birlik, yaratilgan")
      .eq("faol", true);

    if (fetchErr) {
      return { ok: false, rpcUsed: false, summary: [], error: fetchErr.message };
    }

    const modelGroups = new Map<string, any[]>();
    for (const t of (allTovarlar || [])) {
      const m = (t.model || "").trim();
      if (!m) continue;
      const key = m.toLowerCase();
      if (!modelGroups.has(key)) {
        modelGroups.set(key, []);
      }
      modelGroups.get(key)!.push(t);
    }

    const summary: Array<{ model: string; count: number; totalStock: number }> = [];

    for (const [, items] of modelGroups.entries()) {
      if (items.length <= 1) continue;

      items.sort((a, b) => (Number(b.qoldiq) || 0) - (Number(a.qoldiq) || 0));
      const mainItem = items[0];
      const otherItems = items.slice(1);

      const totalStock = items.reduce((sum, it) => sum + (Number(it.qoldiq) || 0), 0);
      const modelName = mainItem.model.trim();

      const { error: updMainErr } = await client
        .from("tovarlar")
        .update({
          nom: modelName,
          model: modelName,
          qoldiq: totalStock,
          faol: true,
        })
        .eq("id", mainItem.id);

      if (updMainErr) {
        console.error(`Xato: ${modelName} asosiy tovarini yangilashda:`, updMainErr);
        continue;
      }

      const otherIds = otherItems.map((it) => it.id);
      await client
        .from("tovarlar")
        .update({
          faol: false,
          qoldiq: 0,
        })
        .in("id", otherIds);

      summary.push({
        model: modelName,
        count: items.length,
        totalStock,
      });
    }

    return { ok: true, rpcUsed: false, summary };
  } catch (err: any) {
    return { ok: false, rpcUsed: false, summary: [], error: err?.message || String(err) };
  }
}

export function buildOptimizationReport(res: { ok: boolean; summary: Array<{ model: string; count: number; totalStock: number }>; error?: string }): string {
  if (!res.ok) {
    return `❌ <b>Optimallashtirishda xatolik yuz berdi:</b>\n<code>${res.error || "Noma'lum xatolik"}</code>`;
  }

  if (res.summary.length === 0) {
    return (
      `✅ <b>Tovarlar bazasi allaqachon toza!</b>\n\n` +
      `Birlashtirilishi kerak bo'lgan dublikat ranglar topilmadi. Har bir model yagona mahsulot sifatida saqlanmoqda.`
    );
  }

  const jamiModellar = res.summary.length;
  const jamiRanglar = res.summary.reduce((s, it) => s + it.count, 0);

  let list = res.summary
    .slice(0, 25)
    .map(
      (it, idx) =>
        `${idx + 1}. <b>${it.model}</b>: ${it.count} ta rang birlashtirildi (jami qoldiq: <b>${pul(it.totalStock)} dona</b>)`
    )
    .join("\n");

  if (res.summary.length > 25) {
    list += `\n<i>...va yana ${res.summary.length - 25} ta model birlashtirildi.</i>`;
  }

  return (
    `🎉 <b>TOVARLAR BAZASI OPTIMALLASHTIRILDI!</b>\n\n` +
    `📊 <b>Natijalar:</b>\n` +
    `• Birlashtirilgan modellar: <b>${jamiModellar} ta</b>\n` +
    `• Jamlangan ranglar soni: <b>${jamiRanglar} ta</b>\n\n` +
    `📋 <b>Birlashtirilgan modellar ro'yxati:</b>\n${list}\n\n` +
    `✨ <i>Endi do'kon va botda faqat bitta umumiy mahsulot ko'rinadi, ortiqcha ranglar so'ralmaydi va umumiy qoldiq ko'rsatiladi!</i>`
  );
}
