# -*- coding: utf-8 -*-
"""SQLite baza: to'lovlar, mijozlar, xodim ismlari, yuklangan Excel qatorlari."""
import json
import re
import sqlite3

import config

_conn = None


def ulanish():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_FAYL, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _yaratish(_conn)
    return _conn


def _yaratish(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sozlama(kalit TEXT PRIMARY KEY, qiymat TEXT);
    CREATE TABLE IF NOT EXISTS xodim(user_id INTEGER PRIMARY KEY, ism TEXT);
    CREATE TABLE IF NOT EXISTS mijoz(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL, nom_norm TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS tolov(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sana TEXT, vaqt TEXT, mijoz_id INTEGER, summa INTEGER,
        turi TEXT, maqsad TEXT, user_id INTEGER, qabul_qildi TEXT,
        bekor INTEGER DEFAULT 0, bekor_izoh TEXT, guruh_msg_id INTEGER);
    CREATE TABLE IF NOT EXISTS fayl(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sana TEXT, tur TEXT, yuklandi TEXT, user_id INTEGER,
        yukladi TEXT, fayl_nomi TEXT);
    CREATE TABLE IF NOT EXISTS sotuv_qator(
        fayl_id INTEGER, nomi TEXT, shtrix TEXT, daromad REAL, foyda REAL,
        tannarx REAL, sotish REAL, sotilgan REAL);
    CREATE TABLE IF NOT EXISTS qoldiq_qator(
        fayl_id INTEGER, nomi TEXT, shtrix TEXT, boshl REAL, kelish REAL,
        istemol REAL, yakuniy REAL);
    CREATE TABLE IF NOT EXISTS sotuv_hujjat(
        fayl_id INTEGER, raqam TEXT, vaqt TEXT, mijoz TEXT, xodim TEXT,
        jami REAL, tolangan REAL, turlar TEXT);
    CREATE TABLE IF NOT EXISTS qaytarish(
        fayl_id INTEGER, raqam TEXT, vaqt TEXT, mijoz TEXT, dona REAL, jami REAL);
    CREATE TABLE IF NOT EXISTS mijoz_qarz(
        sana TEXT, mijoz_id TEXT, nom TEXT, qarz REAL);
    CREATE INDEX IF NOT EXISTS ix_qarz_sana ON mijoz_qarz(sana);
    CREATE TABLE IF NOT EXISTS hujjat_holat(
        id TEXT PRIMARY KEY, raqam TEXT, sana TEXT, mijoz TEXT,
        jami REAL, tolangan REAL, turlar TEXT);
    CREATE TABLE IF NOT EXISTS harakat(
        id TEXT PRIMARY KEY, tur TEXT, raqam TEXT, sana TEXT, vaqt TEXT, kontragent TEXT,
        xodim TEXT, dona REAL, summa REAL, tolangan REAL, ichki INTEGER, ochirilgan INTEGER,
        yuborildi TEXT);
    CREATE INDEX IF NOT EXISTS ix_harakat_sana ON harakat(sana);
    CREATE TABLE IF NOT EXISTS navbat(
        id INTEGER PRIMARY KEY AUTOINCREMENT, vaqt TEXT, holat TEXT, xato TEXT,
        mijoz TEXT, summa REAL, dona REAL, sorov TEXT, kim TEXT);
    CREATE TABLE IF NOT EXISTS qolda_tolov(
        id INTEGER PRIMARY KEY AUTOINCREMENT, sana TEXT, vaqt TEXT, mijoz_id TEXT,
        mijoz TEXT, summa REAL, turi TEXT, kim TEXT, izoh TEXT,
        ainurga_kiritildi INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS ix_qolda_sana ON qolda_tolov(sana);
    CREATE TABLE IF NOT EXISTS qol_tolov(
        id INTEGER PRIMARY KEY AUTOINCREMENT, sana TEXT, vaqt TEXT, mijoz_id TEXT, mijoz TEXT,
        summa REAL, turi TEXT, kim TEXT, ainurga TEXT);
    CREATE INDEX IF NOT EXISTS ix_qol_sana ON qol_tolov(sana);
    CREATE TABLE IF NOT EXISTS rasxod_kategoriya(
        id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT UNIQUE NOT NULL,
        tartib INTEGER DEFAULT 100, faol INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS rasxod(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sana TEXT NOT NULL, vaqt TEXT NOT NULL,
        summa REAL NOT NULL, kategoriya TEXT NOT NULL,
        izoh TEXT, kim TEXT, kim_id INTEGER,
        bekor INTEGER DEFAULT 0, yaratilgan TEXT);
    CREATE INDEX IF NOT EXISTS ix_rasxod_sana ON rasxod(sana);
    CREATE TABLE IF NOT EXISTS ainur_mijoz(
        id TEXT PRIMARY KEY, nom TEXT, nom_norm TEXT, telefon TEXT);
    CREATE TABLE IF NOT EXISTS qarz_tolov(
        sana TEXT, vaqt TEXT, hujjat_id TEXT, raqam TEXT, hujjat_sana TEXT,
        mijoz TEXT, summa REAL, turlar TEXT);
    CREATE INDEX IF NOT EXISTS ix_tolov_sana ON tolov(sana);
    CREATE INDEX IF NOT EXISTS ix_fayl_sana ON fayl(sana, tur);
    """)
    # Eski bazaga yangi ustunlar (migratsiya)
    for jadval, ustun, tur in (("hujjat_holat", "mijoz_id", "TEXT"), ("hujjat_holat", "dona", "REAL"),
                               ("qarz_tolov", "mijoz_id", "TEXT")):
        bor = [r[1] for r in c.execute(f"PRAGMA table_info({jadval})")]
        if ustun not in bor:
            c.execute(f"ALTER TABLE {jadval} ADD COLUMN {ustun} {tur}")
    c.commit()


# --- Sozlamalar (guruh ID) ---------------------------------------------------
def sozlama_ol(kalit, standart=None):
    r = ulanish().execute("SELECT qiymat FROM sozlama WHERE kalit=?", (kalit,)).fetchone()
    return r["qiymat"] if r else standart


def sozlama_yoz(kalit, qiymat):
    c = ulanish()
    c.execute("INSERT OR REPLACE INTO sozlama VALUES(?,?)", (kalit, str(qiymat)))
    c.commit()


# --- Xodim ismi ----------------------------------------------------------------
def xodim_ismi(user_id, standart):
    r = ulanish().execute("SELECT ism FROM xodim WHERE user_id=?", (user_id,)).fetchone()
    return r["ism"] if r else standart


def xodim_ism_yoz(user_id, ism):
    c = ulanish()
    c.execute("INSERT OR REPLACE INTO xodim VALUES(?,?)", (user_id, ism.strip()))
    c.commit()


# --- Mijozlar -------------------------------------------------------------------
def _nnorm(s):
    s = s.lower()
    for a in "ʻʼ‘’`":
        s = s.replace(a, "'")
    return re.sub(r"\s+", " ", s).strip()


def mijoz_qidir(matn, limit=8):
    """Aniq mos (id) yoki o'xshash mijozlar ro'yxatini qaytaradi."""
    n = _nnorm(matn)
    c = ulanish()
    r = c.execute("SELECT id, nom FROM mijoz WHERE nom_norm=?", (n,)).fetchone()
    if r:
        return r, []
    # So'zlar bo'yicha qisman moslik ("sodiq" → "Sodiqjon aka")
    sozlar = [s for s in n.split(" ") if len(s) >= 3] or [n]
    shart = " OR ".join("nom_norm LIKE ?" for _ in sozlar)
    rows = c.execute(f"SELECT id, nom FROM mijoz WHERE {shart} ORDER BY nom LIMIT ?",
                     [f"%{s}%" for s in sozlar] + [limit]).fetchall()
    return None, rows


def mijoz_qosh(nom):
    nom = re.sub(r"\s+", " ", nom).strip()
    c = ulanish()
    c.execute("INSERT OR IGNORE INTO mijoz(nom, nom_norm) VALUES(?,?)", (nom, _nnorm(nom)))
    c.commit()
    return c.execute("SELECT id, nom FROM mijoz WHERE nom_norm=?", (_nnorm(nom),)).fetchone()


def mijoz_ol(mid):
    return ulanish().execute("SELECT id, nom FROM mijoz WHERE id=?", (mid,)).fetchone()


def kop_mijozlar(limit=6):
    """Eng ko'p to'lov qilgan mijozlar (tezkor tugmalar uchun)."""
    return ulanish().execute("""
        SELECT m.id, m.nom FROM mijoz m JOIN tolov t ON t.mijoz_id=m.id AND t.bekor=0
        GROUP BY m.id ORDER BY COUNT(*) DESC, MAX(t.id) DESC LIMIT ?""", (limit,)).fetchall()


# --- To'lovlar ------------------------------------------------------------------
def tolov_qosh(sana, vaqt, mijoz_id, summa, turi, maqsad, user_id, qabul_qildi):
    c = ulanish()
    cur = c.execute("""INSERT INTO tolov(sana, vaqt, mijoz_id, summa, turi, maqsad,
                       user_id, qabul_qildi) VALUES(?,?,?,?,?,?,?,?)""",
                    (sana, vaqt, mijoz_id, summa, turi, maqsad, user_id, qabul_qildi))
    c.commit()
    return cur.lastrowid


def tolov_msg_yoz(tid, msg_id):
    c = ulanish()
    c.execute("UPDATE tolov SET guruh_msg_id=? WHERE id=?", (msg_id, tid))
    c.commit()


def tolov_ol(tid):
    return ulanish().execute("""SELECT t.*, m.nom AS mijoz FROM tolov t
        LEFT JOIN mijoz m ON m.id=t.mijoz_id WHERE t.id=?""", (tid,)).fetchone()


def tolov_msg_boyicha(msg_id):
    return ulanish().execute("SELECT id FROM tolov WHERE guruh_msg_id=?", (msg_id,)).fetchone()


def tolov_bekor(tid, izoh):
    c = ulanish()
    c.execute("UPDATE tolov SET bekor=1, bekor_izoh=? WHERE id=?", (izoh, tid))
    c.commit()


def kun_tolovlari(sana):
    return ulanish().execute("""SELECT t.*, m.nom AS mijoz FROM tolov t
        LEFT JOIN mijoz m ON m.id=t.mijoz_id
        WHERE t.sana=? AND t.bekor=0 ORDER BY t.id""", (sana,)).fetchall()


# --- Excel fayllar --------------------------------------------------------------
def fayl_saqla(sana, tur, yuklandi, user_id, yukladi, fayl_nomi, qatorlar, hujjatlar=None,
               qaytarishlar=None):
    c = ulanish()
    fid = c.execute("""INSERT INTO fayl(sana, tur, yuklandi, user_id, yukladi, fayl_nomi)
                       VALUES(?,?,?,?,?,?)""",
                    (sana, tur, yuklandi, user_id, yukladi, fayl_nomi)).lastrowid
    if tur in ("sotuv", "ichki"):
        c.executemany("INSERT INTO sotuv_qator VALUES(?,?,?,?,?,?,?,?)", [
            (fid, q["nomi"], q["shtrix"], q["daromad"], q["foyda"], q["tannarx"],
             q["sotish"], q["sotilgan"]) for q in qatorlar])
    else:
        c.executemany("INSERT INTO qoldiq_qator VALUES(?,?,?,?,?,?,?)", [
            (fid, q["nomi"], q["shtrix"], q["boshl"], q["kelish"], q["istemol"],
             q["yakuniy"]) for q in qatorlar])
    if hujjatlar:
        c.executemany("INSERT INTO sotuv_hujjat VALUES(?,?,?,?,?,?,?,?)", [
            (fid, h["raqam"], h["vaqt"], h["mijoz"], h["xodim"], h["jami"], h["tolangan"],
             json.dumps(h["turlar"], ensure_ascii=False)) for h in hujjatlar])
    if qaytarishlar:
        c.executemany("INSERT INTO qaytarish VALUES(?,?,?,?,?,?)", [
            (fid, q["raqam"], q["vaqt"], q["mijoz"], q["dona"], q["jami"]) for q in qaytarishlar])
    c.commit()
    return fid


def fayl_hujjatlari(fayl):
    """API orqali olingan savdo hujjatlari (Excel'da bo'lmaydi)."""
    rows = ulanish().execute("SELECT * FROM sotuv_hujjat WHERE fayl_id=? ORDER BY vaqt",
                             (fayl["id"],)).fetchall()
    return [dict(r, turlar=json.loads(r["turlar"] or "{}")) for r in rows]


def oxirgi_fayl(sana, tur):
    """Kun uchun eng oxirgi yuklangan fayl (qayta yuklansa — yangisi amal qiladi)."""
    return ulanish().execute("""SELECT * FROM fayl WHERE sana=? AND tur=?
        ORDER BY id DESC LIMIT 1""", (sana, tur)).fetchone()


def fayl_qatorlari(fayl):
    jadval = "sotuv_qator" if fayl["tur"] in ("sotuv", "ichki") else "qoldiq_qator"
    return [dict(r) for r in ulanish().execute(
        f"SELECT * FROM {jadval} WHERE fayl_id=?", (fayl["id"],)).fetchall()]


def fayl_qaytarishlari(fayl):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM qaytarish WHERE fayl_id=? ORDER BY vaqt", (fayl["id"],)).fetchall()]


# --- Mijozlar qarzi (AinurPOS'dan kunlik surat) --------------------------------------
def qarz_saqla(sana, mijozlar):
    """Kun uchun qarz holatini yozish (shu kun qayta olinsa — almashtiriladi)."""
    c = ulanish()
    c.execute("DELETE FROM mijoz_qarz WHERE sana=?", (sana,))
    c.executemany("INSERT INTO mijoz_qarz VALUES(?,?,?,?)",
                  [(sana, m["id"], m["nom"], m["qarz"]) for m in mijozlar if m["qarz"] is not None])
    c.commit()


def qarz_ol(sana):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM mijoz_qarz WHERE sana=?", (sana,)).fetchall()]


def oldingi_qarz_sanasi(sana):
    r = ulanish().execute("SELECT MAX(sana) s FROM mijoz_qarz WHERE sana<?", (sana,)).fetchone()
    return r["s"] if r else None


def mijozlar_sinx(nomlar):
    """AinurPOS mijozlarini bot ro'yxatiga qo'shish (to'lov kiritishda nomlar bir xil bo'lsin)."""
    c = ulanish()
    c.executemany("INSERT OR IGNORE INTO mijoz(nom, nom_norm) VALUES(?,?)",
                  [(n, _nnorm(n)) for n in nomlar if n and n.strip()])
    c.commit()


# --- Qarz to'lovlari: hujjatlar to'lov holatini kunma-kun solishtirish ---------------
def qarz_tolovlarini_aniqla(bugun, vaqt, holatlar, bosh=None, oxir=None):
    """
    Hujjatlar to'lov holatini yangilash va eski hujjatlar bo'yicha qarz to'lovlarini aniqlash:
    oldingi suratga nisbatan to'langan summasi oshgan (bugundan oldingi) hujjat → qarz to'lovi.
    Har bir to'lov bir marta yoziladi. Birinchi ishga tushishda faqat surat olinadi.
    bosh/oxir berilsa — shu davrda AinurPOS'dan yo'qolgan (o'chirilgan) hujjatlar tozalanadi.
    Qaytaradi: (topilgan soni, birinchimi).
    """
    c = ulanish()
    birinchi = c.execute("SELECT COUNT(*) n FROM hujjat_holat").fetchone()["n"] == 0
    eski = {r["id"]: r for r in c.execute("SELECT * FROM hujjat_holat").fetchall()}
    topildi = []
    for h in holatlar:
        e = eski.get(h["id"])
        if e and h["sana"] and h["sana"] < bugun and h["tolangan"] > (e["tolangan"] or 0) + 0.5:
            et = json.loads(e["turlar"] or "{}")
            farq = {t: v - et.get(t, 0) for t, v in h["turlar"].items() if v - et.get(t, 0) > 0.5}
            topildi.append((bugun, vaqt, h["id"], h["raqam"], h["sana"], h["mijoz"],
                            h["tolangan"] - (e["tolangan"] or 0),
                            json.dumps(farq, ensure_ascii=False), h.get("mijoz_id", "")))
    c.executemany("""INSERT OR REPLACE INTO hujjat_holat(id, raqam, sana, mijoz, jami, tolangan,
                     turlar, mijoz_id, dona) VALUES(?,?,?,?,?,?,?,?,?)""", [
        (h["id"], h["raqam"], h["sana"], h["mijoz"], h["jami"], h["tolangan"],
         json.dumps(h["turlar"], ensure_ascii=False), h.get("mijoz_id", ""), h.get("dona", 0))
        for h in holatlar if h["id"]])
    if bosh and oxir:
        idlar = [h["id"] for h in holatlar if h["id"]]
        c.execute(f"""DELETE FROM hujjat_holat WHERE sana BETWEEN ? AND ?
                      AND id NOT IN ({",".join("?" * len(idlar)) or "''"})""",
                  [bosh, oxir] + idlar)
    c.executemany("""INSERT INTO qarz_tolov(sana, vaqt, hujjat_id, raqam, hujjat_sana, mijoz,
                     summa, turlar, mijoz_id) VALUES(?,?,?,?,?,?,?,?,?)""", topildi)
    c.commit()
    return len(topildi), birinchi


def kun_qarz_tolovlari(sana):
    rows = ulanish().execute("SELECT * FROM qarz_tolov WHERE sana=? ORDER BY vaqt", (sana,)).fetchall()
    return [dict(r, turlar=json.loads(r["turlar"] or "{}")) for r in rows]



def davr_qarz_tolovlari(bosh, oxir):
    rows = ulanish().execute("SELECT * FROM qarz_tolov WHERE sana BETWEEN ? AND ? ORDER BY sana, vaqt",
                             (bosh, oxir)).fetchall()
    return [dict(r, turlar=json.loads(r["turlar"] or "{}")) for r in rows]


# --- AinurPOS mijozlari va qarzdorlik (hujjatlar bo'yicha) ----------------------------
def ainur_mijozlar_saqla(mijozlar):
    c = ulanish()
    c.executemany("INSERT OR REPLACE INTO ainur_mijoz VALUES(?,?,?,?)",
                  [(m["id"], m["nom"], _nnorm(m["nom"]), m["telefon"]) for m in mijozlar if m["id"]])
    c.commit()


def mijozlar_qarzi():
    """
    Barcha mijozlar qarz bilan: [{id, nom, telefon, qarz, hujjat, ochiq, oxirgi}].
    Qarz = saqlangan sotuv hujjatlari bo'yicha (jami − to'langan) yig'indisi.
    """
    rows = ulanish().execute("""
        SELECT m.id, m.nom, m.telefon,
               COALESCE(SUM(MAX(h.jami - h.tolangan, 0)), 0) AS qarz,
               COUNT(h.id) AS hujjat,
               SUM(CASE WHEN h.jami - h.tolangan > 0.5 THEN 1 ELSE 0 END) AS ochiq,
               MAX(h.sana) AS oxirgi
        FROM ainur_mijoz m LEFT JOIN hujjat_holat h ON h.mijoz_id = m.id
        GROUP BY m.id
        UNION ALL
        SELECT h.mijoz_id, MAX(h.mijoz), '', SUM(MAX(h.jami - h.tolangan, 0)), COUNT(*),
               SUM(CASE WHEN h.jami - h.tolangan > 0.5 THEN 1 ELSE 0 END), MAX(h.sana)
        FROM hujjat_holat h
        WHERE COALESCE(h.mijoz_id, '') = '' OR h.mijoz_id NOT IN (SELECT id FROM ainur_mijoz)
        GROUP BY h.mijoz_id
    """).fetchall()
    ichki = {_nnorm(x) for x in getattr(config, "ICHKI_MIJOZLAR", ["X"])}
    return sorted([dict(r) for r in rows if _nnorm(r["nom"] or "") not in ichki],
                  key=lambda r: (-(r["qarz"] or 0), r["nom"] or ""))


def mijoz_qidir_ainur(matn, limit=20):
    sozlar = [x for x in _nnorm(matn).split(" ") if x]
    if not sozlar:
        return []
    shart = " AND ".join("nom_norm LIKE ?" for _ in sozlar)
    return [dict(r) for r in ulanish().execute(
        f"SELECT id, nom FROM ainur_mijoz WHERE {shart} ORDER BY nom LIMIT ?",
        [f"%{x}%" for x in sozlar] + [limit]).fetchall()]


def ainur_mijoz_ol(mid):
    r = ulanish().execute("SELECT * FROM ainur_mijoz WHERE id=?", (mid,)).fetchone()
    return dict(r) if r else None


def mijoz_hujjatlari(mid, limit=None):
    q = "SELECT * FROM hujjat_holat WHERE mijoz_id=? ORDER BY sana DESC, raqam DESC"
    rows = ulanish().execute(q + (f" LIMIT {int(limit)}" if limit else ""), (mid,)).fetchall()
    return [dict(r, turlar=json.loads(r["turlar"] or "{}")) for r in rows]


def mijoz_qarz_tolovlari(mid, limit=10):
    rows = ulanish().execute("SELECT * FROM qarz_tolov WHERE mijoz_id=? ORDER BY sana DESC, vaqt DESC "
                             "LIMIT ?", (mid, limit)).fetchall()
    return [dict(r, turlar=json.loads(r["turlar"] or "{}")) for r in rows]


# --- Offline rejim: saqlangan ma'lumotdan hisobot ---------------------------------------
def oxirgi_sana(tur, gacha):
    r = ulanish().execute("SELECT MAX(sana) s FROM fayl WHERE tur=? AND sana<=?", (tur, gacha)).fetchone()
    return r["s"] if r else None


def davr_keshdan(bosh, oxir):
    """Davr uchun bot saqlagan kunlik ma'lumotlarni yig'ish (AinurPOS offline bo'lganda)."""
    q, hj, qayt, iq, ih, bor = [], [], [], [], [], []
    kunlar = [r["sana"] for r in ulanish().execute(
        "SELECT DISTINCT sana FROM fayl WHERE tur='sotuv' AND sana BETWEEN ? AND ? ORDER BY sana",
        (bosh, oxir)).fetchall()]
    for kun in kunlar:
        f = oxirgi_fayl(kun, "sotuv")
        fi = oxirgi_fayl(kun, "ichki")
        bor.append(kun)
        q += fayl_qatorlari(f)
        hj += [dict(h, vaqt=f"{kun[8:10]}.{kun[5:7]} {h['vaqt']}") for h in fayl_hujjatlari(f)]
        qayt += fayl_qaytarishlari(f)
        if fi:
            iq += fayl_qatorlari(fi)
            ih += fayl_hujjatlari(fi)
    return q, hj, qayt, iq, ih, bor


# --- Kirim-chiqim lentasi -----------------------------------------------------------------
def harakat_holati():
    """Saqlangan hujjatlar: {id: ochirilgan}."""
    return {r["id"]: r["ochirilgan"] for r in ulanish().execute("SELECT id, ochirilgan FROM harakat")}


def harakat_saqla(h, yuborildi):
    c = ulanish()
    c.execute("""INSERT OR REPLACE INTO harakat VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (h["id"], h["tur"], h["raqam"], h["sana"], h["vaqt"], h["kontragent"], h["xodim"],
               h["dona"], h["summa"], h["tolangan"], int(h["ichki"]), int(h["ochirilgan"]), yuborildi))
    c.commit()


def kun_harakatlari(sana):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM harakat WHERE sana=? ORDER BY vaqt", (sana,)).fetchall()]


def davr_harakatlari(bosh, oxir):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM harakat WHERE sana BETWEEN ? AND ? ORDER BY sana, vaqt", (bosh, oxir)).fetchall()]


# --- Mini app: sotuv navbati va qo'lda kiritilgan qarz to'lovlari -----------------------
def navbat_qosh(holat, xato, mijoz, summa, dona, sorov, kim):
    """Sotuvni yozib qo'yish: 'yuborildi' yoki 'navbatda' (AinurPOS qabul qilmagan)."""
    c = ulanish()
    cur = c.execute("INSERT INTO navbat(vaqt, holat, xato, mijoz, summa, dona, sorov, kim) "
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (__import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                     holat, xato, mijoz, summa, dona, json.dumps(sorov, ensure_ascii=False), kim))
    c.commit()
    return cur.lastrowid


def navbatdagilar():
    return [dict(r, sorov=json.loads(r["sorov"])) for r in ulanish().execute(
        "SELECT * FROM navbat WHERE holat='navbatda' ORDER BY id").fetchall()]


def navbat_yangila(nid, holat, xato=""):
    c = ulanish()
    c.execute("UPDATE navbat SET holat=?, xato=? WHERE id=?", (holat, xato, nid))
    c.commit()


def qolda_tolov_qosh(sana, vaqt, mijoz_id, mijoz, summa, turi, kim, izoh=""):
    c = ulanish()
    cur = c.execute("""INSERT INTO qolda_tolov(sana, vaqt, mijoz_id, mijoz, summa, turi, kim, izoh)
                       VALUES(?,?,?,?,?,?,?,?)""",
                    (sana, vaqt, mijoz_id, mijoz, summa, turi, kim, izoh))
    c.commit()
    return cur.lastrowid


def kun_qolda_tolovlari(sana):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM qolda_tolov WHERE sana=? ORDER BY id", (sana,)).fetchall()]


def davr_qolda_tolovlari(bosh, oxir):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM qolda_tolov WHERE sana BETWEEN ? AND ? ORDER BY sana, id",
        (bosh, oxir)).fetchall()]


def qolda_tolov_belgila(tid, kiritildi=1):
    c = ulanish()
    c.execute("UPDATE qolda_tolov SET ainurga_kiritildi=? WHERE id=?", (kiritildi, tid))
    c.commit()


def kiritilmagan_tolovlar():
    """AinurPOS'ga hali qo'lda kiritilmagan to'lovlar (eslatma uchun)."""
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM qolda_tolov WHERE ainurga_kiritildi=0 ORDER BY sana, id").fetchall()]


# --- Mini app: qo'lda kiritilgan qarz to'lovlari -------------------------------------------
def qol_tolov_qosh(sana, vaqt, mijoz_id, mijoz, summa, turi, kim):
    c = ulanish()
    cur = c.execute("""INSERT INTO qol_tolov(sana, vaqt, mijoz_id, mijoz, summa, turi, kim)
                       VALUES(?,?,?,?,?,?,?)""", (sana, vaqt, mijoz_id, mijoz, summa, turi, kim))
    c.commit()
    return cur.lastrowid


def qol_tolovlar(bosh, oxir=None):
    return [dict(r) for r in ulanish().execute(
        "SELECT * FROM qol_tolov WHERE sana BETWEEN ? AND ? ORDER BY sana, vaqt",
        (bosh, oxir or bosh)).fetchall()]


def qol_tolov_belgila(tid, kim):
    """«AinurPOS'ga kiritildi» belgisi."""
    c = ulanish()
    c.execute("UPDATE qol_tolov SET ainurga=? WHERE id=?", (kim, tid))
    c.commit()


def qol_tolov_ol(tid):
    r = ulanish().execute("SELECT * FROM qol_tolov WHERE id=?", (tid,)).fetchone()
    return dict(r) if r else None


# --- Rasxod moduli --------------------------------------------------------------------------
STANDART_KATEGORIYA = ["Obed", "Alohida rasxod", "Transport", "Boshqa"]


def kategoriyalar(hammasi=False):
    """Rasxod kategoriyalari ro'yxati. Birinchi chaqiruvda standartlari yoziladi."""
    c = ulanish()
    if not c.execute("SELECT 1 FROM rasxod_kategoriya LIMIT 1").fetchone():
        c.executemany("INSERT OR IGNORE INTO rasxod_kategoriya(nom, tartib) VALUES(?,?)",
                      [(n, i * 10) for i, n in enumerate(STANDART_KATEGORIYA)])
        c.commit()
    shart = "" if hammasi else " WHERE faol=1"
    return [dict(r) for r in c.execute(
        f"SELECT * FROM rasxod_kategoriya{shart} ORDER BY tartib, nom")]


def kategoriya_ol(kid):
    r = ulanish().execute("SELECT * FROM rasxod_kategoriya WHERE id=?", (kid,)).fetchone()
    return dict(r) if r else None


def kategoriya_qosh(nom):
    """Yangi kategoriya (mavjud bo'lsa — qayta faollashtiriladi). Qaytaradi: (id, yangimi)."""
    nom = re.sub(r"\s+", " ", str(nom)).strip()[:40]
    c = ulanish()
    bor = c.execute("SELECT id, faol FROM rasxod_kategoriya WHERE lower(nom)=lower(?)",
                    (nom,)).fetchone()
    if bor:
        if not bor["faol"]:
            c.execute("UPDATE rasxod_kategoriya SET faol=1 WHERE id=?", (bor["id"],))
            c.commit()
        return bor["id"], False
    cur = c.execute("INSERT INTO rasxod_kategoriya(nom, tartib) VALUES(?, 100)", (nom,))
    c.commit()
    return cur.lastrowid, True


def kategoriya_ochir(kid):
    """Kategoriyani ro'yxatdan olib tashlash (eski rasxodlar saqlanib qoladi)."""
    c = ulanish()
    c.execute("UPDATE rasxod_kategoriya SET faol=0 WHERE id=?", (kid,))
    c.commit()


def rasxod_qosh(sana, vaqt, summa, kategoriya, izoh, kim, kim_id, yaratilgan):
    c = ulanish()
    cur = c.execute("""INSERT INTO rasxod(sana, vaqt, summa, kategoriya, izoh, kim, kim_id,
                       yaratilgan) VALUES(?,?,?,?,?,?,?,?)""",
                    (sana, vaqt, summa, kategoriya, izoh or "", kim, kim_id, yaratilgan))
    c.commit()
    return cur.lastrowid


def rasxod_ol(rid):
    r = ulanish().execute("SELECT * FROM rasxod WHERE id=?", (rid,)).fetchone()
    return dict(r) if r else None


def rasxod_bekor(rid):
    c = ulanish()
    c.execute("UPDATE rasxod SET bekor=1 WHERE id=?", (rid,))
    c.commit()


def rasxodlar(bosh, oxir=None):
    """Davr rasxodlari (bekor qilinganlari chiqmaydi)."""
    return [dict(r) for r in ulanish().execute(
        """SELECT * FROM rasxod WHERE sana BETWEEN ? AND ? AND bekor=0
           ORDER BY sana, vaqt, id""", (bosh, oxir or bosh)).fetchall()]
