# -*- coding: utf-8 -*-
"""
Rasxod moduli — botda rasxod kiritish (hisobot kodiga tegmaydi).

Oqim: /rasxod → summa → kategoriya → izoh (yoki «O'tkazib yuborish») → tasdiqlash.
Kategoriyalarni rahbar istalgan vaqtda qo'sha oladi (/kategoriya).
Barcha rasxodlar AinurPOS'da emas, botning o'z `rasxod` jadvalida saqlanadi.
"""
import logging
import re
import warnings
from html import escape as _escape

from telegram import InlineKeyboardButton as IB, InlineKeyboardMarkup as IM, Update
from telegram.constants import ChatType, ParseMode
from telegram.ext import (CallbackQueryHandler, CommandHandler, ContextTypes,
                          ConversationHandler, MessageHandler, filters)

import config
import db

from telegram.warnings import PTBUserWarning

warnings.filterwarnings("ignore", category=PTBUserWarning)  # per_message ogohlantirishi
log = logging.getLogger("promax.rasxod")
HTML = ParseMode.HTML
SUMMA, KATEGORIYA, IZOH, TASDIQ, YANGI_KAT = range(10, 15)

BTN_RASXOD = "🧾 Rasxod qo'shish"


def escape(s):
    return _escape(str(s), quote=False)


def pul(x):
    return f"{int(round(x or 0)):,}".replace(",", " ")


def summa_oqi(matn):
    """
    Summani o'qish: faqat raqam qabul qilinadi.
    Qabul qilinadi: 45000 · 45 000 · 45.000 · 45,5 mln · 250 ming · 300k
    Noto'g'ri bo'lsa None.
    """
    s = str(matn).lower().replace("\u00a0", "").replace(" ", "")
    for v in ("so'm", "som", "sum", "сум", "uzs"):
        s = s.replace(v, "")
    kop = 1
    for suf, k in (("million", 10**6), ("mln", 10**6), ("млн", 10**6), ("m", 10**6),
                   ("ming", 10**3), ("тыс", 10**3), ("k", 10**3)):
        if s.endswith(suf):
            s, kop = s[: -len(suf)], k
            break
    s = s.replace(",", ".") if kop > 1 else s.replace(",", "").replace(".", "")
    if not re.fullmatch(r"\d+(\.\d+)?", s or ""):
        return None
    v = round(float(s) * kop)
    return v if 0 < v < 10**12 else None


def _kat_tugmalar(prefiks="rk"):
    """Kategoriya tugmalari — ikki ustunda."""
    kat = db.kategoriyalar()
    qator, joriy = [], []
    for k in kat:
        joriy.append(IB(k["nom"], callback_data=f"{prefiks}:{k['id']}"))
        if len(joriy) == 2:
            qator.append(joriy)
            joriy = []
    if joriy:
        qator.append(joriy)
    qator.append([IB("➕ Yangi kategoriya", callback_data=f"{prefiks}:yangi")])
    qator.append([IB("✖️ Bekor qilish", callback_data=f"{prefiks}:bekor")])
    return IM(qator)


def rasxod_matn(r, sarlavha="🧾 <b>RASXOD</b>"):
    """Rasxod xabari (guruh va tasdiqlash uchun bir xil ko'rinish)."""
    L = [f"{sarlavha} #{r['id']}" if r.get("id") else sarlavha,
         f"💵 <b>{pul(r['summa'])} {config.VALYUTA}</b>",
         f"📂 {escape(r['kategoriya'])}"]
    if r.get("izoh"):
        L.append(f"💬 {escape(r['izoh'])}")
    L.append(f"✍️ {escape(r.get('kim') or '')} · {r['sana'][8:10]}.{r['sana'][5:7]} {r['vaqt']}")
    if r.get("bekor"):
        L = [f"<s>{x}</s>" for x in L] + ["❌ <b>BEKOR QILINDI</b>"]
    return "\n".join(L)


