-- ==============================================================================
-- 06. KASSA HISOB BALANSINI SOZLASH (KORREKTIROVKA) MIGRATSIYASI
-- ==============================================================================

-- 1. kassa_harakatlari manba_turi CHECK constraintiga 'korrektirovka' qo'shish
ALTER TABLE kassa_harakatlari DROP CONSTRAINT IF EXISTS kassa_harakatlari_manba_turi_check;
ALTER TABLE kassa_harakatlari ADD CONSTRAINT kassa_harakatlari_manba_turi_check 
    CHECK (manba_turi IN ('savdo', 'rasxod', 'qarz_tolov', 'kassalar_aro', 'boshlangich', 'transfer', 'korrektirovka'));

-- 2. fn_kassa_balans_sozlash STORED PROCEDURE
-- Hisobdagi haqiqiy mablag'ni yangi qiymatga sozlash uchun avtomatik delta (farq) hisoblab
-- audit-trail kirim yoki chiqim yozadi.
CREATE OR REPLACE FUNCTION fn_kassa_balans_sozlash(
    p_hisob_id UUID,
    p_yangi_balans NUMERIC,
    p_izoh TEXT DEFAULT NULL,
    p_xodim TEXT DEFAULT NULL,
    p_telegram_user_id BIGINT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_hisob RECORD;
    v_joriy_balans NUMERIC := 0;
    v_farq NUMERIC := 0;
    v_amal TEXT;
    v_harakat_id UUID;
    v_final_izoh TEXT;
BEGIN
    -- 1. Hisob mavjudligini tekshirish
    SELECT id, nom, turi, valyuta INTO v_hisob
    FROM hisoblar
    WHERE id = p_hisob_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hisob topilmadi (ID: %)', p_hisob_id;
    END IF;

    -- 2. Joriy balansni kassa_harakatlaridan aniq hisoblash
    SELECT COALESCE(SUM(CASE WHEN amal = 'kirim' THEN summa ELSE -summa END), 0)
    INTO v_joriy_balans
    FROM kassa_harakatlari
    WHERE hisob_id = p_hisob_id;

    -- 3. Farqni hisoblash
    v_farq := p_yangi_balans - v_joriy_balans;
    v_final_izoh := COALESCE(NULLIF(TRIM(p_izoh), ''), 'Balans to''g''rilandi (korrektirovka)');

    -- 4. Agar farq 0 bo'lsa (balans allaqachon teng bo'lsa)
    IF v_farq = 0 THEN
        RETURN jsonb_build_object(
            'ok', true,
            'hisob_id', v_hisob.id,
            'hisob_nomi', v_hisob.nom,
            'valyuta', v_hisob.valyuta,
            'eski_balans', v_joriy_balans,
            'yangi_balans', p_yangi_balans,
            'farq', 0,
            'amal', 'ozgarishsiz',
            'izoh', v_final_izoh
        );
    END IF;

    -- 5. Farqqa qarab kirim yoki chiqim yozish
    IF v_farq > 0 THEN
        v_amal := 'kirim';
    ELSE
        v_amal := 'chiqim';
    END IF;

    INSERT INTO kassa_harakatlari (
        id,
        amal,
        summa,
        valyuta,
        manba_turi,
        manba_id,
        izoh,
        hisob_id,
        sana_vaqt
    ) VALUES (
        gen_random_uuid(),
        v_amal,
        ABS(v_farq),
        v_hisob.valyuta,
        'korrektirovka',
        p_hisob_id,
        v_final_izoh || ' (' || v_joriy_balans::TEXT || ' ➔ ' || p_yangi_balans::TEXT || ')',
        p_hisob_id,
        now()
    ) RETURNING id INTO v_harakat_id;

    RETURN jsonb_build_object(
        'ok', true,
        'harakat_id', v_harakat_id,
        'hisob_id', v_hisob.id,
        'hisob_nomi', v_hisob.nom,
        'valyuta', v_hisob.valyuta,
        'eski_balans', v_joriy_balans,
        'yangi_balans', p_yangi_balans,
        'farq', v_farq,
        'amal', v_amal,
        'izoh', v_final_izoh
    );
END;
$$ LANGUAGE plpgsql;
