# -*- coding: utf-8 -*-
"""
Daftar — botning o'z hisobi: mijozlar, savdo, to'lovlar, qarzdorlik.

AinurPOS endi faqat ombor uchun: savdo avval shu daftarga yoziladi, keyin
AinurPOS'ga chiqim hujjati sifatida navbat bilan yuboriladi (qoldiq kamayishi uchun).

Qarz = boshlang'ich qarz + savdolar − savdo paytidagi to'lovlar − alohida to'lovlar.
"""
import json
import re
import sqlite3

import db

# AinurPOS'ga yuborish holati
NAVBAT, YUBORILDI, XATO, YUBORILMAYDI = "navbat", "yuborildi", "xato", "yuborilmaydi"


def _c():
    return db.ulanish()


def yaratish():
    """Daftar jadvallari (bot ishga tushganda chaqiriladi)."""
    _c().executescript("""
    CREATE TABLE IF NOT EXISTS d_mijoz(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL, nom_norm TEXT NOT NULL,
        telefon TEXT, shahar TEXT,
        boshlangich REAL DEFAULT 0,          -- AinurPOS'dan ko'chirilgan qarz
        ainur_id TEXT,                        -- AinurPOS dagi mijoz ID si
        faol INTEGER DEFAULT 1, yaratilgan TEXT);
    CREATE INDEX IF NOT EXISTS ix_dmijoz_norm ON d_mijoz(nom_norm);

    CREATE TABLE IF NOT EXISTS d_savdo(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sana TEXT NOT NULL, vaqt TEXT NOT NULL,
        mijoz_id INTEGER, mijoz TEXT,
        jami REAL NOT NULL, tolangan REAL DEFAULT 0, turi TEXT,
        izoh TEXT, kim TEXT, kim_id INTEGER, dokon TEXT,
        bekor INTEGER DEFAULT 0,
        ainur_holat TEXT DEFAULT 'navbat', ainur_izoh TEXT, urinish INTEGER DEFAULT 0,
        yaratilgan TEXT);
    CREATE INDEX IF NOT EXISTS ix_dsavdo_sana ON d_savdo(sana);
    CREATE INDEX IF NOT EXISTS ix_dsavdo_mijoz ON d_savdo(mijoz_id);
    CREATE INDEX IF NOT EXISTS ix_dsavdo_holat ON d_savdo(ainur_holat);

    CREATE TABLE IF NOT EXISTS d_qator(
        savdo_id INTEGER NOT NULL, tovar_id TEXT, nomi TEXT,
        soni REAL, narx REAL, birlik TEXT);
    CREATE INDEX IF NOT EXISTS ix_dqator ON d_qator(savdo_id);

    CREATE TABLE IF NOT EXISTS d_tolov(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sana TEXT NOT NULL, vaqt TEXT NOT NULL,
        mijoz_id INTEGER, mijoz TEXT, summa REAL NOT NULL, turi TEXT,
        izoh TEXT, kim TEXT, kim_id INTEGER, bekor INTEGER DEFAULT 0, yaratilgan TEXT);
    CREATE INDEX IF NOT EXISTS ix_dtolov_sana ON d_tolov(sana);
    CREATE INDEX IF NOT EXISTS ix_dtolov_mijoz ON d_tolov(mijoz_id);
    """)
    _c().commit()


# --- Mijozlar --------------------------------------------------------------------------------
# Qidiruvda kirill/lotin va talaffuz farqlari: Мухтор=Muxtor, og'a=oga, Xorazm=Horazm
_KIRILL = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j",
           "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
           "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "s",
           "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu",
           "я": "ya", "ғ": "g", "қ": "q", "ҳ": "h", "ў": "o", "ъ": ""}


def _norm(s):
    """Qidiruv kaliti: apostrof, kirill va x/h farqlari hisobga olinmaydi."""
    s = str(s or "").lower()
    for a in "ʻʼ‘’`'´":
        s = s.replace(a, "")
    s = "".join(_KIRILL.get(ch, ch) for ch in s)
    s = s.replace("x", "h")          # Xorazm = Horazm
    return re.sub(r"[^\w\s+]", " ", re.sub(r"\s+", " ", s)).strip()


def mijoz_qosh(nom, telefon="", shahar="", boshlangich=0, ainur_id="", yaratilgan=""):
    """Yangi mijoz (shu nom bilan bor bo'lsa — mavjudi qaytadi)."""
    nom = re.sub(r"\s+", " ", str(nom)).strip()[:80]
    c = _c()
    bor = c.execute("SELECT * FROM d_mijoz WHERE nom_norm=?", (_norm(nom),)).fetchone()
    if bor:
        return dict(bor), False
    cur = c.execute("""INSERT INTO d_mijoz(nom, nom_norm, telefon, shahar, boshlangich,
                       ainur_id, yaratilgan) VALUES(?,?,?,?,?,?,?)""",
                    (nom, _norm(nom), telefon, shahar, boshlangich, ainur_id, yaratilgan))
    c.commit()
    return mijoz_ol(cur.lastrowid), True


