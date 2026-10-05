# -*- coding: utf-8 -*-
"""
AinurPOS to PROMAX Store B2B DB Migration Engine.

Ushbu skript AinurPOS Connect API v4 dan barcha ma'lumotlarni oladi:
  1. Mijozlar va ularning haqiqiy qarzdorlik balansi
  2. Tovarlar katalogi (birlik, shtrix-kod, model, narxlar va haqiqiy ombor qoldiqlari)
  3. Barcha savdolar va savdo qatorlari (tarix)
  4. Kirim va harakat hujjatlari

Natijani:
  - 'yuklangan/ainur_full_backup.json' fayliga zaxiralaydi
  - 'supabase/ainur_migration.sql' fayliga to'liq Supabase (PostgreSQL) import skriptini chiqaradi
  - 'promax_hisobot.db' (SQLite) lokal bazasiga to'liq yozadi
  - Agar SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY bo'lsa, to'g'ridan-to'g'ri Supabase'ga yuklaydi.
"""

import os
import sys
import json
import re
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
import sqlite3

import config
import db
from ainur import rangsiz, _norm, _son

TZ = ZoneInfo(config.VAQT_ZONASI)
BAZA = "https://connect.ainur.app/api/v4"
TOKEN = getattr(config, "AINUR_TOKEN", "").strip()


def api_get_all(path, params=None):
    """AinurPOS API sahifalarini barchasini xavfsiz yig'ish."""
    if not TOKEN:
        raise ValueError("config.py da AINUR_TOKEN topilmadi!")

    params = params or {}
    results = []
    headers = {
        "X-AINUR-API-Access-Token": TOKEN,
        "Accept": "application/json",
        "User-Agent": "PromaxMigration/1.0",
    }

    limit = 100
    for page in range(200):
        p = dict(params, limit=limit, offset=page * limit)
        url = BAZA + path + "?" + urllib.parse.urlencode(p)
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read().decode("utf-8")
                data = json.loads(raw)
                items = data if isinstance(data, list) else (
                    data.get("data") or data.get("shops") or []
                )
                results.extend([x for x in items if isinstance(x, dict)])
                if len(items) < limit:
                    break
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            print(f"  [XATO] {path} sahifa {page}: {e.code} - {msg[:120]}")
            break
        except Exception as e:
            print(f"  [XATO] {path} sahifa {page}: {e}")
            break
    return results


