-- ==============================================================================
-- 05_vozvrat_akt_sverka_migration.sql
-- AKT-SVERKA VA TARIXIY QARZ FUNKSIYASIGA VOZVRATLARNI (TOVAR QAYTARISHLARNI) QO'SHISH
-- ==============================================================================

DROP FUNCTION IF EXISTS fn_mijoz_qarz_tarixiy_nom(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS fn_mijoz_qarz_tarixiy(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;

CREATE OR REPLACE FUNCTION fn_mijoz_qarz_tarixiy(
    p_mijoz_id UUID,
    p_bosh_sana TIMESTAMPTZ DEFAULT NULL,
    p_tugash_sana TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    mijoz_id UUID,
    mijoz_nomi TEXT,
    telefon TEXT,
    manzil TEXT,
    telegram TEXT,
    bosh_sana TIMESTAMPTZ,
    tugash_sana TIMESTAMPTZ,
    boshlangich_qarz_uzs NUMERIC,
    boshlangich_qarz_usd NUMERIC,
    olingan_qarz_uzs NUMERIC,
    olingan_qarz_usd NUMERIC,
    tolangan_qarz_uzs NUMERIC,
    tolangan_qarz_usd NUMERIC,
    vozvrat_qarz_uzs NUMERIC,
    vozvrat_qarz_usd NUMERIC,
    oxirgi_qarz_uzs NUMERIC,
    oxirgi_qarz_usd NUMERIC,
    savdolar_soni INT,
    tolovlar_soni INT,
    vozvratlar_soni INT,
    amallar JSONB
) AS $$
DECLARE
    v_mijoz RECORD;
    v_bosh TIMESTAMPTZ;
    v_tugash TIMESTAMPTZ;
    
    v_keyingi_savdo_uzs NUMERIC := 0;
    v_keyingi_savdo_usd NUMERIC := 0;
    v_keyingi_tolov_uzs NUMERIC := 0;
    v_keyingi_tolov_usd NUMERIC := 0;
    v_keyingi_vozvrat_uzs NUMERIC := 0;
    v_keyingi_vozvrat_usd NUMERIC := 0;

    v_oraliq_savdo_uzs NUMERIC := 0;
    v_oraliq_savdo_usd NUMERIC := 0;
    v_oraliq_tolov_uzs NUMERIC := 0;
    v_oraliq_tolov_usd NUMERIC := 0;
    v_oraliq_vozvrat_uzs NUMERIC := 0;
    v_oraliq_vozvrat_usd NUMERIC := 0;

    v_oxirgi_qarz_uzs NUMERIC := 0;
    v_oxirgi_qarz_usd NUMERIC := 0;
    v_boshlangich_qarz_uzs NUMERIC := 0;
    v_boshlangich_qarz_usd NUMERIC := 0;

    v_savdolar_count INT := 0;
    v_tolovlar_count INT := 0;
    v_vozvratlar_count INT := 0;
    v_amallar_list JSONB := '[]'::jsonb;
BEGIN
    -- 1. Mijozni tekshirish
    SELECT * INTO v_mijoz FROM mijozlar m WHERE m.id = p_mijoz_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Sanalarni tekshirish va to'g'rilash
    v_bosh := p_bosh_sana;
    v_tugash := COALESCE(p_tugash_sana, now());

    -- Agar tugash_sana vaqt qismi berilmagan bo'lsa va kunning boshi bo'lsa, o'sha kunning oxirigacha (23:59:59.999) olish
    IF v_tugash = date_trunc('day', v_tugash) AND p_tugash_sana IS NOT NULL THEN
        v_tugash := v_tugash + interval '1 day' - interval '1 microsecond';
    END IF;

    -- 2. Tugash sanasidan keyingi amallarni hisoblash (Reverse calculation)
    IF v_tugash < now() THEN
        SELECT 
            COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN qarz_summa ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN qarz_summa ELSE 0 END), 0)
        INTO v_keyingi_savdo_uzs, v_keyingi_savdo_usd
        FROM savdolar
        WHERE savdolar.mijoz_id = p_mijoz_id 
          AND sana_vaqt > v_tugash 
          AND holat != 'bekor_qilindi';

        SELECT 
            COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN summa ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN summa ELSE 0 END), 0)
        INTO v_keyingi_tolov_uzs, v_keyingi_tolov_usd
        FROM qarz_tolovlari
        WHERE qarz_tolovlari.mijoz_id = p_mijoz_id 
          AND sana_vaqt > v_tugash;

        -- Vozvrat orqali qarzdan chegirilgan summalar
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tovar_qaytarishlar') THEN
            SELECT 
                COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN qarzdan_ayirildi ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN qarzdan_ayirildi ELSE 0 END), 0)
            INTO v_keyingi_vozvrat_uzs, v_keyingi_vozvrat_usd
            FROM tovar_qaytarishlar
            WHERE tovar_qaytarishlar.mijoz_id = p_mijoz_id 
              AND sana_vaqt > v_tugash
              AND holat != 'bekor_qilindi';
        END IF;

        v_oxirgi_qarz_uzs := GREATEST(COALESCE(v_mijoz.qarz_uzs, 0) - v_keyingi_savdo_uzs + v_keyingi_tolov_uzs + v_keyingi_vozvrat_uzs, 0);
        v_oxirgi_qarz_usd := GREATEST(COALESCE(v_mijoz.qarz_usd, 0) - v_keyingi_savdo_usd + v_keyingi_tolov_usd + v_keyingi_vozvrat_usd, 0);
    ELSE
        v_oxirgi_qarz_uzs := COALESCE(v_mijoz.qarz_uzs, 0);
        v_oxirgi_qarz_usd := COALESCE(v_mijoz.qarz_usd, 0);
    END IF;

    -- 3. Oraliqdagi amallar (v_bosh dan v_tugash gacha)
    SELECT 
        COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN qarz_summa ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN qarz_summa ELSE 0 END), 0),
        COUNT(*)
    INTO v_oraliq_savdo_uzs, v_oraliq_savdo_usd, v_savdolar_count
    FROM savdolar
    WHERE savdolar.mijoz_id = p_mijoz_id 
      AND (v_bosh IS NULL OR sana_vaqt >= v_bosh)
      AND sana_vaqt <= v_tugash
      AND holat != 'bekor_qilindi';

    SELECT 
        COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN summa ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN summa ELSE 0 END), 0),
        COUNT(*)
    INTO v_oraliq_tolov_uzs, v_oraliq_tolov_usd, v_tolovlar_count
    FROM qarz_tolovlari
    WHERE qarz_tolovlari.mijoz_id = p_mijoz_id 
      AND (v_bosh IS NULL OR sana_vaqt >= v_bosh)
      AND sana_vaqt <= v_tugash;

    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tovar_qaytarishlar') THEN
        SELECT 
            COALESCE(SUM(CASE WHEN valyuta = 'UZS' THEN qarzdan_ayirildi ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN valyuta = 'USD' THEN qarzdan_ayirildi ELSE 0 END), 0),
            COUNT(*)
        INTO v_oraliq_vozvrat_uzs, v_oraliq_vozvrat_usd, v_vozvratlar_count
        FROM tovar_qaytarishlar
        WHERE tovar_qaytarishlar.mijoz_id = p_mijoz_id 
          AND (v_bosh IS NULL OR sana_vaqt >= v_bosh)
          AND sana_vaqt <= v_tugash
          AND holat != 'bekor_qilindi';
    END IF;

    -- 4. Boshlang'ich qarzni hisoblash
    v_boshlangich_qarz_uzs := GREATEST(v_oxirgi_qarz_uzs - v_oraliq_savdo_uzs + v_oraliq_tolov_uzs + v_oraliq_vozvrat_uzs, 0);
    v_boshlangich_qarz_usd := GREATEST(v_oxirgi_qarz_usd - v_oraliq_savdo_usd + v_oraliq_tolov_usd + v_oraliq_vozvrat_usd, 0);

    -- 5. Oraliqdagi barcha amallarni tartibli yig'ish (JSON)
    SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'sana_vaqt') ASC), '[]'::jsonb)
    INTO v_amallar_list
    FROM (
        SELECT 
            jsonb_build_object(
                'amal_id', s.id,
                'turi', 'savdo',
                'sana_vaqt', s.sana_vaqt,
                'raqam', s.raqam,
                'valyuta', s.valyuta,
                'jami_summa', s.jami_summa,
                'tolangan_summa', s.tolangan_summa,
                'qarz_summa', s.qarz_summa,
                'tolov_turi', s.tolov_turi,
                'izoh', s.izoh,
                'qatorlar', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'tovar_nomi', sq.tovar_nomi,
                        'soni', sq.soni,
                        'narx', sq.narx,
                        'summa', sq.summa
                    )), '[]'::jsonb)
                    FROM savdo_qatorlari sq
                    WHERE sq.savdo_id = s.id
                )
            ) AS item
        FROM savdolar s
        WHERE s.mijoz_id = p_mijoz_id 
          AND (v_bosh IS NULL OR s.sana_vaqt >= v_bosh)
          AND s.sana_vaqt <= v_tugash
          AND s.holat != 'bekor_qilindi'
        
        UNION ALL

        SELECT 
            jsonb_build_object(
                'amal_id', t.id,
                'turi', 'qarz_tolov',
                'sana_vaqt', t.sana_vaqt,
                'valyuta', t.valyuta,
                'summa', t.summa,
                'tolov_turi', t.tolov_turi,
                'izoh', t.izoh
            ) AS item
        FROM qarz_tolovlari t
        WHERE t.mijoz_id = p_mijoz_id 
          AND (v_bosh IS NULL OR t.sana_vaqt >= v_bosh)
          AND t.sana_vaqt <= v_tugash

        UNION ALL

        SELECT 
            jsonb_build_object(
                'amal_id', v.id,
                'turi', 'vozvrat',
                'sana_vaqt', v.sana_vaqt,
                'raqam', v.raqam,
                'valyuta', v.valyuta,
                'jami_summa', v.jami_summa,
                'qarzdan_ayirildi', v.qarzdan_ayirildi,
                'naqd_qaytarildi', v.naqd_qaytarildi,
                'izoh', v.izoh,
                'qatorlar', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'tovar_nomi', vq.tovar_nomi,
                        'soni', vq.soni,
                        'narx', vq.narx,
                        'summa', vq.summa
                    )), '[]'::jsonb)
                    FROM tovar_qaytarish_qatorlari vq
                    WHERE vq.qaytarish_id = v.id
                )
            ) AS item
        FROM tovar_qaytarishlar v
        WHERE v.mijoz_id = p_mijoz_id 
          AND (v_bosh IS NULL OR v.sana_vaqt >= v_bosh)
          AND v.sana_vaqt <= v_tugash
          AND v.holat != 'bekor_qilindi'
    ) sub;

    -- 6. Natijani qaytarish
    RETURN QUERY SELECT 
        v_mijoz.id,
        v_mijoz.nom,
        v_mijoz.telefon,
        v_mijoz.manzil,
        v_mijoz.telegram,
        v_bosh,
        v_tugash,
        v_boshlangich_qarz_uzs,
        v_boshlangich_qarz_usd,
        v_oraliq_savdo_uzs,
        v_oraliq_savdo_usd,
        v_oraliq_tolov_uzs,
        v_oraliq_tolov_usd,
        v_oraliq_vozvrat_uzs,
        v_oraliq_vozvrat_usd,
        v_oxirgi_qarz_uzs,
        v_oxirgi_qarz_usd,
        v_savdolar_count,
        v_tolovlar_count,
        v_vozvratlar_count,
        v_amallar_list;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Ism bo'yicha qidiruv yordamchisi