def mijoz_ol(mid):
    r = _c().execute("SELECT * FROM d_mijoz WHERE id=?", (mid,)).fetchone()
    return dict(r) if r else None


def mijoz_tahrir(mid, **maydon):
    ruxsat = {"nom", "telefon", "shahar", "boshlangich", "faol"}
    qism = {k: v for k, v in maydon.items() if k in ruxsat}
    if not qism:
        return
    c = _c()
    if "nom" in qism:
        qism["nom_norm"] = _norm(qism["nom"])
    c.execute(f"UPDATE d_mijoz SET {', '.join(k + '=?' for k in qism)} WHERE id=?",
              list(qism.values()) + [mid])
    c.commit()


def mijozlar(qidiruv="", faqat_qarzdor=False, limit=0):
    """
    Mijozlar qarzi bilan. qidiruv — nom yoki telefon bo'yicha (so'zma-so'z, tartibsiz).
    Qaytadi: [{id, nom, telefon, shahar, qarz, savdo_soni, oxirgi_savdo}]
    """
    shart, qiymat = ["m.faol=1"], []
    for soz in _norm(qidiruv).split(" "):
        if soz:  # har bir so'z nom yoki telefonda bo'lishi kerak (tartib muhim emas)
            shart.append("(m.nom_norm LIKE ? OR IFNULL(m.telefon,'') LIKE ?)")
            qiymat += [f"%{soz}%", f"%{soz}%"]
    rows = _c().execute(f"""
        SELECT m.id, m.nom, m.telefon, m.shahar, m.boshlangich,
               m.boshlangich
                 + IFNULL((SELECT SUM(s.jami - s.tolangan) FROM d_savdo s
                           WHERE s.mijoz_id=m.id AND s.bekor=0), 0)
                 - IFNULL((SELECT SUM(t.summa) FROM d_tolov t
                           WHERE t.mijoz_id=m.id AND t.bekor=0), 0) AS qarz,
               IFNULL((SELECT COUNT(*) FROM d_savdo s WHERE s.mijoz_id=m.id AND s.bekor=0), 0)
                 AS savdo_soni,
               (SELECT MAX(s.sana) FROM d_savdo s WHERE s.mijoz_id=m.id AND s.bekor=0)
                 AS oxirgi_savdo
        FROM d_mijoz m WHERE {' AND '.join(shart)}
        ORDER BY qarz DESC, m.nom""", qiymat).fetchall()
    natija = [dict(r) for r in rows]
    if faqat_qarzdor:
        natija = [m for m in natija if (m["qarz"] or 0) >= 1]
    return natija[:limit] if limit else natija


def mijoz_qarzi(mid):
    m = mijozlar()
    for x in m:
        if x["id"] == mid:
            return x["qarz"] or 0
    return 0