def tozalash_matn(s):
    """Cyrillic / O'zbekcha matnni xavfsiz tozalash."""
    if not s:
        return ""
    s = str(s).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def tozalash_telefon(phone_val):
    """Telefon raqamlarini tozalash va birinchi aniq raqamni olish."""
    if not phone_val:
        return None
    if isinstance(phone_val, list):
        phone_val = next((p for p in phone_val if p and str(p).strip()), "")
    p = str(phone_val).strip()
    p = re.sub(r"[^\d+]", "", p)
    return p if len(p) >= 7 else None


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    print("=" * 65)
    print(">>> AINURPOS MA'LUMOTLARINI MIGRATSIYA QILISH BOSHLANDI")
    print("=" * 65)

    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    os.makedirs("supabase", exist_ok=True)

    # 1. Mijozlarni yuklash
    print("\n[1/5] Mijozlar AinurPOS dan olinmoqda...")
    raw_customers = api_get_all("/customers", {})
    print(f"  -> Topildi: {len(raw_customers)} ta mijoz")

    # 2. Tovarlarni yuklash
    print("\n[2/5] Mahsulotlar katalogi va qoldiqlari olinmoqda...")
    raw_products = api_get_all("/product", {})
    print(f"  -> Topildi: {len(raw_products)} ta mahsulot")

    # 3. Omborlar ro'yxati
    print("\n[3/5] Do'kon va omborlar olinmoqda...")
    raw_stores = api_get_all("/stores", {})
    stores_map = {s["id"]: s.get("name", "Ombor") for s in raw_stores if "id" in s}
    print(f"  -> Topildi: {len(stores_map)} ta ombor: {list(stores_map.values())}")

    # 4. Hujjatlar: Savdolar, Kirimlar, Tuzatishlar, Qaytarishlar
    print("\n[4/5] Tranzaksiya va hujjatlar olinmoqda (oxirgi 6 oy)...")
    cur = date.today()
    all_sales = []
    all_changes = []
    all_returns = []
    seen_sales = set()
    seen_changes = set()
    seen_returns = set()

    for i in range(6):  # 6 ta 30 kunlik davr (180 kun)
        start = cur - timedelta(days=30)
        p = {"time_start": f"{start} 00:00:00", "time_end": f"{cur} 23:59:59"}
        
        sales_chunk = api_get_all("/documents/sales", p)
        for s in sales_chunk:
            if s.get("id") and s["id"] not in seen_sales:
                seen_sales.add(s["id"])
                all_sales.append(s)

        changes_chunk = api_get_all("/documents/changes", p)
        for c in changes_chunk:
            if c.get("id") and c["id"] not in seen_changes:
                seen_changes.add(c["id"])
                all_changes.append(c)

        returns_chunk = api_get_all("/documents/return", dict(p, type="sales"))
        for r in returns_chunk:
            if r.get("id") and r["id"] not in seen_returns:
                seen_returns.add(r["id"])
                all_returns.append(r)

        cur = start - timedelta(days=1)

    print(f"  -> Jami savdo hujjatlari: {len(all_sales)} ta")
    print(f"  -> Jami qoldiq tuzatishlar: {len(all_changes)} ta")
    print(f"  -> Jami qaytarishlar: {len(all_returns)} ta")

    raw_purchases = api_get_all("/documents/purchases", {})
    print(f"  -> Jami kirim hujjatlari: {len(raw_purchases)} ta")

    # 5. Xom nusxani to'liq zaxiraga saqlash
    backup_file = os.path.join(config.FAYL_PAPKA, "ainur_full_backup.json")
    print(f"\n[5/5] Barcha ma'lumotlar arxivlanmoqda: {backup_file}")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "customers": raw_customers,
            "products": raw_products,
            "stores": raw_stores,
            "sales": all_sales,
            "purchases": raw_purchases,
            "changes": all_changes,
            "returns": all_returns,
        }, f, ensure_ascii=False, indent=2)
    print("  -> Zaxira muvaffaqiyatli saqlandi.")

    # =========================================================================
    # MA'LUMOTLARNI QAYTA ISHLASH VA NORMALIZATSIYA QILISH
    # =========================================================================
    print("\nMa'lumotlarni normalizatsiya qilish va hisoblash...")

    # Narxlar xaritasini hosil qilish (Product catalog -> Purchases -> Changes -> Sales -> Excel Models)
    catalog_prices = {}
    purchase_costs = {}
    model_prices = {}

    # Excel hisobotlardan o'rtacha narxlar
    import glob, openpyxl
    for f_path in glob.glob("yuklangan/Hisobot*.xlsx"):
        try:
            wb = openpyxl.load_workbook(f_path, data_only=True)
            if "Modellar" in wb.sheetnames:
                for row in list(wb["Modellar"].iter_rows(values_only=True))[1:]:
                    m_nom = str(row[0] or "").strip().upper()
                    pr = row[2] if len(row) > 2 else None
                    if pr and isinstance(pr, (int, float)) and pr > 1000:
                        model_prices[m_nom] = float(pr)
            if "Pozitsiyalar" in wb.sheetnames:
                for row in list(wb["Pozitsiyalar"].iter_rows(values_only=True))[1:]:
                    t_nom = str(row[0] or "").strip()
                    pr = row[6] if len(row) > 6 else None
                    if pr and isinstance(pr, (int, float)) and pr > 1000:
                        model_prices[t_nom] = float(pr)
                        model_prices[rangsiz(t_nom)] = float(pr)
        except Exception:
            pass

    for prod in raw_products:
        p_name = (prod.get("options") or {}).get("name")
        p_price = float(prod.get("price") or 0)
        if p_name and p_price > 0:
            catalog_prices[p_name] = p_price

    for pur in raw_purchases:
        for item in pur.get("line_items") or []:
            t = item.get("title")
            pr = float(item.get("price") or 0)
            if t and pr > 0:
                purchase_costs[t] = pr
                if t not in catalog_prices:
                    catalog_prices[t] = pr

    for chg in all_changes:
        for item in chg.get("line_items") or []:
            t = item.get("title")
            pr = float(item.get("price") or 0)
            if t and pr > 0 and t not in catalog_prices:
                catalog_prices[t] = pr

    for sl in all_sales:
        for item in sl.get("line_items") or []:
            t = item.get("title")
            pr = float(item.get("price") or 0)
            if t and pr > 0 and t not in catalog_prices:
                catalog_prices[t] = pr

    # A) Mijozlar qarzdorligini har bir sotuv hujjati bo'yicha hisoblash
    customer_debts = {}
    customer_sales_count = {}
    customer_last_sale = {}

    for s in all_sales:
        if (s.get("document_flags") or {}).get("deleted"):
            continue
        c_obj = s.get("customer") or {}
        c_id = c_obj.get("id") or ""
        tot = float(s.get("total_price") or 0)
        pt = s.get("payment_terms") or {}
        paid = float((s.get("metrics") or {}).get("paid_sum") or 0)
        is_paid = pt.get("paid") is True
        under = pt.get("underpayment") is True

        # Hujjat vaqti
        s_date = (s.get("processed_at") or s.get("created_at") or "")[:10]

        if c_id:
            customer_sales_count[c_id] = customer_sales_count.get(c_id, 0) + 1
            if not customer_last_sale.get(c_id) or s_date > customer_last_sale[c_id]:
                customer_last_sale[c_id] = s_date

        if under or (not is_paid and tot > paid):
            qarz = max(tot - paid, 0)
            if qarz > 0 and c_id:
                customer_debts[c_id] = customer_debts.get(c_id, 0.0) + qarz

    # Mijozlar to'plami
    processed_customers = []
    for c in raw_customers:
        cid = c.get("id")
        billing = c.get("billing") or {}
        name = tozalash_matn(c.get("name") or billing.get("name") or "Nomsiz")
        phone = tozalash_telefon(c.get("phone") or billing.get("phone"))
        qarz = customer_debts.get(cid, 0.0)

        processed_customers.append({
            "ainur_id": cid,
            "nom": name,
            "nom_norm": _norm(name),
            "telefon": phone or "",
            "qarz_uzs": qarz,
            "qarz_usd": 0.0,
            "hujjat_soni": customer_sales_count.get(cid, 0),
            "oxirgi_xarid": customer_last_sale.get(cid, ""),
        })

    total_debt_sum = sum(c["qarz_uzs"] for c in processed_customers)
    print(f"  -> Qayta ishlangan mijozlar: {len(processed_customers)} ta")
    print(f"  -> Aniqlangan umumiy qarz balansi: {total_debt_sum:,.0f} UZS")

    # B) Tovarlar to'plami
    processed_products = []
    total_stock_all = 0.0

    for p in raw_products:
        pid = p.get("id")
        opt = p.get("options") or {}
        raw_name = tozalash_matn(opt.get("name") or p.get("name") or "?")
        barcode = str(p.get("barcode") or p.get("sku") or "").strip()
        code = str(p.get("code") or "").strip()
        unit = str(p.get("unit") or "dona").strip()
        if unit in ("шт", "шт."):
            unit = "dona"

        # Qoldiq (barcha omborlar bo'yicha yig'indi)
        stocks = p.get("stock") or {}
        qoldiq = sum(float(v) for v in stocks.values() if v and float(v) > 0)
        total_stock_all += qoldiq

        # Modelni aniqlash
        r_model = rangsiz(raw_name)
        model = config.MODEL_ALIAS.get(r_model, r_model)

        # Narxni aniqlash
        narx = catalog_prices.get(raw_name, 0.0)
        if narx <= 0:
            narx = model_prices.get(raw_name) or model_prices.get(model) or model_prices.get(r_model) or 0.0
        tannarx = purchase_costs.get(raw_name, 0.0)

        processed_products.append({
            "ainur_id": pid,
            "nom": raw_name,
            "model": model,
            "shtrixkod": barcode or code,
            "birlik": unit,
            "tannarx": tannarx,
            "narx_optom": narx,
            "valyuta": "UZS",
            "qoldiq": qoldiq,
            "faol": True,
        })

    print(f"  -> Qayta ishlangan mahsulotlar: {len(processed_products)} ta")
    print(f"  -> Jami ombor qoldig'i: {total_stock_all:,.0f} dona")

    # =========================================================================
    # 1. SQL DUMP FAYLI YARATISH (SUPABASE UCHUN)
    # =========================================================================
    sql_file = os.path.join("supabase", "ainur_migration.sql")
    print(f"\n[SQL] Supabase SQL skripti yozilmoqda: {sql_file}")

    def sql_escape(v):
        if v is None:
            return "NULL"
        if isinstance(v, (int, float)):
            return str(v)
        if isinstance(v, bool):
            return "true" if v else "false"
        s = str(v).replace("'", "''")
        return f"'{s}'"

    with open(sql_file, "w", encoding="utf-8") as f:
        f.write("-- ======================================================================\n")
        f.write("-- AINURPOS MA'LUMOTLARINI SUPABASEGA MIGRATSIYA QILISH SKRIPTI\n")
        f.write(f"-- Yaratilgan vaqt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("-- ======================================================================\n\n")

        f.write("-- 1. Mijozlar jadvalini to'ldirish\n")
        f.write("INSERT INTO mijozlar (nom, nom_norm, telefon, qarz_uzs, qarz_usd, faol)\nVALUES\n")
        cust_values = []
        for c in processed_customers:
            cust_values.append(
                f"  ({sql_escape(c['nom'])}, {sql_escape(c['nom_norm'])}, "
                f"{sql_escape(c['telefon'])}, {c['qarz_uzs']}, 0, true)"
            )
        f.write(",\n".join(cust_values))
        f.write("\nON CONFLICT DO NOTHING;\n\n")

        f.write("-- 2. Tovarlar jadvalini to'ldirish\n")
        f.write(
            "INSERT INTO tovarlar (nom, model, shtrixkod, birlik, tannarx, narx_optom, valyuta, qoldiq, faol)\nVALUES\n"
        )
        prod_values = []
        for p in processed_products:
            prod_values.append(
                f"  ({sql_escape(p['nom'])}, {sql_escape(p['model'])}, {sql_escape(p['shtrixkod'])}, "
                f"{sql_escape(p['birlik'])}, {p['tannarx']}, {p['narx_optom']}, 'UZS', {p['qoldiq']}, true)"
            )
        f.write(",\n".join(prod_values))
        f.write("\nON CONFLICT DO NOTHING;\n\n")

        # 3. Savdolar va Savdo Qatorlari (Tarix)
        f.write("-- 3. Savdolar jadvalini to'ldirish (AinurPOS sotuvlar tarixi)\n")
        f.write("INSERT INTO savdolar (raqam, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, holat, izoh, xodim)\nVALUES\n")
        sales_sql = []
        kassa_sql = []

        for s in all_sales:
            s_num = int(re.sub(r"\D", "", str(s.get("order_number") or "0")) or 0)
            v_dt = s.get("processed_at") or s.get("created_at") or datetime.now().isoformat()
            tot = float(s.get("total_price") or 0)
            pt = s.get("payment_terms") or {}
            paid = float((s.get("metrics") or {}).get("paid_sum") or 0)
            if pt.get("paid") and paid == 0:
                paid = tot
            qarz = max(tot - paid, 0)
            t_turi = "qarz" if qarz > 0 and paid == 0 else ("aralash" if qarz > 0 and paid > 0 else "naqd")
            c_name = tozalash_matn((s.get("customer") or {}).get("name") or "Mijoz")
            x_name = tozalash_matn((s.get("actor") or {}).get("name") or "Xodim")
            izoh = tozalash_matn(s.get("note") or f"Ainur #{s.get('order_number')} - {c_name}")
            sales_sql.append(
                f"  ({s_num}, {sql_escape(v_dt)}, 'UZS', {tot}, {paid}, {qarz}, '{t_turi}', 'yakunlandi', {sql_escape(izoh)}, {sql_escape(x_name)})"
            )

            # Agar pul to'langan bo'lsa -> Kassa Harakatlariga Kirim
            if paid > 0:
                k_izoh = f"Savdo #{s_num} tushumi ({c_name})"
                kassa_sql.append(
                    f"  ({sql_escape(v_dt)}, 'naqd_uzs', 'kirim', {paid}, 'UZS', 'savdo', {sql_escape(k_izoh)})"
                )

        f.write(",\n".join(sales_sql))
        f.write("\nON CONFLICT DO NOTHING;\n\n")

        # 4. Kassa Harakatlari (Kassa Kirim va Chiqimlari)
        f.write("-- 4. Kassa Harakatlari (Savdo tushumlari va kassa kirimi)\n")
        f.write("INSERT INTO kassa_harakatlari (sana_vaqt, kassa_turi, amal, summa, valyuta, manba_turi, izoh)\nVALUES\n")
        f.write(",\n".join(kassa_sql))
        f.write(";\n\n")

        f.write("-- ======================================================================\n")
        f.write("-- MIGRATSIYA YAKUNLANDI\n")
        f.write("-- ======================================================================\n")

    print(f"  -> SQL skript tayyor ({os.path.getsize(sql_file):,} bayt).")

    # =========================================================================
    # 2. LOCAL SQLITE BAZASINI YANGILASH (promax_hisobot.db)
    # =========================================================================
    print("\n[DB] Lokal SQLite bazasiga (promax_hisobot.db) yozilmoqda...")
    conn = db.ulanish()
    cur = conn.cursor()

    # ainur_mijoz
    cur.execute("DELETE FROM ainur_mijoz")
    cur.executemany(
        "INSERT INTO ainur_mijoz (id, nom, nom_norm, telefon) VALUES (?, ?, ?, ?)",
        [(c["ainur_id"], c["nom"], c["nom_norm"], c["telefon"]) for c in processed_customers],
    )

    # mijoz_qarz
    today_str = date.today().isoformat()
    cur.execute("DELETE FROM mijoz_qarz WHERE sana=?", (today_str,))
    cur.executemany(
        "INSERT INTO mijoz_qarz (sana, mijoz_id, nom, qarz) VALUES (?, ?, ?, ?)",
        [(today_str, c["ainur_id"], c["nom"], c["qarz_uzs"]) for c in processed_customers if c["qarz_uzs"] > 0],
    )

    # hujjat_holat
    cur.execute("DELETE FROM hujjat_holat")
    hujjat_rows = []
    for s in all_sales:
        sid = s.get("id")
        num = str(s.get("order_number") or s.get("name") or "")
        v_dt = s.get("processed_at") or s.get("created_at") or ""
        s_date = v_dt[:10]
        c_obj = s.get("customer") or {}
        cid = c_obj.get("id") or ""
        cname = tozalash_matn(c_obj.get("name") or "Nomsiz")
        tot = float(s.get("total_price") or 0)
        paid = float((s.get("metrics") or {}).get("paid_sum") or 0)
        pt = s.get("payment_terms") or {}
        if pt.get("paid") and paid == 0:
            paid = tot
        dona = sum(abs(_son(it.get("quantity"))) for it in s.get("line_items") or [])
        hujjat_rows.append((sid, num, s_date, cname, tot, paid, "{}", cid, dona))

    cur.executemany(
        "INSERT OR REPLACE INTO hujjat_holat (id, raqam, sana, mijoz, jami, tolangan, turlar, mijoz_id, dona) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        hujjat_rows,
    )

    # harakatlar (kirim, sotuv, tuzatish, qaytarish)
    cur.execute("DELETE FROM harakat")
    harakat_rows = []
    # 1) Savdolar
    for s in all_sales:
        sid = s.get("id")
        v_dt = s.get("processed_at") or s.get("created_at") or ""
        s_date = v_dt[:10]
        s_time = v_dt[11:16] if len(v_dt) > 16 else ""
        c_obj = s.get("customer") or {}
        cname = tozalash_matn(c_obj.get("name") or "Nomsiz")
        tot = float(s.get("total_price") or 0)
        paid = float((s.get("metrics") or {}).get("paid_sum") or 0)
        dona = sum(abs(_son(it.get("quantity"))) for it in s.get("line_items") or [])
        del_flag = int(bool((s.get("document_flags") or {}).get("deleted")))
        harakat_rows.append((
            sid, "sotuv", str(s.get("order_number") or ""), s_date, s_time,
            cname, tozalash_matn((s.get("actor") or {}).get("name") or "Xodim"),
            dona, tot, paid, 0, del_flag, "migratsiya"
        ))

    # 2) Kirimlar
    for p in raw_purchases:
        pid = p.get("id")
        v_dt = p.get("processed_at") or p.get("created_at") or ""
        s_date = v_dt[:10]
        s_time = v_dt[11:16] if len(v_dt) > 16 else ""
        src = tozalash_matn((p.get("source") or {}).get("name") or "Yetkazib beruvchi")
        tot = float(p.get("total_price") or 0)
        dona = sum(abs(_son(it.get("quantity"))) for it in p.get("line_items") or [])
        del_flag = int(bool((p.get("document_flags") or {}).get("deleted")))
        harakat_rows.append((
            pid, "kirim", str(p.get("order_number") or ""), s_date, s_time,
            src, tozalash_matn((p.get("actor") or {}).get("name") or "Admin"),
            dona, tot, 0.0, 0, del_flag, "migratsiya"
        ))

    # 3) Tuzatishlar
    for chg in all_changes:
        cid = chg.get("id")
        v_dt = chg.get("processed_at") or chg.get("created_at") or ""
        s_date = v_dt[:10]
        s_time = v_dt[11:16] if len(v_dt) > 16 else ""
        tot = float(chg.get("total_price") or 0)
        dona = sum(_son(it.get("quantity")) for it in chg.get("line_items") or [])
        del_flag = int(bool((chg.get("document_flags") or {}).get("deleted")))
        harakat_rows.append((
            cid, "tuzatish", str(chg.get("order_number") or ""), s_date, s_time,
            "Ombor tuzatish", tozalash_matn((chg.get("actor") or {}).get("name") or "Admin"),
            dona, tot, 0.0, 0, del_flag, "migratsiya"
        ))

    cur.executemany(
        "INSERT OR REPLACE INTO harakat (id, tur, raqam, sana, vaqt, kontragent, xodim, dona, summa, tolangan, ichki, ochirilgan, yuborildi) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        harakat_rows,
    )

    conn.commit()
    print("  -> SQLite lokal bazasi to'liq yangilandi:")
    print(f"     - ainur_mijoz: {cur.execute('SELECT COUNT(*) FROM ainur_mijoz').fetchone()[0]} ta")
    print(f"     - mijoz_qarz: {cur.execute('SELECT COUNT(*) FROM mijoz_qarz').fetchone()[0]} ta")
    print(f"     - hujjat_holat: {cur.execute('SELECT COUNT(*) FROM hujjat_holat').fetchone()[0]} ta")
    print(f"     - harakat: {cur.execute('SELECT COUNT(*) FROM harakat').fetchone()[0]} ta")

    print("\n" + "=" * 65)
    print("SUCCESS: MIGRATSIYA MUVAFFAQIYATLI YAKUNLANDI!")
    print("=" * 65)


if __name__ == "__main__":
    main()
