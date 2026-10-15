-- ==============================================================================
-- 04_tovarlar_konsolidatsiya_va_tozalash.sql
-- MAQSAD: Bazadagi mavjud rangli tovarlarni model (artikul) bo'yicha bitta tovarga
-- birlashtirish, qoldiqlarni jamlash va ortiqcha dublikat ranglarni tozalash.
-- Ushbu skriptni Supabase SQL Editor'da to'g'ridan-to'g'ri bir marta ishga tushirasiz.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_asosiy_id UUID;
    v_birlashgan_modellar INT := 0;
    v_tozalangan_ranglar INT := 0;
    v_duplicate_ids UUID[];
BEGIN
    RAISE NOTICE '>>> Tovarlarni modellar bo''yicha optimallashtirish boshlandi...';

    -- 1. Avval model maydonidagi noaniqliklarni to'g'rilab olamiz
    UPDATE tovarlar SET model = 'JAKART KALTA' WHERE trim(upper(model)) IN ('JAKART KALTA T HAVO', 'JAKART KALTA O HAVO');
    UPDATE tovarlar SET model = 'JAKART UZUN' WHERE trim(upper(model)) = 'JAKARTR UZUN T XAVO';
    UPDATE tovarlar SET model = 'VAFLI KALTA' WHERE trim(upper(model)) IN ('VAFLI KALTA PERSIK', 'VAFLI KALTA MOVIY');
    UPDATE tovarlar SET model = 'VAFLI KALTA ( V )' WHERE trim(upper(model)) = 'VAFLI KALTA ( V ) PERSIK';
    UPDATE tovarlar SET model = '9001 PAXMOQ' WHERE trim(upper(model)) = '9001 PAXSHOQ';

    -- 2. Bir nechta rangli variantlarga ega modellarni birlashtiramiz
    FOR r IN 
        SELECT 
            trim(model) AS m_nom,
            COUNT(*) AS cnt,
            SUM(COALESCE(qoldiq, 0)) AS total_qoldiq,
            MAX(COALESCE(narx_optom, 0)) AS optom_max,
            MAX(COALESCE(tannarx, 0)) AS tan_max
        FROM tovarlar
        WHERE faol = true AND model IS NOT NULL AND trim(model) != ''
        GROUP BY trim(model)
        HAVING COUNT(*) > 1
    LOOP
        -- Ushbu model bo'yicha bitta asosiy tovarni tanlaymiz (eng ko'p qoldiqqa ega tovar)
        SELECT id INTO v_asosiy_id
        FROM tovarlar
        WHERE faol = true AND trim(model) = r.m_nom
        ORDER BY qoldiq DESC, yaratilgan ASC
        LIMIT 1;

        -- Qolgan dublikat rang qatorlarining ID larini to'playmiz
        SELECT array_agg(id) INTO v_duplicate_ids
        FROM tovarlar
        WHERE faol = true AND trim(model) = r.m_nom AND id != v_asosiy_id;

        IF v_duplicate_ids IS NOT NULL AND array_length(v_duplicate_ids, 1) > 0 THEN
            -- A) Tarixiy savdo qatorlaridagi tovar_id ni asosiy tovarga o'tkazamiz (kvitansiyalar buzilmaydi)
            UPDATE savdo_qatorlari
            SET tovar_id = v_asosiy_id
            WHERE tovar_id = ANY(v_duplicate_ids);

            -- B) Agar tovar_qaytarish_qatorlari jadvali bo'lsa, uni ham yangilaymiz
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tovar_qaytarish_qatorlari') THEN
                EXECUTE 'UPDATE tovar_qaytarish_qatorlari SET tovar_id = $1 WHERE tovar_id = ANY($2)'
                USING v_asosiy_id, v_duplicate_ids;
            END IF;

            -- C) Asosiy tovar nomini toza model nomiga o'tkazib, umumiy qoldiqni beramiz
            UPDATE tovarlar
            SET 
                nom = r.m_nom,
                model = r.m_nom,
                qoldiq = r.total_qoldiq,
                narx_optom = CASE WHEN r.optom_max > 0 THEN r.optom_max ELSE narx_optom END,
                tannarx = CASE WHEN r.tan_max > 0 THEN r.tan_max ELSE tannarx END,
                faol = true
            WHERE id = v_asosiy_id;

            -- D) Boshqa rangli dublikat qatorlarni arxivlaymiz (faol = false, qoldiq = 0)
            UPDATE tovarlar
            SET 
                faol = false,
                qoldiq = 0,
                izoh = COALESCE(izoh, '') || ' [Modelga birlashtirildi: ' || r.m_nom || ']'
            WHERE id = ANY(v_duplicate_ids);

            v_birlashgan_modellar := v_birlashgan_modellar + 1;
            v_tozalangan_ranglar := v_tozalangan_ranglar + array_length(v_duplicate_ids, 1);
        END IF;
    END LOOP;

    RAISE NOTICE '>>> Muvaffaqiyatli yakunlandi: % ta model bo''yicha % ta rang bitta tovar qilib birlashtirildi!',
        v_birlashgan_modellar, v_tozalangan_ranglar;
END $$;

-- 3. Birlashgan tovarlar ro'yxatini tekshirish
SELECT 
    model AS mahsulot_modeli, 
    nom AS mahsulot_nomi, 
    qoldiq AS jami_qoldiq_dona, 
    narx_optom, 
    valyuta, 
    birlik
FROM tovarlar
WHERE faol = true
ORDER BY qoldiq DESC;
