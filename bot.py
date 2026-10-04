# -*- coding: utf-8 -*-
"""
PROMAX kunlik savdo hisobot boti (AinurPOS → Telegram).

Barcha ma'lumot AinurPOS'dan (Connect API) olinadi, botda hech narsa kiritilmaydi:
  • savdo: model, dona, narx, summa; mijozlar va sotuvchilar bo'yicha;
  • to'lovlar: savdo paytida va eski qarz bo'yicha (naqd / plastik / perechisleniya);
  • qaytarishlar, qarzdorlik.
Har kuni belgilangan vaqtda guruhga yagona hisobot + Excel fayl.
API ishlamasa — zaxira: AinurPOS Excel hisobotini botga yuborish.
"""
import asyncio
import logging
import os
import re
import secrets
import socket
import subprocess
import threading
import time
from datetime import datetime, time as dtime, timedelta
from html import escape as _escape
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from telegram import (InlineKeyboardButton as IB, InlineKeyboardMarkup as IM,
                      KeyboardButton, MenuButtonWebApp, ReplyKeyboardMarkup, Update, WebAppInfo)
from telegram.constants import ChatMemberStatus as CMS, ChatType, ParseMode
from telegram.error import Conflict, NetworkError, RetryAfter
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes,
                          MessageHandler, TypeHandler, filters)

import ainur
import ainur_api
import config
import daftar
import db
import hisobot
import mini_server
import rasxod


def escape(s):
    """HTML uchun xavfsiz matn (apostrof o'zgarmaydi: og'a)."""
    return _escape(str(s), quote=False)


logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s",
                    level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)  # har 3 daqiqalik yozuvlar kerak emas
log = logging.getLogger("promax")

TZ = ZoneInfo(config.VAQT_ZONASI)
HTML = ParseMode.HTML

BTN_HISOBOT = "📊 Bugungi hisobot"
BTN_DAVR = "📆 Davr hisoboti"
BTN_MIJOZ = "👥 Mijozlar"
BTN_QARZ = "📒 Qarzdorlik"
BTN_YORDAM = "ℹ️ Yo'riqnoma"
BTN_SOTUV = "🛒 Sotuv (mini app)"
MINI_PORT = getattr(config, "MINI_PORT", 8480)
_mini = {"url": ""}  # tunnel bergan https manzil


def MENYU_OL():
    """
    Menyu. «🛒 Sotuv» — oddiy tugma: bosilganda bot o'sha paytdagi manzil bilan
    yangi havola yuboradi. Shu sababli eski manzil tugmaga yopishib qolmaydi.
    """
    qatorlar = []
    if _mini["url"]:
        qatorlar.append([KeyboardButton(BTN_SOTUV)])
    qatorlar += [[BTN_HISOBOT, BTN_DAVR], [BTN_MIJOZ, BTN_QARZ],
                 [rasxod.BTN_RASXOD, BTN_YORDAM]]
    return ReplyKeyboardMarkup(qatorlar, resize_keyboard=True)


MENYU = ReplyKeyboardMarkup([[BTN_HISOBOT, BTN_DAVR], [BTN_MIJOZ, BTN_QARZ], [BTN_YORDAM]],
                           resize_keyboard=True)
MENYU_TUGMALAR = [BTN_HISOBOT, BTN_DAVR, BTN_MIJOZ, BTN_QARZ, BTN_YORDAM]

QARZ_DAVRI = getattr(config, "QARZ_DAVRI_KUN", 180)   # qarzdorlik uchun necha kunlik hujjatlar
KESH_DAQIQA = getattr(config, "KESH_DAQIQA", 10)       # menyu ma'lumotini qayta olish oralig'i
SAHIFA = 10                                            # mijozlar ro'yxatida bir sahifada
HAFTALIK_KUN = getattr(config, "HAFTALIK_KUN", 5)      # haftalik hisobot kuni (5=Shanba, None=o'chiq)
OYLIK = getattr(config, "OYLIK_HISOBOT", True)         # har oyning 1-sanasi o'tgan oy hisoboti
LENTA_DAQIQA = getattr(config, "LENTA_DAQIQA", 3)      # kirim-chiqim lentasi: tekshirish oralig'i
LENTA_KOP = 15                                         # bir martada ko'pi bilan alohida xabar
_yangilash_qulfi = asyncio.Lock()

YORIQNOMA = (
    "<b>Menyu</b>\n"
    "📊 <b>Bugungi hisobot</b> — savdo, mijozlar, qarz to'lovlari, tushum, qarzdorlik.\n"
    "📆 <b>Davr hisoboti</b> — kecha, oxirgi 7 kun, shu oy, o'tgan oy.\n"
    "👥 <b>Mijozlar</b> — ro'yxat (qarz bo'yicha), mijoz kartasi. Qidirish: ismini yozing.\n"
    "📒 <b>Qarzdorlik</b> — umumiy qarz, qarzdorlar ro'yxati, Excel.\n"
    "🧾 <b>Rasxod qo'shish</b> — summa → kategoriya → izoh → tasdiq. "
    "Hisobotda sotuvdan ayirilib, sof foyda chiqadi. Kategoriya: /kategoriya\n\n"
    "<b>Qoida</b>\n"
    "• Barcha savdo, to'lov va qarzlar <b>faqat AinurPOS'da</b> kiritiladi — bot o'zi oladi.\n"
    "• Eski qarz to'lovini AinurPOS'da <b>o'sha savdo hujjati bo'yicha</b>, to'lov turini "
    "tanlab kiriting.\n"
    f"• Kunlik hisobot guruhga har kuni <b>{config.HISOBOT_VAQTI}</b> da tushadi.\n\n"
    "📡 <b>Kirim-chiqim lentasi</b>: AinurPOS'dagi har bir yangi hujjat (kirim, sotuv, "
    "qaytarish, tuzatish, o'chirish) guruhga darhol tushadi.\n\n"
    "Admin: /kochir (AinurPOS qarzlarini botga ko'chirish), /ulash, /lenta, /kunlik, "
    "/hisobot 24.09.2026, /qarz, /api"
)


# --- Yordamchilar ---------------------------------------------------------------
def hozir():
    return datetime.now(TZ)


def guruh_id():
    v = db.sozlama_ol("guruh_id")
    return int(v) if v else None


def ism(user):
    """Xodimning hisobotdagi ismi (/ism bilan o'rnatiladi, bo'lmasa Telegram ismi)."""
    return db.xodim_ismi(user.id, user.full_name)


async def azomi(context, user_id):
    """Foydalanuvchi ulangan hisobot guruhining a'zosimi (ruxsat tekshiruvi)."""
    gid = guruh_id()
    if not gid:
        return False
    try:
        m = await context.bot.get_chat_member(gid, user_id)
    except Exception:
        return False
    return m.status in (CMS.MEMBER, CMS.ADMINISTRATOR, CMS.OWNER) or \
        (m.status == CMS.RESTRICTED and getattr(m, "is_member", False))


async def adminmi(context, chat_id, user_id):
    if not chat_id:
        return False
    try:
        m = await context.bot.get_chat_member(chat_id, user_id)
    except Exception:
        return False
    return m.status in (CMS.ADMINISTRATOR, CMS.OWNER)


async def malumot_yangila(majburiy=False):
    """
    AinurPOS'dan mijozlar va oxirgi QARZ_DAVRI kunlik hujjatlar holatini olish:
    qarzdorlik, mijoz kartalari va eski qarz to'lovlari shundan hisoblanadi.
    KESH_DAQIQA ichida qayta so'ralsa — saqlangan ma'lumot ishlatiladi.
    Qaytaradi: (yangi qarz to'lovlari soni, birinchimi) yoki None (kesh).
    """
    if _yangilash_qulfi.locked() and not majburiy:
        return None  # boshqa yangilash ketyapti — saqlangan ma'lumot ko'rsatiladi
    async with _yangilash_qulfi:
        oxirgi = db.sozlama_ol("kesh_vaqt")
        if not majburiy and oxirgi and \
                (hozir() - datetime.fromisoformat(oxirgi)).total_seconds() < KESH_DAQIQA * 60:
            return None
        await _api(ainur_api.tez_tekshir, soniya=10)  # AinurPOS o'chiq bo'lsa — darhol xato
        bugun = hozir().date()
        try:
            mijozlar = await _api(ainur_api.mijozlar_royxati, soniya=40)
            db.ainur_mijozlar_saqla(mijozlar)
        except ainur_api.APIXato as e:  # mijozlar bo'limi yopiq bo'lsa ham davom etamiz
            log.warning("Mijozlar olinmadi: %s", e)
            mijozlar = []
        bosh = bugun - timedelta(days=QARZ_DAVRI)
        holat = await _api(ainur_api.hujjatlar_davr, bosh, bugun,
                           {m["id"]: m["nom"] for m in mijozlar}, soniya=150)
        natija = db.qarz_tolovlarini_aniqla(bugun.isoformat(), hozir().strftime("%H:%M"), holat,
                                            bosh.isoformat(), bugun.isoformat())
        # Kunlik qarz surati — hisobotda oldingi kunga nisbatan o'zgarish uchun
        db.qarz_saqla(bugun.isoformat(), [{"id": m["id"], "nom": m["nom"], "qarz": m["qarz"] or 0}
                                          for m in db.mijozlar_qarzi()])
        db.sozlama_yoz("kesh_vaqt", hozir().isoformat())
        return natija