CREATE OR REPLACE FUNCTION fn_mijoz_qarz_tarixiy_nom(
    p_mijoz_nomi TEXT,
    p_bosh_sana TIMESTAMPTZ DEFAULT NULL,
    p_tugash_sana TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    mijoz_id UUID,
    mijoz_nomi TEXT,
    telefon TEXT,
    manzil TEXT,
    telegram TEXT,
    bosh_sana TIMESTAMPTZ,
    tugash_sana TIMESTAMPTZ,
    boshlangich_qarz_uzs NUMERIC,
    boshlangich_qarz_usd NUMERIC,
    olingan_qarz_uzs NUMERIC,
    olingan_qarz_usd NUMERIC,
    tolangan_qarz_uzs NUMERIC,
    tolangan_qarz_usd NUMERIC,
    vozvrat_qarz_uzs NUMERIC,
    vozvrat_qarz_usd NUMERIC,
    oxirgi_qarz_uzs NUMERIC,
    oxirgi_qarz_usd NUMERIC,
    savdolar_soni INT,
    tolovlar_soni INT,
    vozvratlar_soni INT,
    amallar JSONB
) AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id 
    FROM fn_ai_mijoz_qidirish(p_mijoz_nomi) 
    LIMIT 1;

    IF v_id IS NULL THEN
        SELECT id INTO v_id 
        FROM mijozlar 
        WHERE nom ILIKE '%' || p_mijoz_nomi || '%' OR nom_norm ILIKE '%' || lower(p_mijoz_nomi) || '%'
        LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT * FROM fn_mijoz_qarz_tarixiy(v_id, p_bosh_sana, p_tugash_sana);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