# --- Suhbat ---------------------------------------------------------------------------------
def moduli(ruxsat, adminmi, hozir, guruh_id, menyu):
    """
    Handlerlarni yasash.
      ruxsat(update, context) -> bool   — foydalanuvchiga ruxsat bormi
      adminmi(context, chat_id, uid)    — guruh admini
      hozir() -> datetime               — Toshkent vaqti
      guruh_id() -> int|None            — hisobot guruhi
      menyu() -> ReplyKeyboardMarkup    — asosiy menyu
    """

    async def boshla(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not await ruxsat(update, context):
            return ConversationHandler.END
        context.user_data["r"] = {}
        await update.effective_message.reply_text(
            "🧾 <b>Yangi rasxod</b>\n\nSummani kiriting (faqat raqam):\n"
            "<i>masalan 45000 · 45 000 · 250 ming</i>", parse_mode=HTML,
            reply_markup=IM([[IB("✖️ Bekor qilish", callback_data="rk:bekor")]]))
        return SUMMA

    async def summa(update: Update, context: ContextTypes.DEFAULT_TYPE):
        v = summa_oqi(update.message.text)
        if not v:
            await update.message.reply_text(
                "❗ Summa faqat raqam bo'lishi kerak. Qaytadan kiriting:\n"
                "<i>masalan 45000</i>", parse_mode=HTML)
            return SUMMA
        context.user_data.setdefault("r", {})["summa"] = v
        await update.message.reply_text(
            f"💵 Summa: <b>{pul(v)} {config.VALYUTA}</b>\n\nKategoriyani tanlang:",
            parse_mode=HTML, reply_markup=_kat_tugmalar())
        return KATEGORIYA

    async def kategoriya(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        tan = q.data.split(":")[1]
        if tan == "bekor":
            context.user_data.pop("r", None)
            await q.edit_message_text("✖️ Rasxod kiritish bekor qilindi.")
            return ConversationHandler.END
        if tan == "yangi":
            await q.edit_message_text("➕ Yangi kategoriya nomini yozing:\n"
                                      "<i>masalan: Kommunal</i>", parse_mode=HTML)
            return YANGI_KAT
        k = db.kategoriya_ol(int(tan))
        if not k:
            await q.edit_message_text("Kategoriya topilmadi. Qaytadan tanlang:",
                                      reply_markup=_kat_tugmalar())
            return KATEGORIYA
        context.user_data["r"]["kategoriya"] = k["nom"]
        await q.edit_message_text(f"📂 Kategoriya: <b>{escape(k['nom'])}</b>", parse_mode=HTML)
        return await izoh_sora(update, context)

    async def yangi_kat(update: Update, context: ContextTypes.DEFAULT_TYPE):
        nom = re.sub(r"\s+", " ", update.message.text).strip()
        if len(nom) < 2 or len(nom) > 40:
            await update.message.reply_text("❗ Nom 2–40 belgidan iborat bo'lsin. Qaytadan yozing:")
            return YANGI_KAT
        kid, yangimi = db.kategoriya_qosh(nom)
        k = db.kategoriya_ol(kid)
        context.user_data["r"]["kategoriya"] = k["nom"]
        sarlavha = "✅ Yangi kategoriya qo'shildi" if yangimi else "📂 Kategoriya"
        await update.message.reply_text(f"{sarlavha}: <b>{escape(k['nom'])}</b>", parse_mode=HTML)
        return await izoh_sora(update, context)

    async def izoh_sora(update, context):
        await update.effective_chat.send_message(
            "💬 Izoh bormi? Qo'lda yozing yoki o'tkazib yuboring:",
            reply_markup=IM([[IB("⏭ O'tkazib yuborish", callback_data="ri:yoq")],
                             [IB("✖️ Bekor qilish", callback_data="ri:bekor")]]))
        return IZOH

    async def izoh_matn(update: Update, context: ContextTypes.DEFAULT_TYPE):
        context.user_data["r"]["izoh"] = update.message.text.strip()[:200]
        return await tasdiq_sora(update, context)

    async def izoh_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        if q.data.endswith("bekor"):
            context.user_data.pop("r", None)
            await q.edit_message_text("✖️ Rasxod kiritish bekor qilindi.")
            return ConversationHandler.END
        context.user_data["r"]["izoh"] = ""
        await q.edit_message_text("💬 Izohsiz")
        return await tasdiq_sora(update, context)

    async def tasdiq_sora(update, context):
        r = context.user_data["r"]
        izoh = f" — «{escape(r['izoh'])}» izohi bilan" if r.get("izoh") else ", izohsiz"
        await update.effective_chat.send_message(
            f"Siz <b>{pul(r['summa'])} {config.VALYUTA}</b> ni "
            f"<b>{escape(r['kategoriya'])}</b> kategoriyasiga{izoh} qo'shmoqchimisiz?",
            parse_mode=HTML,
            reply_markup=IM([[IB("✅ Ha, saqlansin", callback_data="rt:ha"),
                              IB("❌ Yo'q", callback_data="rt:yoq")]]))
        return TASDIQ

    async def tasdiq(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        if q.data.endswith("yoq"):
            context.user_data.pop("r", None)
            await q.edit_message_text("❌ Saqlanmadi.")
            return ConversationHandler.END
        r = context.user_data.pop("r")
        now = hozir()
        kim = q.from_user.full_name
        rid = db.rasxod_qosh(now.date().isoformat(), now.strftime("%H:%M"), r["summa"],
                             r["kategoriya"], r.get("izoh", ""), kim, q.from_user.id,
                             now.strftime("%Y-%m-%d %H:%M:%S"))
        yozuv = db.rasxod_ol(rid)
        await q.edit_message_text(rasxod_matn(yozuv, "✅ <b>RASXOD SAQLANDI</b>"), parse_mode=HTML,
                                  reply_markup=IM([[IB("❌ Bekor qilish",
                                                       callback_data=f"rb:{rid}")]]))
        await update.effective_chat.send_message("Yana rasxod qo'shish: /rasxod",
                                                 reply_markup=menyu())
        gid = guruh_id()
        if gid:  # guruhga ham tushsin
            try:
                await context.bot.send_message(gid, rasxod_matn(yozuv), parse_mode=HTML)
            except Exception as e:
                log.error("Rasxod guruhga yuborilmadi: %s", e)
        return ConversationHandler.END

    async def tugma_kuting(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text("Yuqoridagi tugmalardan birini bosing yoki /bekor.")

    async def bekor_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
        context.user_data.pop("r", None)
        await update.message.reply_text("✖️ Bekor qilindi.", reply_markup=menyu())
        return ConversationHandler.END

    # --- Suhbatdan tashqari ---
    async def bekor_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Saqlangan rasxodni bekor qilish (o'zi kiritgan yoki guruh admini)."""
        q = update.callback_query
        rid = int(q.data.split(":")[1])
        r = db.rasxod_ol(rid)
        if not r or r["bekor"]:
            await q.answer("Allaqachon bekor qilingan.", show_alert=True)
            return
        ozi = r["kim_id"] == q.from_user.id
        if not ozi and not await adminmi(context, guruh_id(), q.from_user.id):
            await q.answer("Faqat o'zingiz kiritgan rasxodni bekor qila olasiz.", show_alert=True)
            return
        db.rasxod_bekor(rid)
        await q.answer("Bekor qilindi")
        await q.edit_message_text(rasxod_matn(db.rasxod_ol(rid)), parse_mode=HTML)

    async def kategoriya_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """/kategoriya — kategoriyalarni ko'rish, qo'shish va o'chirish."""
        if not await ruxsat(update, context):
            return
        kat = db.kategoriyalar()
        if context.args:  # /kategoriya Kommunal — darhol qo'shish
            kid, yangimi = db.kategoriya_qosh(" ".join(context.args))
            k = db.kategoriya_ol(kid)
            await update.message.reply_text(
                ("✅ Qo'shildi: " if yangimi else "ℹ️ Allaqachon bor: ") + k["nom"])
            return
        tugma = [[IB(f"🗑 {k['nom']}", callback_data=f"rd:{k['id']}")] for k in kat]
        await update.message.reply_text(
            "📂 <b>Rasxod kategoriyalari</b>\n" + "\n".join(f"• {escape(k['nom'])}" for k in kat) +
            "\n\nYangi qo'shish: <code>/kategoriya Kommunal</code>\n"
            "Pastdagi tugma — ro'yxatdan olib tashlaydi (eski rasxodlar saqlanadi).",
            parse_mode=HTML, reply_markup=IM(tugma))

    async def kategoriya_ochir(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        k = db.kategoriya_ol(int(q.data.split(":")[1]))
        if not k:
            await q.answer("Topilmadi", show_alert=True)
            return
        db.kategoriya_ochir(k["id"])
        await q.answer(f"«{k['nom']}» olib tashlandi")
        qolgan = db.kategoriyalar()
        await q.edit_message_text(
            "📂 <b>Rasxod kategoriyalari</b>\n" + "\n".join(f"• {escape(x['nom'])}" for x in qolgan),
            parse_mode=HTML,
            reply_markup=IM([[IB(f"🗑 {x['nom']}", callback_data=f"rd:{x['id']}")] for x in qolgan]))

    shaxsiy = filters.ChatType.PRIVATE
    matn = shaxsiy & filters.TEXT & ~filters.COMMAND
    suhbat = ConversationHandler(
        entry_points=[CommandHandler("rasxod", boshla, shaxsiy),
                      MessageHandler(shaxsiy & filters.Text([BTN_RASXOD]), boshla)],
        states={
            SUMMA: [CallbackQueryHandler(kategoriya, pattern=r"^rk:bekor$"),
                    MessageHandler(matn, summa)],
            KATEGORIYA: [CallbackQueryHandler(kategoriya, pattern=r"^rk:"),
                         MessageHandler(matn, tugma_kuting)],
            YANGI_KAT: [MessageHandler(matn, yangi_kat)],
            IZOH: [CallbackQueryHandler(izoh_tugma, pattern=r"^ri:"),
                   MessageHandler(matn, izoh_matn)],
            TASDIQ: [CallbackQueryHandler(tasdiq, pattern=r"^rt:"),
                     MessageHandler(matn, tugma_kuting)],
        },
        fallbacks=[CommandHandler("bekor", bekor_cmd)],
        allow_reentry=True,
    )
    return [suhbat,
            CallbackQueryHandler(bekor_tugma, pattern=r"^rb:\d+$"),
            CallbackQueryHandler(kategoriya_ochir, pattern=r"^rd:\d+$"),
            CommandHandler("kategoriya", kategoriya_cmd, shaxsiy)]