async def _api(fn, *args, soniya=60):
    """
    AinurPOS so'rovini alohida oqimda, vaqt chegarasi bilan bajarish.
    Javob kelmasa — AinurPOS «uzilgan» deb belgilanadi va keyingi so'rovlar kutmaydi.
    """
    if ainur_api.uzilganmi():
        raise ainur_api.APIXato("AinurPOS hozir offline")
    try:
        return await asyncio.wait_for(asyncio.to_thread(fn, *args), soniya)
    except asyncio.TimeoutError:
        ainur_api._uzildi["vaqt"] = datetime.now(ainur_api.TZ)
        raise ainur_api.APIXato(f"AinurPOS {soniya} soniyada javob bermadi (offline)")


def kesh_vaqti():
    v = db.sozlama_ol("kesh_vaqt")
    return datetime.fromisoformat(v).strftime("%d.%m %H:%M") if v else "—"


async def api_yangila(sana):
    """
    AinurPOS API'dan kun ma'lumotini olib bazaga yozadi.
    Qaytaradi: (qatorlar, hujjatlar, diag) yoki API o'chiq bo'lsa None.
    """
    if not ainur_api.token():
        return None
    await _api(ainur_api.tez_tekshir, soniya=10)  # AinurPOS o'chiq bo'lsa — darhol xato
    qatorlar, hujjatlar, qaytarish, mijozlar, diag = await _api(ainur_api.kun_sotuvi, sana,
                                                                 soniya=90)
    # API bo'sh qaytarsa-yu, shu kunga Excel yuklangan bo'lsa — Excel'ni saqlab qolamiz
    if qatorlar or not db.oxirgi_fayl(sana.isoformat(), "sotuv"):
        vaqt = hozir().strftime("%Y-%m-%d %H:%M:%S")
        db.fayl_saqla(sana.isoformat(), "sotuv", vaqt, 0, "AinurPOS API", "api",
                      qatorlar, hujjatlar, qaytarish)
        # Ichki / 0 so'mlik chiqimlar — alohida (har safar yoziladi, eskisi amal qilmasin)
        db.fayl_saqla(sana.isoformat(), "ichki", vaqt, 0, "AinurPOS API", "api",
                      diag.get("ichki_q", []), diag.get("ichki_h", []))
    # Qarzdorlik va qarz to'lovlari — hozirgi holat, faqat bugungi kun uchun yangilanadi
    if sana == hozir().date():
        diag["qarz_tolov"], diag["birinchi"] = await malumot_yangila(majburiy=True)
    return qatorlar, hujjatlar, diag


def _guruh_tugma(kalit):
    """Shaxsiy chatdagi hisobot ostidagi tugma: shu hisobotni guruhga yuborish."""
    return IM([[IB("📤 Guruhga yuborish", callback_data=f"g:{kalit}")]])


async def hisobot_yubor(context, chat_id, sana, yangila=True):
    """Kunlik hisobot matni + Excel. AinurPOS offline bo'lsa — oxirgi saqlangan ma'lumot."""
    if yangila and ainur_api.token():
        try:
            await api_yangila(sana)
        except Exception as e:
            log.error("AinurPOS API xatosi: %s", e)
            if not db.oxirgi_fayl(sana.isoformat(), "sotuv"):
                oxirgi = db.oxirgi_sana("sotuv", sana.isoformat())
                if oxirgi:  # bugungi ma'lumot yo'q — oxirgi saqlangan kun ko'rsatiladi
                    from datetime import date as _date
                    sana = _date.fromisoformat(oxirgi)
            await context.bot.send_message(
                chat_id, f"📴 <b>AinurPOS hozir offline.</b> Oxirgi saqlangan ma'lumot ko'rsatildi "
                         f"({sana:%d.%m.%Y}, qarzdorlik {kesh_vaqti()}).", parse_mode=HTML)
    for bolak in hisobot.bolaklarga(hisobot.kunlik_matn(sana)):
        await context.bot.send_message(chat_id, bolak, parse_mode=HTML)
    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    yol = os.path.join(config.FAYL_PAPKA, f"Hisobot{sana:%Y%m%d}.xlsx")
    hisobot.kunlik_excel(sana, yol)
    tugma = _guruh_tugma(f"k:{sana}") if chat_id != guruh_id() else None
    with open(yol, "rb") as f:
        await context.bot.send_document(chat_id, f, filename=os.path.basename(yol),
                                        reply_markup=tugma)


async def davr_yubor(context, chat_id, bosh, oxir):
    """Davr hisoboti (bir necha kun) matni + Excel."""
    try:
        qat, hj, qayt, _, dg = await _api(ainur_api.davr_sotuvi, bosh, oxir, soniya=120)
    except Exception as e:
        log.error("Davr hisoboti: %s", e)
        qat, hj, qayt, iq, ih, bor = db.davr_keshdan(bosh.isoformat(), oxir.isoformat())
        if not bor:
            await context.bot.send_message(chat_id, "📴 AinurPOS offline, bu davr uchun saqlangan "
                                                    "ma'lumot ham yo'q.")
            return
        dg = {"ichki_q": iq, "ichki_h": ih}
        await context.bot.send_message(
            chat_id, f"📴 <b>AinurPOS hozir offline.</b> Hisobot bot saqlagan kunlar bo'yicha: "
                     f"{len(bor)} kun ({', '.join(d[8:10] + '.' + d[5:7] for d in bor[:10])}"
                     f"{' …' if len(bor) > 10 else ''}).", parse_mode=HTML)
    for bolak in hisobot.bolaklarga(hisobot.davr_matn(bosh, oxir, qat, hj, qayt,
                                                          dg.get("ichki_q", []), dg.get("ichki_h", []))):
        await context.bot.send_message(chat_id, bolak, parse_mode=HTML)
    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    yol = os.path.join(config.FAYL_PAPKA, f"Davr{bosh:%Y%m%d}_{oxir:%Y%m%d}.xlsx")
    hisobot.davr_excel(bosh, oxir, qat, hj, yol)
    tugma = _guruh_tugma(f"d:{bosh}:{oxir}") if chat_id != guruh_id() else None
    with open(yol, "rb") as f:
        await context.bot.send_document(chat_id, f, filename=os.path.basename(yol),
                                        reply_markup=tugma)


async def qarz_yubor(context, chat_id):
    """Umumiy qarzdorlik matni + Excel (guruhga yuborish uchun)."""
    matn = "\n".join(hisobot.qarzdorlik_matn(_royxat_ol(), kesh_vaqti()))
    await context.bot.send_message(chat_id, matn[:4000], parse_mode=HTML)
    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    yol = os.path.join(config.FAYL_PAPKA, f"Qarzdorlik{hozir():%Y%m%d%H%M}.xlsx")
    hisobot.qarz_excel(_royxat_ol(), yol)
    with open(yol, "rb") as f:
        await context.bot.send_document(chat_id, f, filename=os.path.basename(yol))


async def guruhga_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """«📤 Guruhga yuborish»: faqat guruh adminlari; hisobot guruhga qayta yuboriladi."""
    q = update.callback_query
    gid = guruh_id()
    if not gid:
        await q.answer("Guruh ulanmagan: guruhda /ulash yozing.", show_alert=True)
        return
    if not await adminmi(context, gid, q.from_user.id):
        await q.answer("⛔ Guruhga faqat guruh adminlari yuboradi.", show_alert=True)
        return
    await q.answer("⏳ Guruhga yuborilmoqda…")
    qism = q.data.split(":")
    from datetime import date as _date
    if qism[1] == "k":
        await hisobot_yubor(context, gid, _date.fromisoformat(qism[2]), yangila=False)
    elif qism[1] == "d":
        await davr_yubor(context, gid, _date.fromisoformat(qism[2]), _date.fromisoformat(qism[3]))
    elif qism[1] == "q":
        await qarz_yubor(context, gid)
    kim = escape(q.from_user.full_name)
    try:
        await q.edit_message_reply_markup(IM([[IB(f"✅ Guruhga yuborildi ({hozir():%H:%M})",
                                                  callback_data="noop")]]))
    except Exception:
        pass
    log.info("Hisobot guruhga yuborildi: %s (%s)", q.data, kim)


