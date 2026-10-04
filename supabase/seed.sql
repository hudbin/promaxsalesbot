-- ==============================================================================
-- PROMAX B2B STORE: SUPABASE BOSHLANG'ICH MA'LUMOTLAR (SEED DATA)
-- ==============================================================================

-- 1. Boshlang'ich Kassa Qoldiqlari (Boshlang'ich kassa kapitali)
INSERT INTO kassa_harakatlari (kassa_turi, amal, summa, valyuta, manba_turi, izoh)
VALUES 
    ('naqd_uzs', 'kirim', 5000000, 'UZS', 'boshlangich', 'Boshlang''ich naqd so''m qoldig''i'),
    ('naqd_usd', 'kirim', 1000, 'USD', 'boshlangich', 'Boshlang''ich naqd dollar qoldig''i'),
    ('plastik_uzs', 'kirim', 2000000, 'UZS', 'boshlangich', 'Boshlang''ich plastik karta qoldig''i'),
    ('bank_uzs', 'kirim', 500000, 'UZS', 'boshlangich', 'Boshlang''ich bank hisobi');

-- 2. Namunaviy Mahsulotlar (B2B Kiyim/Mato/Profil)
INSERT INTO tovarlar (nom, model, shtrixkod, rasm_url, birlik, tannarx, narx_optom, narx_chakana, valyuta, qoldiq, ogohlantirish_qoldiq)
VALUES
    ('Velikan Uzun', '5017', '4780012345678', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', 'dona', 70000, 95000, 110000, 'UZS', 250, 20),
    ('Pagon Uzun', '3024', '4780012345679', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400', 'dona', 55000, 75000, 85000, 'UZS', 180, 15),
    ('Palasa Uzun', '2042', '4780012345680', 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400', 'dona', 40000, 55000, 65000, 'UZS', 300, 25),
    ('Turk Kofta Premium', 'TK-01', '4780012345681', 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400', 'dona', 8.5, 12.0, 15.0, 'USD', 95, 10);

-- 3. Namunaviy Doimiy B2B Mijozlar
INSERT INTO mijozlar (nom, nom_norm, telefon, manzil, qarz_uzs, qarz_usd, izoh)
VALUES
    ('Akrom aka (Qo''qon)', 'akrom aka qoqon', '+998901234567', 'Qo''qon bozor, 12-rasta', 1500000, 200, 'Doimiy ulgurji xaridor'),
    ('Sherzodbek (Samarqand)', 'sherzodbek samarqand', '+998912345678', 'Samarqand shahar, Registon savdo majmuasi', 0, 450, 'Katta hajmda oladi'),
    ('Murodjon aka (Chorsu)', 'murodjon aka chorsu', '+998933456789', 'Toshkent, Chorsu bozor 5-blok', 3200000, 0, 'Haftada bir hisob-kitob qiladi');