# --- Savdo -----------------------------------------------------------------------------------
def savdo_qosh(sana, vaqt, mijoz_id, mijoz, qatorlar, tolangan=0, turi="", izoh="",
               kim="", kim_id=0, dokon="", yaratilgan="", ainur_holat=NAVBAT):
    jami = sum(float(q["soni"]) * float(q["narx"]) for q in qatorlar)
    c = _c()
    cur = c.execute("""INSERT INTO d_savdo(sana, vaqt, mijoz_id, mijoz, jami, tolangan, turi,
                       izoh, kim, kim_id, dokon, ainur_holat, yaratilgan)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (sana, vaqt, mijoz_id, mijoz, jami, tolangan, turi, izoh, kim, kim_id,
                     dokon, ainur_holat, yaratilgan))
    sid = cur.lastrowid
    c.executemany("INSERT INTO d_qator VALUES(?,?,?,?,?,?)", [
        (sid, q.get("id") or q.get("tovar_id"), q.get("nom") or q.get("nomi"),
         float(q["soni"]), float(q["narx"]), q.get("birlik") or "pcs") for q in qatorlar])
    c.commit()
    return sid


def savdo_ol(sid):
    r = _c().execute("SELECT * FROM d_savdo WHERE id=?", (sid,)).fetchone()
    if not r:
        return None
    s = dict(r)
    s["qatorlar"] = [dict(x) for x in _c().execute(
        "SELECT * FROM d_qator WHERE savdo_id=?", (sid,)).fetchall()]
    return s


def savdo_bekor(sid):
    c = _c()
    c.execute("UPDATE d_savdo SET bekor=1 WHERE id=?", (sid,))
    c.commit()


def savdolar(bosh, oxir=None, mijoz_id=None, limit=0):
    shart, qiymat = ["bekor=0", "sana BETWEEN ? AND ?"], [bosh, oxir or bosh]
    if mijoz_id:
        shart.append("mijoz_id=?")
        qiymat.append(mijoz_id)
    q = f"SELECT * FROM d_savdo WHERE {' AND '.join(shart)} ORDER BY sana, vaqt, id"
    rows = _c().execute(q + (f" LIMIT {int(limit)}" if limit else ""), qiymat).fetchall()
    return [dict(r) for r in rows]


def savdo_qatorlari(bosh, oxir=None):
    """Davr tovar qatorlari (hisobot uchun jamlangan ko'rinishda)."""
    rows = _c().execute("""
        SELECT q.nomi, q.narx, SUM(q.soni) AS soni, SUM(q.soni * q.narx) AS summa,
               COUNT(*) AS sotish
        FROM d_qator q JOIN d_savdo s ON s.id = q.savdo_id
        WHERE s.bekor=0 AND s.sana BETWEEN ? AND ?
        GROUP BY q.nomi, q.narx ORDER BY summa DESC""", (bosh, oxir or bosh)).fetchall()
    return [{"nomi": r["nomi"], "shtrix": "", "daromad": r["summa"], "foyda": 0, "tannarx": 0,
             "sotish": r["sotish"], "sotilgan": r["soni"]} for r in rows]


def mijoz_savdolari(mid, limit=20):
    return savdolar("0000-01-01", "9999-12-31", mid)[-limit:][::-1]


# --- AinurPOS navbati -------------------------------------------------------------------------
def navbatdagilar(limit=20):
    rows = _c().execute("""SELECT * FROM d_savdo WHERE bekor=0 AND ainur_holat IN (?, ?)
                           AND urinish < 20 ORDER BY id LIMIT ?""",
                        (NAVBAT, XATO, limit)).fetchall()
    return [savdo_ol(r["id"]) for r in rows]


def ainur_belgila(sid, holat, izoh=""):
    c = _c()
    c.execute("""UPDATE d_savdo SET ainur_holat=?, ainur_izoh=?, urinish=urinish+1 WHERE id=?""",
              (holat, izoh[:200], sid))
    c.commit()


def navbat_soni():
    r = _c().execute("""SELECT COUNT(*) n FROM d_savdo WHERE bekor=0 AND ainur_holat IN (?,?)""",
                     (NAVBAT, XATO)).fetchone()
    return r["n"]


# --- To'lovlar --------------------------------------------------------------------------------
def tolov_qosh(sana, vaqt, mijoz_id, mijoz, summa, turi, izoh="", kim="", kim_id=0,
               yaratilgan=""):
    c = _c()
    cur = c.execute("""INSERT INTO d_tolov(sana, vaqt, mijoz_id, mijoz, summa, turi, izoh,
                       kim, kim_id, yaratilgan) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (sana, vaqt, mijoz_id, mijoz, summa, turi, izoh, kim, kim_id, yaratilgan))
    c.commit()
    return cur.lastrowid


def tolov_ol(tid):
    r = _c().execute("SELECT * FROM d_tolov WHERE id=?", (tid,)).fetchone()
    return dict(r) if r else None


def tolov_bekor(tid):
    c = _c()
    c.execute("UPDATE d_tolov SET bekor=1 WHERE id=?", (tid,))
    c.commit()


def tolovlar(bosh, oxir=None, mijoz_id=None):
    shart, qiymat = ["bekor=0", "sana BETWEEN ? AND ?"], [bosh, oxir or bosh]
    if mijoz_id:
        shart.append("mijoz_id=?")
        qiymat.append(mijoz_id)
    return [dict(r) for r in _c().execute(
        f"SELECT * FROM d_tolov WHERE {' AND '.join(shart)} ORDER BY sana, vaqt, id",
        qiymat).fetchall()]


# --- Ko'chirish (AinurPOS → daftar) ------------------------------------------------------------
def kochirildimi():
    return db.sozlama_ol("daftar_kochirildi")


def kochir(mijozlar_royxati, sana, vaqt):
    """
    AinurPOS'dagi hozirgi qarzlarni boshlang'ich qoldiq qilib ko'chirish.
    mijozlar_royxati: [{nom, telefon, qarz, ainur_id}]
    Qaytadi: (yangi mijoz, yangilangan, jami qarz)
    """
    yangi = eski = 0
    jami = 0.0
    for m in mijozlar_royxati:
        nom = (m.get("nom") or "").strip()
        if not nom:
            continue
        qarz = float(m.get("qarz") or 0)
        jami += max(qarz, 0)
        rec, yangimi = mijoz_qosh(nom, m.get("telefon", ""), m.get("shahar", ""),
                                  max(qarz, 0), m.get("ainur_id", ""), f"{sana} {vaqt}")
        if yangimi:
            yangi += 1
        else:  # mavjud mijoz — boshlang'ich qoldiq yangilanadi
            mijoz_tahrir(rec["id"], boshlangich=max(qarz, 0))
            eski += 1
    db.sozlama_yoz("daftar_kochirildi", f"{sana} {vaqt}")
    return yangi, eski, jami
