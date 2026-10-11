-- ==============================================================================
-- SUB-HISOBLAR VA GURUHLASH MIGRATSIYASI
-- ==============================================================================

-- 1. hisoblar jadvaliga guruhi ustunini qo'shish
ALTER TABLE hisoblar ADD COLUMN IF NOT EXISTS guruhi TEXT;

-- 2. Mavjud Asosiy Do'kon hisoblarini 'Asosiy Do''kon' guruhiga biriktirish
UPDATE hisoblar 
SET guruhi = 'Asosiy Do''kon' 
WHERE (nom ILIKE '%Asosiy Do''kon%' OR nom ILIKE '%Asosiy Kassa%') AND (guruhi IS NULL OR guruhi = '');

-- 3. Qolgan hisoblar uchun, agar qavs ichida turi bo'lsa, guruh nomini ajratib olish
UPDATE hisoblar
SET guruhi = trim(regexp_replace(nom, '\s*\((Naqd|Plastik|Bank|UZS|USD)[^\)]*\)', '', 'gi'))
WHERE guruhi IS NULL OR guruhi = '';
