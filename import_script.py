import pandas as pd

df = pd.read_excel('8-Oktyabr.xlsx')

sql = []
sql.append("-- ==========================================================")
sql.append("-- DIQQAT: Barcha eski mijozlar o'chiriladi!")
sql.append("-- Bu holatda 'qarz_tolovlari' jadvalidagi eski to'lovlar ham o'chib ketadi (CASCADE).")
sql.append("-- 'savdolar' jadvalidagi eski hujjatlarning mijoz_id lari NULL bo'lib qoladi.")
sql.append("-- ==========================================================\n")

sql.append("-- 1. Mijozlar jadvaliga 'telegram' ustunini qo'shish (agar yo'q bo'lsa)")
sql.append("ALTER TABLE mijozlar ADD COLUMN IF NOT EXISTS telegram TEXT;\n")

sql.append("-- 2. Eski ma'lumotlarni tozalash")
sql.append("DELETE FROM mijozlar;\n")

for i, row in df.iterrows():
    nom = str(row['Mijozning ismi ']).strip()
    if not nom or nom.lower() == 'nan':
        continue
        
    nom_sql = nom.replace("'", "''")
    nom_norm = nom.lower().replace("'", "").replace("ʻ", "").replace("ʼ", "").replace("`", "")
    
    qarz_uzs = float(row['Qrazdorligi somda']) if pd.notna(row['Qrazdorligi somda']) else 0.0
    qarz_usd = float(row['Qarzdorlik dollarda']) if pd.notna(row['Qarzdorlik dollarda']) else 0.0
    
    tel = row['Telefon raqami']
    if pd.notna(tel) and str(tel).strip():
        try:
            tel_str = str(int(float(tel)))
            if not tel_str.startswith('+'):
                tel_str = '+' + tel_str
            tel_sql = f"'{tel_str}'"
        except:
            tel_sql = "NULL"
    else:
        tel_sql = "NULL"
        
    tg = row['Telegram linki']
    if pd.notna(tg) and str(tg).strip() and str(tg).lower() != 'nan':
        tg_sql = f"'{str(tg).strip().replace(chr(39), chr(39)+chr(39))}'"
    else:
        tg_sql = "NULL"
        
    sql.append(f"INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('{nom_sql}', '{nom_norm}', {qarz_uzs}, {qarz_usd}, {tel_sql}, {tg_sql});")

with open('supabase/01_import_mijozlar.sql', 'w', encoding='utf-8') as f:
    f.write("\n".join(sql))

print("SQL skript yangilandi: supabase/01_import_mijozlar.sql")