# --- Shaxsiy chat: menyu ------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    _chat_qosh(update.effective_chat.id)  # manzil yangilanganda tugmani yuborish uchun
    await update.message.reply_text(
        f"Assalomu alaykum, {escape(ism(update.effective_user))}!\n"
        "PROMAX kunlik hisobot boti.\n\n" + YORIQNOMA, parse_mode=HTML, reply_markup=MENYU_OL())


async def yordam(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(YORIQNOMA, parse_mode=HTML)


async def _ruxsat(update, context):
    """Faqat hisobot guruhi a'zolari foydalanadi."""
    if await azomi(context, update.effective_user.id):
        return True
    if update.callback_query:
        await update.callback_query.answer("⛔ Ruxsat yo'q", show_alert=True)
    else:
        await update.effective_message.reply_text("⛔ Siz hisobot guruhi a'zosi emassiz.")
    return False


async def _yangila_xavfsiz(xabar, majburiy=False):
    """Ma'lumotni yangilash; API xatosida saqlangan ma'lumot bilan davom etish."""
    if not ainur_api.token():
        return
    try:
        await malumot_yangila(majburiy)
    except Exception as e:
        log.error("Yangilash xatosi: %s", e)
        await xabar.reply_text(f"📴 AinurPOS hozir offline. Oxirgi saqlangan ma'lumot "
                               f"({kesh_vaqti()}) ko'rsatiladi.")


def _qisqa(x):
    x = x or 0
    if x >= 10**6:
        return f"{x / 10**6:.1f} mln".replace(".0 ", " ")
    return f"{x / 1000:.0f} ming" if x >= 1000 else ""


def _royxat_ol(qidiruv=""):
    """Mijozlar ro'yxati: daftar rejimida botning o'z bazasidan."""
    if daftar.kochirildimi():
        return [{"id": m["id"], "nom": m["nom"], "telefon": m["telefon"] or "",
                 "qarz": m["qarz"] or 0, "hujjat": m["savdo_soni"], "ochiq": m["savdo_soni"],
                 "oxirgi": m["oxirgi_savdo"]} for m in daftar.mijozlar(qidiruv)]
    r = db.mijozlar_qarzi()
    if qidiruv:
        idlar = {x["id"] for x in db.mijoz_qidir_ainur(qidiruv, 40)}
        r = [m for m in r if m["id"] in idlar]
    return r


def _mijozlar_sahifa(sahifa):
    """Mijozlar ro'yxati sahifasi: qarzdorlar yuqorida."""
    royxat = _royxat_ol()
    qarzdor = [m for m in royxat if (m["qarz"] or 0) >= 1]
    jami_s = max((len(royxat) - 1) // SAHIFA + 1, 1)
    sahifa = max(0, min(sahifa, jami_s - 1))
    tugma = []
    for m in royxat[sahifa * SAHIFA:(sahifa + 1) * SAHIFA]:
        q = _qisqa(m["qarz"])
        tugma.append([IB(f"{(m['nom'] or 'Nomsiz')[:30]}" + (f" · {q}" if q else ""),
                         callback_data=f"m:{m['id'] or '_'}")])
    if jami_s > 1:
        tugma.append([IB("◀️", callback_data=f"mp:{sahifa - 1}"),
                      IB(f"{sahifa + 1}/{jami_s}", callback_data="noop"),
                      IB("▶️", callback_data=f"mp:{sahifa + 1}")])
    matn = (f"👥 <b>MIJOZLAR</b>: {len(royxat)} · qarzdor: {len(qarzdor)} · jami qarz: "
            f"<b>{hisobot.pul(sum(m['qarz'] for m in qarzdor))}</b>\n"
            f"<i>yangilangan {kesh_vaqti()}</i>\n\n"
            "Mijozni tanlang yoki qidirish uchun ismini yozing:")
    return matn, IM(tugma)


async def mijozlar_menyu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await _ruxsat(update, context):
        return
    x = await update.message.reply_text("⏳ Mijozlar yuklanmoqda…")
    await _yangila_xavfsiz(x)
    matn, tugma = _mijozlar_sahifa(0)
    await x.edit_text(matn, parse_mode=HTML, reply_markup=tugma)


def _karta(mid):
    """Mijoz kartasi matni va tugmalari."""
    if daftar.kochirildimi():
        m = daftar.mijoz_ol(int(mid)) if str(mid).isdigit() else None
        if not m:
            return "Mijoz topilmadi.", IM([[IB("⬅️ Ro'yxat", callback_data="mp:0")]])
        savdolar = daftar.mijoz_savdolari(m["id"])
        tolovlar = daftar.tolovlar("0000-01-01", "9999-12-31", m["id"])[::-1][:10]
        qarz = daftar.mijoz_qarzi(m["id"])
        L = [f"👤 <b>{escape(m['nom'])}</b>"]
        if m["telefon"]:
            L.append(f"📞 {escape(m['telefon'])}")
        L += ["", f"Qarz: <b>{hisobot.pul(qarz)} {config.VALYUTA}</b>"]
        if m["boshlangich"]:
            L.append(f"<i>shundan boshlang'ich (AinurPOS'dan): {hisobot.pul(m['boshlangich'])}</i>")
        if savdolar:
            L += ["", f"<b>Oxirgi savdolar</b> ({len(savdolar)} ta ko'rsatildi):"]
            L += [f"• {s['sana'][8:10]}.{s['sana'][5:7]} — {hisobot.pul(s['jami'])}"
                  + (f", to'landi {hisobot.pul(s['tolangan'])}" if s["tolangan"] else "")
                  for s in savdolar[:10]]
        if tolovlar:
            L += ["", "<b>Oxirgi to'lovlar:</b>"]
            L += [f"• {t['sana'][8:10]}.{t['sana'][5:7]} — {hisobot.pul(t['summa'])} "
                  f"({escape(t['turi'])}) · {escape(t['kim'] or '')}" for t in tolovlar]
        return "\n".join(L)[:4000], IM([[IB("⬅️ Mijozlar ro'yxati", callback_data="mp:0")]])
    hujjatlar = db.mijoz_hujjatlari(mid)
    m = db.ainur_mijoz_ol(mid) or {"nom": hujjatlar[0]["mijoz"] if hujjatlar else "Nomsiz",
                                   "telefon": ""}
    qarz = sum(max(h["jami"] - h["tolangan"], 0) for h in hujjatlar)
    matn = "\n".join(hisobot.mijoz_karta_matn(m, qarz, hujjatlar, db.mijoz_qarz_tolovlari(mid)))
    return matn[:4000], IM([[IB("⬅️ Mijozlar ro'yxati", callback_data="mp:0")]])


async def mijoz_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not await _ruxsat(update, context):
        return
    await q.answer()
    if q.data.startswith("mp:"):
        matn, tugma = _mijozlar_sahifa(int(q.data[3:]))
    else:
        mid = q.data[2:]
        matn, tugma = _karta("" if mid == "_" else mid)
    await q.edit_message_text(matn, parse_mode=HTML, reply_markup=tugma)


async def boshqa_matn(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Menyudan tashqari matn — mijoz qidirish."""
    matn = update.message.text.strip()
    if matn.startswith("💰") or len(matn) < 2:  # eski menyu tugmasi yoki juda qisqa
        await update.message.reply_text(
            "Botda hech narsa kiritilmaydi — savdo va to'lovlar faqat AinurPOS'da.\n"
            "Mijozni qidirish uchun ismini yozing.", reply_markup=MENYU_OL())
        return
    if not await _ruxsat(update, context):
        return
    if not daftar.kochirildimi() and not db.mijozlar_qarzi():
        await _yangila_xavfsiz(update.message)   # kesh bo'sh — avval yuklab olamiz
    topildi = ([{"id": m["id"], "nom": m["nom"]} for m in daftar.mijozlar(matn, limit=20)]
               if daftar.kochirildimi() else db.mijoz_qidir_ainur(matn))
    if not topildi:
        await update.message.reply_text(f"🔍 «{escape(matn)}» — mijoz topilmadi.", reply_markup=MENYU_OL())
    elif len(topildi) == 1:
        k, t = _karta(topildi[0]["id"])
        await update.message.reply_text(k, parse_mode=HTML, reply_markup=t)
    else:
        await update.message.reply_text(
            f"🔍 «{escape(matn)}» — {len(topildi)} ta mijoz:", reply_markup=IM(
                [[IB(m["nom"][:40], callback_data=f"m:{m['id']}")] for m in topildi]))


# --- Qarzdorlik -------------------------------------------------------------------------
QARZ_TUGMA = IM([[IB("📄 Excel", callback_data="qx"), IB("🔄 Yangilash", callback_data="qy")],
                 [IB("📤 Guruhga yuborish", callback_data="g:q")]])


async def qarz_menyu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat, user = update.effective_chat, update.effective_user
    if chat.type == ChatType.PRIVATE:
        if not await _ruxsat(update, context):
            return
    elif not await adminmi(context, chat.id, user.id):
        await update.message.reply_text("⛔ Faqat guruh adminlari.")
        return
    x = await update.message.reply_text("⏳ Qarzdorlik hisoblanmoqda…")
    await _yangila_xavfsiz(x)
    matn = "\n".join(hisobot.qarzdorlik_matn(_royxat_ol(), kesh_vaqti()))
    await x.edit_text(matn[:4000], parse_mode=HTML, reply_markup=QARZ_TUGMA)


async def qarz_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if q.message.chat.type == ChatType.PRIVATE:
        if not await _ruxsat(update, context):
            return
    elif not await adminmi(context, q.message.chat.id, q.from_user.id):
        await q.answer("⛔ Faqat guruh adminlari", show_alert=True)
        return
    await q.answer("⏳")
    if q.data == "qy":
        await _yangila_xavfsiz(q.message, majburiy=True)
        matn = "\n".join(hisobot.qarzdorlik_matn(_royxat_ol(), kesh_vaqti()))
        try:
            await q.edit_message_text(matn[:4000], parse_mode=HTML, reply_markup=QARZ_TUGMA)
        except Exception:  # matn o'zgarmagan bo'lsa Telegram xato beradi
            pass
        return
    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    yol = os.path.join(config.FAYL_PAPKA, f"Qarzdorlik{hozir():%Y%m%d%H%M}.xlsx")
    hisobot.qarz_excel(_royxat_ol(), yol)
    with open(yol, "rb") as f:
        await context.bot.send_document(q.message.chat.id, f, filename=os.path.basename(yol))


# --- Davr hisoboti ------------------------------------------------------------------------
DAVR_TUGMA = IM([[IB("📅 Kecha", callback_data="d:kecha"), IB("🗓 Oxirgi 7 kun", callback_data="d:7")],
                 [IB("📆 Shu oy", callback_data="d:oy"), IB("⏮ O'tgan oy", callback_data="d:otgan")]])


async def davr_menyu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await _ruxsat(update, context):
        return
    await update.message.reply_text("📆 Qaysi davr uchun hisobot?", reply_markup=DAVR_TUGMA)


def _davr(kod):
    bugun = hozir().date()
    if kod == "kecha":
        k = bugun - timedelta(days=1)
        return k, k
    if kod == "7":
        return bugun - timedelta(days=6), bugun
    if kod == "oy":
        return bugun.replace(day=1), bugun
    oxir = bugun.replace(day=1) - timedelta(days=1)  # o'tgan oy
    return oxir.replace(day=1), oxir


async def davr_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not await _ruxsat(update, context):
        return
    await q.answer()
    bosh, oxir = _davr(q.data[2:])
    chat_id = q.message.chat.id
    await q.edit_message_text(f"⏳ {bosh:%d.%m} — {oxir:%d.%m} hisoboti tayyorlanmoqda…")
    if bosh == oxir:  # bir kun — to'liq kunlik hisobot
        await hisobot_yubor(context, chat_id, bosh)
    else:
        await davr_yubor(context, chat_id, bosh, oxir)


async def noop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()


async def bugun_shaxsiy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bugungi hisobotni faqat so'ragan xodimga ko'rsatish."""
    if not await azomi(context, update.effective_user.id):
        await update.message.reply_text("⛔ Siz hisobot guruhi a'zosi emassiz.")
        return
    await update.message.reply_text("⏳ Hisobot tayyorlanmoqda (AinurPOS'dan olinmoqda)…",
                                    reply_markup=MENYU_OL())
    await hisobot_yubor(context, update.effective_chat.id, hozir().date())


# --- Excel qabul qilish ------------------------------------------------------------
async def excel_qabul(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    user = update.effective_user
    shaxsiy = msg.chat.type == ChatType.PRIVATE
    doc = msg.document
    if not (doc.file_name or "").lower().endswith(".xlsx"):
        if shaxsiy:
            await msg.reply_text("Faqat AinurPOS'dan olingan .xlsx fayl qabul qilinadi.")
        return
    if not await azomi(context, user.id):
        if shaxsiy:
            await msg.reply_text("⛔ Siz hisobot guruhi a'zosi emassiz.")
        return

    now = hozir()
    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    yol = os.path.join(config.FAYL_PAPKA, f"{now:%Y%m%d_%H%M%S}_{user.id}.xlsx")
    await (await doc.get_file()).download_to_drive(yol)
    try:
        tur, qatorlar = ainur.excel_oqi(yol)
    except ainur.NotanishHisobot as e:
        # Guruhda boshqa Excel'lar ham bo'lishi mumkin — u yerda jim turamiz
        if shaxsiy:
            await msg.reply_text(f"❗ Hisobot turi tanilmadi.\nUstunlar: {e}\n\n"
                                 "Savdo yoki ombor qoldig'i hisobotini yuboring.")
        return
    except Exception as e:
        log.exception("Excel o'qish xatosi")
        await msg.reply_text(f"❗ Faylni o'qib bo'lmadi: {e}")
        return

    sana = hisobot.sana_oqi(msg.caption, now.date()) or now.date()
    if sana > now.date():
        await msg.reply_text("❗ Kelajakdagi sana ko'rsatilgan. Izohdagi sanani tekshiring.")
        return
    db.fayl_saqla(sana.isoformat(), tur, now.strftime("%Y-%m-%d %H:%M:%S"), user.id,
                  ism(user), doc.file_name, qatorlar)
    await msg.reply_text(hisobot.fayl_xulosa(tur, qatorlar, sana))


# --- Guruh buyruqlari ---------------------------------------------------------------
async def ulash(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat, user = update.effective_chat, update.effective_user
    if chat.type not in (ChatType.GROUP, ChatType.SUPERGROUP):
        await update.message.reply_text("Bu buyruqni hisobot guruhida yozing.")
        return
    if not await adminmi(context, chat.id, user.id):
        await update.message.reply_text("⛔ Faqat guruh adminlari.")
        return
    db.sozlama_yoz("guruh_id", chat.id)
    await update.message.reply_text(
        f"✅ Guruh ulandi. Kunlik hisobot har kuni {config.HISOBOT_VAQTI} da shu yerga tushadi.\n"
        "Sotuvchilar botga shaxsiy yozib «/start» bosishsin.")


async def _sana_arg(context):
    if not context.args:
        return hozir().date()
    return hisobot.sana_oqi(context.args[0], hozir().date())


async def kunlik_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/kunlik — bugungi, /hisobot 24.09.2026 — tanlangan kun hisoboti."""
    chat, user = update.effective_chat, update.effective_user
    sana = await _sana_arg(context)
    if not sana:
        await update.message.reply_text("Sana formati: /hisobot 24.09.2026")
        return
    if chat.type == ChatType.PRIVATE:
        if await azomi(context, user.id):
            await hisobot_yubor(context, chat.id, sana)
        return
    if await adminmi(context, chat.id, user.id):
        await hisobot_yubor(context, chat.id, sana)
    else:
        await update.message.reply_text("⛔ Guruhga hisobotni faqat admin chiqaradi.")


async def api_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/api [sana] — AinurPOS API'dan savdoni olib, qaysi maydonlar tanilganini ko'rsatadi."""
    chat, user = update.effective_chat, update.effective_user
    ruxsat = (await azomi(context, user.id) if chat.type == ChatType.PRIVATE
              else await adminmi(context, chat.id, user.id))
    if not ruxsat:
        await update.message.reply_text("⛔ Ruxsat yo'q.")
        return
    if not ainur_api.token():
        await update.message.reply_text("config.py da AINUR_TOKEN yo'q.")
        return
    sana = await _sana_arg(context) or hozir().date()
    await update.message.reply_text("⏳ AinurPOS API tekshirilmoqda…")
    try:
        holat = await _api(ainur_api.tekshir, soniya=30)
    except ainur_api.APIXato as e:
        await update.message.reply_text(f"📴 {escape(str(e))}")
        return
    await update.message.reply_text(
        "🔌 AinurPOS API bo'limlari:\n" + "\n".join(
            f"{'✅' if ok else '❌'} {nom}" + ("" if ok else f" — {izoh}") for nom, ok, izoh in holat)
        + f"\n\n⏳ {sana:%d.%m.%Y} savdosi olinmoqda…")
    try:
        qatorlar, hujjatlar, diag = await api_yangila(sana)
    except Exception as e:
        log.exception("API tekshiruv xatosi")
        await update.message.reply_text(f"❌ API: {e}")
        return
    kuz = ""
    if "qarz_tolov" in diag:
        kuz = ("\nQarz to'lovlari: kuzatuv bugundan boshlandi (ertadan ko'rinadi)"
               if diag["birinchi"] else f"\nQarz to'lovlari (yangi aniqlangan): {diag['qarz_tolov']}")
    await update.message.reply_text("✅ AinurPOS API\n" + ainur_api.diag_matn(diag, qatorlar, hujjatlar) + kuz +
                                    "\n\nRaqamlarni AinurPOS'dagi bilan solishtiring. "
                                    "Mos kelmasa — yuklangan/api_*.json faylini Claude'ga yuboring.")


async def migratsiya(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Guruh supergroup'ga aylansa — ID yangilanadi."""
    m = update.message
    if m.migrate_to_chat_id and guruh_id() == m.chat_id:
        db.sozlama_yoz("guruh_id", m.migrate_to_chat_id)


# --- Rejali ishlar --------------------------------------------------------------------
# --- Mini app (sotuv) ------------------------------------------------------------------------
async def mini_xabar(tur, d):
    """Mini app'da bajarilgan amalni guruhga yuborish."""
    bot = _ilova["app"].bot if _ilova.get("app") else None
    gid = lenta_id() or guruh_id()
    if not bot or not gid:
        return
    if tur == "sotuv":
        L = [f"🔴 <b>SOTUV</b> <i>(mini app · {escape(d['kim'])})</i>",
             f"👤 {escape(d['mijoz'] or 'Chakana')}"]
        L += [f"• {escape(q['nom'])} — {hisobot.pul(q['soni'])} × {hisobot.pul(q['narx'])} = "
              f"{hisobot.pul(q['soni'] * q['narx'])}" for q in d["qatorlar"][:15]]
        L.append(f"<b>Jami: {hisobot.pul(d['dona'])} dona · {hisobot.pul(d['jami'])} "
                 f"{config.VALYUTA}</b>")
        L.append(f"💵 To'landi: {hisobot.pul(d['tolangan'])}"
                 + (f" ({d['turi']})" if d["tolangan"] else "")
                 + f" · 📝 Qarzga: <b>{hisobot.pul(d['jami'] - d['tolangan'])}</b>")
        await bot.send_message(gid, "\n".join(L), parse_mode=HTML)
    elif tur == "qarz":
        await bot.send_message(gid, (
            f"💳 <b>ESKI QARZ TO'LOVI</b> <i>(mini app · {escape(d['kim'])})</i>\n"
            f"👤 {escape(d['mijoz'])}\n"
            f"<b>{hisobot.pul(d['summa'])} {config.VALYUTA}</b> — {escape(d['turi'])}\n"
            f"⚠️ AinurPOS'ga qo'lda kiritilsin."), parse_mode=HTML,
            reply_markup=IM([[IB("✅ AinurPOS'ga kiritdim", callback_data=f"qt:{d['id']}")]]))


async def qol_tolov_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """«AinurPOS'ga kiritdim» — qarz to'lovi belgilanadi."""
    q = update.callback_query
    tid = int(q.data[3:])
    t = db.qol_tolov_ol(tid)
    if not t:
        await q.answer("Topilmadi", show_alert=True)
        return
    if t["ainurga"]:
        await q.answer(f"Allaqachon belgilangan: {t['ainurga']}", show_alert=True)
        return
    kim = q.from_user.full_name
    db.qol_tolov_belgila(tid, kim)
    await q.answer("Belgilandi")
    await q.edit_message_reply_markup(IM([[IB(f"✅ AinurPOS'ga kiritdi: {kim}", callback_data="noop")]]))


async def mini_ishga(app):
    """Mini app serveri va tunnel (Telegram HTTPS manzil talab qiladi)."""
    from aiohttp import web
    mini = mini_server.yaratish(config.BOT_TOKEN, lambda uid: azomi_id(app, uid), hozir)
    mini["xabar"] = mini_xabar
    # Imzo kelmagan mijozlar uchun zaxira kalit (havolani faqat bot menyusi beradi)
    kalit = db.sozlama_ol("mini_kalit")
    if not kalit:
        kalit = secrets.token_hex(16)
        db.sozlama_yoz("mini_kalit", kalit)
    mini["kalit"] = kalit
    mini["egasi"] = "menejer"
    runner = web.AppRunner(mini, access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", MINI_PORT).start()
    log.info("Mini app serveri: http://127.0.0.1:%d", MINI_PORT)
    url = getattr(config, "MINI_URL", "").strip()
    if not url:
        url = await asyncio.to_thread(tunnel_ochish, MINI_PORT)
    if not url:
        log.warning("Mini app: HTTPS manzil olinmadi — bot oddiy ishlayveradi, faqat "
                    "«🛒 Sotuv» tugmasi bo'lmaydi. cloudflared.exe ni qo'lda yuklash: "
                    "https://github.com/cloudflare/cloudflared/releases/latest")
        return
    _mini["url"] = url + ("&" if "?" in url else "?") + "k=" + kalit
    log.info("Mini app manzili: %s", _mini["url"])
    try:
        await app.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Sotuv", web_app=WebAppInfo(url=_mini["url"])))
    except Exception as e:
        log.warning("Menyu tugmasi o'rnatilmadi: %s", e)
    # Eski manzilli tugma ishlamasligi uchun — yangi menyuni o'zi yuboradi
    await _menyu_yangila(SimpleNamespace(bot=app.bot),
                         "🛒 Mini app tayyor — «🛒 Sotuv» tugmasini bosing.")


async def mini_ochish(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """«🛒 Sotuv» bosilganda — hozirgi manzil bilan ochish tugmasini yuborish."""
    if not await _ruxsat(update, context):
        return
    _chat_qosh(update.effective_chat.id)
    if not _mini.get("url"):
        await update.message.reply_text("Mini app hali tayyor emas. Bir daqiqadan keyin urining.")
        return
    x = await update.message.reply_text("⏳ Mini app tayyorlanmoqda…")
    if not await asyncio.to_thread(_manzil_ishlaydimi, _mini["url"]):
        await _tunnel_yangila(context)       # manzil o'lgan — yangisini ochamiz
    if not _mini.get("url"):
        await x.edit_text("❌ Mini app manzili ochilmadi. Qora oynadagi xatoni tekshiring.")
        return
    await x.edit_text("🛒 Sotuvni ochish uchun tugmani bosing:", reply_markup=IM(
        [[IB("🛒 Mini app'ni ochish", web_app=WebAppInfo(url=_mini["url"]))]]))


async def _tunnel_yangila(context=None):
    """Tunnelni qayta ochib, yangi manzilni saqlash. Qaytaradi: yangilandimi."""
    p = _ilova.get("tunnel")
    if p and p.poll() is None:
        try:
            p.kill()
        except Exception:
            pass
    url = await asyncio.to_thread(tunnel_ochish, MINI_PORT)
    if not url:
        log.error("Tunnel qayta ochilmadi — «🛒 Sotuv» ishlamaydi.")
        return False
    _mini["url"] = url + ("&" if "?" in url else "?") + "k=" + db.sozlama_ol("mini_kalit", "")
    log.info("Mini app manzili yangilandi: %s", _mini["url"])
    if context:
        try:
            await context.bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="Sotuv", web_app=WebAppInfo(url=_mini["url"])))
        except Exception as e:
            log.warning("Menyu tugmasi yangilanmadi: %s", e)
    return True


async def mini_tekshir(context: ContextTypes.DEFAULT_TYPE):
    """
    Har 2 daqiqada mini app manzili tirikligini tekshiradi.
    Tunnel o'lgan bo'lsa — yangisini ochadi va foydalanuvchilarga yangi tugma yuboradi.
    """
    if not _mini.get("url") or getattr(config, "MINI_URL", "").strip():
        return
    if await asyncio.to_thread(_manzil_ishlaydimi, _mini["url"]):
        return
    log.warning("Mini app manzili ishlamayapti — tunnel qayta ochilmoqda…")
    await _tunnel_yangila(context)


def _manzil_ishlaydimi(url):
    """Tunnel orqali mini app javob beradimi (10 soniya)."""
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=10) as r:
            return r.status < 500
    except urllib.error.HTTPError as e:
        return e.code < 500          # 4xx — server tirik
    except Exception:
        return False


def _chatlar():
    v = db.sozlama_ol("mini_chatlar", "")
    return [int(x) for x in v.split(",") if x.strip().lstrip("-").isdigit()]


def _chat_qosh(chat_id):
    c = _chatlar()
    if chat_id not in c:
        c.append(chat_id)
        db.sozlama_yoz("mini_chatlar", ",".join(str(x) for x in c[-20:]))


async def _menyu_yangila(context, matn):
    """Botdan foydalangan shaxsiy chatlarga yangilangan menyuni yuborish."""
    for cid in _chatlar():
        try:
            await context.bot.send_message(cid, matn, reply_markup=MENYU_OL())
        except Exception as e:
            log.debug("Menyu yuborilmadi (%s): %s", cid, e)


def tunnel_ochish(port, kutish=40):
    """cloudflared quick tunnel: https manzil qaytaradi (yo'q bo'lsa — None)."""
    exe = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe")
    buyruq = exe if os.path.exists(exe) else "cloudflared"
    try:
        p = subprocess.Popen([buyruq, "tunnel", "--no-autoupdate", "--url",
                              f"http://127.0.0.1:{port}"],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", errors="replace",
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except FileNotFoundError:
        log.error("cloudflared topilmadi — mini app uchun HTTPS manzil kerak. "
                  "start.bat uni o'zi yuklab oladi.")
        return None
    _ilova["tunnel"] = p
    boshlangan = time.time()
    while time.time() - boshlangan < kutish:
        satr = p.stdout.readline()
        if not satr:
            break
        m = re.search(r"https://[-\w.]+\.trycloudflare\.com", satr)
        if m:
            threading.Thread(target=_tunnel_log, args=(p,), daemon=True).start()
            return m.group(0)
    return None


def _tunnel_log(p):
    for satr in p.stdout:  # oqim to'lib qolmasligi uchun o'qib turamiz
        if "ERR" in satr and "tunnel" in satr.lower():
            log.warning("Tunnel: %s", satr.strip()[:160])


async def azomi_id(app, uid):
    """Mini app uchun ruxsat: hisobot guruhi a'zosimi."""
    gid = guruh_id()
    if not gid:
        return False
    try:
        m = await app.bot.get_chat_member(gid, uid)
    except Exception:
        return False
    return m.status in (CMS.MEMBER, CMS.ADMINISTRATOR, CMS.OWNER)


# --- Daftar: qarzlarni ko'chirish va AinurPOS navbati ---------------------------------------
async def kochir_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /kochir — AinurPOS'dagi hozirgi mijozlar va qarzlarni botning daftariga
    boshlang'ich qoldiq qilib ko'chirish. Shundan keyin savdo botda yuritiladi.
    """
    if not await _ruxsat(update, context):
        return
    oldin = daftar.kochirildimi()
    tugma = IM([[IB("✅ Ha, ko'chirilsin", callback_data="kch:ha"),
                 IB("✖️ Yo'q", callback_data="kch:yoq")]])
    ogoh = (f"\n\n⚠️ Oldin ham ko'chirilgan ({oldin}). Qayta ko'chirilsa, boshlang'ich "
            "qarzlar AinurPOS'dagi hozirgi holat bilan ALMASHTIRILADI." if oldin else "")
    await update.message.reply_text(
        "📥 <b>Qarzlarni ko'chirish</b>\n\n"
        "AinurPOS'dagi mijozlar va ularning hozirgi qarzi botning daftariga boshlang'ich "
        "qoldiq sifatida yoziladi. Shundan keyin savdo, to'lov va qarzdorlik botda "
        "yuritiladi.\n\n"
        "Buni kun oxirida, savdo tugagach bajaring." + ogoh, parse_mode=HTML, reply_markup=tugma)


async def kochir_tugma(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if q.data.endswith("yoq"):
        await q.answer()
        await q.edit_message_text("✖️ Bekor qilindi.")
        return
    await q.answer("⏳")
    await q.edit_message_text("⏳ AinurPOS'dan mijozlar va qarzlar olinmoqda…")
    try:
        await malumot_yangila(majburiy=True)
    except Exception as e:
        await q.edit_message_text(f"❌ AinurPOS'dan olinmadi: {escape(str(e))}")
        return
    royxat = [{"nom": m["nom"], "telefon": m.get("telefon", ""), "qarz": m["qarz"] or 0,
               "ainur_id": m["id"]} for m in db.mijozlar_qarzi() if m["nom"]]
    now = hozir()
    yangi, eski, jami = daftar.kochir(royxat, now.date().isoformat(), now.strftime("%H:%M"))
    await q.edit_message_text(
        f"✅ <b>Ko'chirildi</b> — {now:%d.%m.%Y %H:%M}\n\n"
        f"Mijozlar: <b>{yangi + eski}</b> (yangi {yangi}, yangilangan {eski})\n"
        f"Boshlang'ich qarz: <b>{hisobot.pul(jami)} {config.VALYUTA}</b>\n\n"
        "Endi savdo va to'lovlar botda yuritiladi. AinurPOS faqat ombor uchun qoladi.",
        parse_mode=HTML)


async def navbat_job(context: ContextTypes.DEFAULT_TYPE):
    """Botda yozilgan savdolarni AinurPOS'ga chiqim hujjati qilib yuborish (qoldiq uchun)."""
    if not ainur_api.token():
        return
    navbat = await asyncio.to_thread(daftar.navbatdagilar, 10)
    if not navbat:
        return
    yubordi = xato = 0
    for s in navbat:
        try:
            await _api(ainur_api.sotuv_yarat, s["dokon"], None,
                       [{"id": q["tovar_id"], "soni": q["soni"], "narx": q["narx"],
                         "birlik": q["birlik"]} for q in s["qatorlar"] if q["tovar_id"]],
                       {"summa": 0}, f"Bot #{s['id']} · {s['mijoz'] or ''} · {s['kim'] or ''}",
                       None, soniya=45)
            daftar.ainur_belgila(s["id"], daftar.YUBORILDI)
            yubordi += 1
        except Exception as e:
            daftar.ainur_belgila(s["id"], daftar.XATO, str(e))
            xato += 1
            log.warning("Savdo #%s AinurPOS'ga yuborilmadi: %s", s["id"], e)
            break  # AinurPOS javob bermayapti — keyingi safar
    if yubordi or xato:
        log.info("AinurPOS navbati: %d yuborildi, %d xato, %d qoldi",
                 yubordi, xato, daftar.navbat_soni())


# --- Kirim-chiqim lentasi ------------------------------------------------------------------
def lenta_id():
    """Lenta yuboriladigan chat: /lenta bilan ulangan guruh, bo'lmasa hisobot guruhi."""
    v = db.sozlama_ol("lenta_id")
    if v == "off":
        return None
    return int(v) if v else guruh_id()


async def _yubor_xavfsiz(context, chat_id, matn):
    """Telegram cheklovi (RetryAfter) bo'lsa kutib, qayta yuborish."""
    for _ in range(3):
        try:
            await context.bot.send_message(chat_id, matn, parse_mode=HTML)
            return True
        except RetryAfter as e:
            await asyncio.sleep(e.retry_after + 1)
    return False


async def lenta_job(context: ContextTypes.DEFAULT_TYPE):
    """
    Har LENTA_DAQIQA da AinurPOS'dagi yangi hujjatlarni (kirim, sotuv, qaytarish, tuzatish)
    va o'chirilganlarni guruhga yuborish. Birinchi ishga tushishda — faqat eslab qolinadi.
    """
    cid = lenta_id()
    if not ainur_api.token() or not cid:
        return
    try:
        hujjatlar = await _api(ainur_api.harakatlar, hozir().date(), soniya=90)
    except Exception as e:
        log.warning("Lenta: AinurPOS'dan olinmadi — %s", e)
        return
    saqlangan = db.harakat_holati()
    vaqt = hozir().strftime("%Y-%m-%d %H:%M")
    db.sozlama_yoz("lenta_oxirgi", hozir().strftime("%d.%m %H:%M"))
    if not saqlangan:  # birinchi ishga tushish — eski hujjatlar bilan guruhni to'ldirmaymiz
        for h in hujjatlar:
            db.harakat_saqla(h, "boshlang'ich")
        log.info("Lenta: boshlang'ich holat — %d hujjat eslab qolindi", len(hujjatlar))
        return
    yangi, ochirilgan = [], []
    for h in sorted(hujjatlar, key=lambda x: (x["sana"], x["vaqt"])):
        if h["id"] not in saqlangan:
            (ochirilgan if h["ochirilgan"] else yangi).append(h)
        elif h["ochirilgan"] and not saqlangan[h["id"]]:
            ochirilgan.append(h)
    xabarlar = [(h, False) for h in yangi] + [(h, True) for h in ochirilgan]
    for i, (h, och) in enumerate(xabarlar):
        if i < LENTA_KOP:
            await _yubor_xavfsiz(context, cid, hisobot.harakat_matn(h, och))
            await asyncio.sleep(1.2)  # guruhga ketma-ket yuborish cheklovi
        db.harakat_saqla(h, vaqt)
    if len(xabarlar) > LENTA_KOP:  # juda ko'p bo'lsa — qolgani bitta qisqa xabarda
        qolgan = xabarlar[LENTA_KOP:]
        await _yubor_xavfsiz(context, cid, f"… va yana <b>{len(qolgan)}</b> ta hujjat: " + ", ".join(
            f"{hisobot.TUR['ichki' if h.get('ichki') else h['tur']][0]}#{escape(h['raqam'])}"
            for h, _ in qolgan[:40]))
    if xabarlar:
        log.info("Lenta: %d yangi, %d o'chirilgan hujjat yuborildi", len(yangi), len(ochirilgan))


async def lenta_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/lenta — lentani shu guruhga ulash; /lenta ochir — o'chirish (faqat guruh admini)."""
    chat, user = update.effective_chat, update.effective_user
    if chat.type not in (ChatType.GROUP, ChatType.SUPERGROUP):
        holat = lenta_id()
        bugun = [h for h in db.kun_harakatlari(hozir().date().isoformat())
                 if h["yuborildi"] != "boshlang'ich"]
        await update.message.reply_text(
            f"📡 Kirim-chiqim lentasi: {'✅ yoqilgan' if holat else '🔕 o‘chiq'}\n"
            f"Oxirgi tekshiruv: {db.sozlama_ol('lenta_oxirgi') or '—'} (har {LENTA_DAQIQA} daqiqada)\n"
            f"Bugun guruhga yuborilgan hujjatlar: {len(bugun)}\n"
            f"Kuzatuvdagi hujjatlar: {len(db.harakat_holati())}\n\n"
            "Boshqa guruhga ulash: o'sha guruhda /lenta yozing.")
        return
    if not await adminmi(context, chat.id, user.id):
        await update.message.reply_text("⛔ Faqat guruh adminlari.")
        return
    if context.args and context.args[0].lower() in ("ochir", "o'chir", "off", "stop"):
        db.sozlama_yoz("lenta_id", "off")
        await update.message.reply_text("🔕 Kirim-chiqim lentasi o'chirildi.")
        return
    db.sozlama_yoz("lenta_id", chat.id)
    await update.message.reply_text(
        "📡 Kirim-chiqim lentasi shu guruhga ulandi.\n"
        f"Har {LENTA_DAQIQA} daqiqada AinurPOS'dagi har bir yangi hujjat shu yerga tushadi: "
        "🟢 kirim, 🔴 sotuv, ⚪ ichki chiqim, ↩️↪️ qaytarishlar, 🔧 qoldiq tuzatish, 🗑 o'chirilganlar.")


async def kunlik_job(context: ContextTypes.DEFAULT_TYPE):
    """Kunlik hisobot. AinurPOS javob bermasa — 10 daqiqadan keyin qayta (3 martagacha),
    oxirida saqlangan ma'lumot bilan chiqariladi."""
    if hozir().weekday() not in config.ISH_KUNLARI or not guruh_id():
        return
    urinish = (context.job.data or {}).get("urinish", 1) if context.job else 1
    if ainur_api.token():
        try:
            await api_yangila(hozir().date())
        except Exception as e:
            log.error("Kunlik hisobot: AinurPOS xatosi (%s-urinish): %s", urinish, e)
            if urinish < 3:
                context.job_queue.run_once(kunlik_job, 600, data={"urinish": urinish + 1},
                                           name="kunlik_qayta")
                return
            await context.bot.send_message(
                guruh_id(), f"⚠️ AinurPOS 30 daqiqa davomida javob bermadi: {escape(str(e))}\n"
                            f"Hisobot oxirgi saqlangan ma'lumot ({kesh_vaqti()}) bilan chiqarildi.")
    bugun = hozir().date()
    tarmoq = (context.job.data or {}).get("tarmoq", 0) if context.job else 0
    try:
        await hisobot_yubor(context, guruh_id(), bugun, yangila=False)
        db.sozlama_yoz("oxirgi_kunlik", bugun.isoformat())
        if HAFTALIK_KUN is not None and bugun.weekday() == HAFTALIK_KUN:  # haftalik
            await davr_yubor(context, guruh_id(), bugun - timedelta(days=6), bugun)
        if OYLIK and bugun.day == 1:  # oylik — o'tgan oy uchun
            oxir = bugun - timedelta(days=1)
            await davr_yubor(context, guruh_id(), oxir.replace(day=1), oxir)
    except NetworkError as e:
        if tarmoq < 12:  # internet qaytguncha har 5 daqiqada (1 soatgacha)
            log.warning("Kunlik hisobot yuborilmadi (internet): %s — 5 daqiqadan keyin qayta", e)
            context.job_queue.run_once(kunlik_job, 300, data={"urinish": 3, "tarmoq": tarmoq + 1},
                                       name="kunlik_tarmoq")
        else:
            log.error("Kunlik hisobot 1 soat davomida yuborilmadi (internet yo'q): %s", e)


async def eslatma_job(context: ContextTypes.DEFAULT_TYPE):
    bugun = hozir().date()
    if bugun.weekday() not in config.ISH_KUNLARI or not guruh_id():
        return
    if ainur_api.token():
        try:
            await api_yangila(bugun)
            return  # savdo API'dan olindi — Excel shart emas
        except Exception as e:
            log.error("AinurPOS API xatosi: %s", e)
            await context.bot.send_message(
                guruh_id(), f"⚠️ AinurPOS API ishlamadi: {escape(str(e))}\n"
                            "Bugungi savdo Excel faylini botga yuboring.")
            return
    if not db.oxirgi_fayl(bugun.isoformat(), "sotuv"):
        await context.bot.send_message(
            guruh_id(),
            f"⚠️ Bugungi AinurPOS savdo Excel hali yuklanmadi.\n"
            f"Hisobot {config.HISOBOT_VAQTI} da chiqadi — undan oldin faylni yuboring.")


_ilova = {}
_konflikt = {"soni": 0}
_tarmoq = {}


async def xato(update, context: ContextTypes.DEFAULT_TYPE):
    if isinstance(context.error, Conflict):
        now = datetime.now(TZ)
        _konflikt["soni"] += 1
        _konflikt.setdefault("bosh", now)
        if not _konflikt.get("oxirgi") or (now - _konflikt["oxirgi"]).total_seconds() > 60:
            _konflikt["oxirgi"] = now
            davom = (now - _konflikt["bosh"]).total_seconds()
            if davom < 60:
                log.warning("Telegram: oldingi ulanish hali yopilmagan (qayta ishga tushgandan keyin "
                            "1 daqiqagacha normal).")
            else:
                log.error("‼️ SHU TOKEN BILAN BOSHQA BOT DASTURI HAM ISHLAYAPTI (%d daqiqadan beri). "
                          "Boshqa kompyuter/serverda ishlayotgan nusxani to'xtating yoki BotFather'da "
                          "/revoke qilib yangi token oling.", davom // 60)
        return
    _konflikt.clear()
    _konflikt["soni"] = 0
    if isinstance(context.error, NetworkError):  # internet uzildi — PTB o'zi qayta urinadi
        now = datetime.now(TZ)
        if not _tarmoq.get("oxirgi") or (now - _tarmoq["oxirgi"]).total_seconds() > 60:
            _tarmoq["oxirgi"] = now
            log.warning("🌐 Internet yo'q (Telegram'ga ulanib bo'lmadi): %s — bot o'zi qayta "
                        "urinmoqda.", context.error)
        return
    log.error("Xato: %s", context.error, exc_info=context.error)


async def kelgan_log(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Botga kelgan har bir xabarni oynaga yozadi (tashxis uchun)."""
    u, c, m = update.effective_user, update.effective_chat, update.effective_message
    if update.callback_query:
        matn = f"[tugma] {update.callback_query.data}"
    elif m and m.document:
        matn = f"[fayl] {m.document.file_name}"
    else:
        matn = (m.text or "") if m else ""
    log.info("Keldi: %s (id %s) | %s %s | %s", u.full_name if u else "-", u.id if u else "-",
             c.type if c else "-", c.id if c else "-", matn[:60])


async def start_guruhda(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Guruhda /start — shaxsiy chatga yo'naltirish."""
    await update.message.reply_text(
        "Bot bilan shaxsiy chatda ishlang:",
        reply_markup=IM([[IB("🤖 Botni ochish", url=f"https://t.me/{context.bot.username}")]]))


async def boshlanish(app):
    """Ishga tushganda: qaysi bot va qaysi guruh ulanganini ko'rsatadi."""
    log.info("Bot: @%s — Telegram'da AYNAN SHU botga yozing", app.bot.username)
    gid = db.sozlama_ol("guruh_id")
    log.info("Guruh: %s", gid or "ULANMAGAN — botni guruhga admin qiling va guruhda /ulash yozing")
    if not ainur_api.token():
        log.info("AinurPOS API: o'chiq (config.py da AINUR_TOKEN yo'q) — Excel rejimi")
        return
    _ilova["app"] = app
    app.create_task(mini_ishga(app))  # mini app serveri va tunnel
    app.create_task(_api_holati())  # fonda — bot javob berishini kutdirmaydi
    app.create_task(_otkazilgan_hisobotlar(app))  # o'chiq paytdagi hisobotlar


async def _otkazilgan_hisobotlar(app):
    """
    Kompyuter o'chiq bo'lib, kunlik hisobot vaqti o'tib ketgan bo'lsa — bot ishga tushganda
    o'sha kunlar hisobotini (oxirgi 3 kun) guruhga kechikib bo'lsa ham yuboradi.
    """
    await asyncio.sleep(20)  # internet va AinurPOS ulanishi tayyor bo'lsin
    gid = guruh_id()
    if not gid:
        return
    now = hozir()
    h, m = map(int, config.HISOBOT_VAQTI.split(":"))
    oxirgi_kun = now.date() if (now.hour, now.minute) >= (h, m) else now.date() - timedelta(days=1)
    v = db.sozlama_ol("oxirgi_kunlik")
    if not v:  # birinchi ishga tushish — faqat belgilab qo'yiladi
        db.sozlama_yoz("oxirgi_kunlik", oxirgi_kun.isoformat())
        return
    from datetime import date as _date
    kun, kunlar = _date.fromisoformat(v) + timedelta(days=1), []
    while kun <= oxirgi_kun:
        if kun.weekday() in config.ISH_KUNLARI:
            kunlar.append(kun)
        kun += timedelta(days=1)
    if not kunlar:
        return
    ctx = SimpleNamespace(bot=app.bot)
    if len(kunlar) > 3:
        await ctx.bot.send_message(gid, f"⏰ Bot {len(kunlar)} kun o'chiq bo'lgan. Oxirgi 3 kun "
                                        "hisoboti yuborilmoqda; qolganlari — 📆 Davr hisoboti orqali.")
    for sana in kunlar[-3:]:
        try:
            await ctx.bot.send_message(gid, f"⏰ <b>Kechikkan hisobot</b> — bot {sana:%d.%m.%Y} kuni "
                                            f"{config.HISOBOT_VAQTI} da o'chiq bo'lgan.", parse_mode=HTML)
            await hisobot_yubor(ctx, gid, sana, yangila=True)
            db.sozlama_yoz("oxirgi_kunlik", sana.isoformat())
            log.info("Kechikkan kunlik hisobot yuborildi: %s", sana)
        except Exception as e:
            log.error("Kechikkan hisobot yuborilmadi (%s): %s", sana, e)
            break
    db.sozlama_yoz("oxirgi_kunlik", oxirgi_kun.isoformat())


async def _api_holati():
    """Bot ishlatadigan AinurPOS bo'limlariga ruxsatni tekshirib, oynaga yozish."""
    try:
        for nom, ok, izoh in await _api(ainur_api.tekshir, soniya=30):
            if ok:
                log.info("AinurPOS API · %s: ✅", nom)
            else:
                log.error("AinurPOS API · %s: ❌ %s", nom, izoh)
    except Exception as e:
        log.error("AinurPOS API tekshiruvi: %s", e)


def _vaqt(s):
    h, m = map(int, s.split(":"))
    return dtime(h, m, tzinfo=TZ)


def ilova():
    db.ulanish()
    daftar.yaratish()
    app = (Application.builder().token(config.BOT_TOKEN).post_init(boshlanish)
           .concurrent_updates(True).build())
    shaxsiy = filters.ChatType.PRIVATE
    app.add_handler(TypeHandler(Update, kelgan_log), group=-1)  # tashxis logi
    app.add_handler(CommandHandler("start", start, shaxsiy))
    app.add_handler(CommandHandler("start", start_guruhda, filters.ChatType.GROUPS))
    app.add_handler(CommandHandler("ulash", ulash))
    app.add_handler(CommandHandler(["kunlik", "hisobot"], kunlik_cmd))
    app.add_handler(CommandHandler("api", api_cmd))
    app.add_handler(CommandHandler("qarz", qarz_menyu))
    app.add_handler(CommandHandler("kochir", kochir_cmd, shaxsiy))
    app.add_handler(CallbackQueryHandler(kochir_tugma, pattern=r"^kch:"))
    app.add_handler(CommandHandler("lenta", lenta_cmd))
    app.add_handler(CallbackQueryHandler(mijoz_tugma, pattern=r"^(m|mp):"))
    app.add_handler(CallbackQueryHandler(qarz_tugma, pattern=r"^q[xy]$"))
    app.add_handler(CallbackQueryHandler(davr_tugma, pattern=r"^d:"))
    app.add_handler(CallbackQueryHandler(noop, pattern=r"^noop$"))
    app.add_handler(CallbackQueryHandler(guruhga_tugma, pattern=r"^g:"))
    app.add_handler(CallbackQueryHandler(qol_tolov_tugma, pattern=r"^qt:\d+$"))
    app.add_handler(CommandHandler(["yordam", "help"], yordam))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_HISOBOT]), bugun_shaxsiy))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_YORDAM]), yordam))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_DAVR]), davr_menyu))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_MIJOZ]), mijozlar_menyu))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_QARZ]), qarz_menyu))
    app.add_handler(MessageHandler(shaxsiy & filters.Text([BTN_SOTUV]), mini_ochish))
    for h in rasxod.moduli(_ruxsat, adminmi, hozir, guruh_id, MENYU_OL):
        app.add_handler(h)
    app.add_handler(MessageHandler(shaxsiy & filters.TEXT & ~filters.COMMAND, boshqa_matn))
    app.add_handler(MessageHandler(filters.Document.ALL, excel_qabul))
    app.add_handler(MessageHandler(filters.StatusUpdate.MIGRATE, migratsiya))
    app.add_error_handler(xato)

    app.job_queue.run_daily(kunlik_job, _vaqt(config.HISOBOT_VAQTI), name="kunlik")
    app.job_queue.run_daily(eslatma_job, _vaqt(config.ESLATMA_VAQTI), name="eslatma")
    app.job_queue.run_repeating(lenta_job, interval=LENTA_DAQIQA * 60, first=30, name="lenta")
    app.job_queue.run_repeating(mini_tekshir, interval=120, first=180, name="mini")
    app.job_queue.run_repeating(navbat_job, interval=90, first=60, name="navbat")
    return app


def yagona_nusxa():
    """
    Shu kompyuterda bot allaqachon ishlayaptimi — lokal portni band qilib tekshiriladi.
    Band bo'lsa (ikkinchi start.bat oynasi) None qaytadi.
    """
    q = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        q.bind(("127.0.0.1", 47831))
        q.listen(1)
        return q
    except OSError:
        q.close()
        return None


if __name__ == "__main__":
    if "BU_YERGA" in config.BOT_TOKEN or not config.BOT_TOKEN.strip():
        log.error("config.py faylida BOT_TOKEN yo'q. Notepad'da config.py ni ochib, BotFather "
                  "bergan tokenni qo'ying: BOT_TOKEN = \"1234:AA...\"")
        raise SystemExit(4)  # start.bat qayta urinmaydi
    _qulf = yagona_nusxa()  # dastur ishlaguncha ushlab turiladi
    if _qulf is None:
        log.error("Bot bu kompyuterda boshqa oynada ALLAQACHON ishlayapti — bu nusxa yopiladi.")
        raise SystemExit(3)
    log.info("PROMAX hisobot boti ishga tushdi")
    ilova().run_polling(allowed_updates=Update.ALL_TYPES)
