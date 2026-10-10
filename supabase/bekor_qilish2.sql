-- Qarz to'lovini bekor qilish (qarz_tolovlari jadvalidan)
CREATE OR REPLACE FUNCTION fn_qarz_tolov_bekor_qilish(
    p_tolov_id UUID,
    p_xodim TEXT
) RETURNS VOID AS $$
DECLARE
    v_tolov RECORD;
    v_harakat RECORD;
BEGIN
    SELECT * INTO v_tolov FROM qarz_tolovlari WHERE id = p_tolov_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'To''lov topilmadi.';
    END IF;

    -- 1. Pul harakatlarini (kirim) bekor qilish
    FOR v_harakat IN SELECT * FROM pul_harakati WHERE manba_turi = 'qarz_tolov' AND manba_id::text = p_tolov_id::text AND holat = 'faol'
    LOOP
        -- Kassadan pulni ayirish
        IF v_harakat.hisob_id IS NOT NULL THEN
            UPDATE hisoblar SET joriy_balans = joriy_balans - v_harakat.summa WHERE id = v_harakat.hisob_id;
        END IF;
        
        UPDATE pul_harakati 
        SET holat = 'bekor_qilindi',
            izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || p_xodim || ')'
        WHERE id = v_harakat.id;
    END LOOP;

    -- 2. Mijoz qarzini qaytarish
    IF v_tolov.mijoz_id IS NOT NULL THEN
        IF v_tolov.valyuta = 'UZS' THEN
            UPDATE mijozlar SET qarz_uzs = qarz_uzs + v_tolov.summa WHERE id = v_tolov.mijoz_id;
        ELSIF v_tolov.valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd + v_tolov.summa WHERE id = v_tolov.mijoz_id;
        END IF;
    END IF;

    -- 3. Qarz to'lovlari yozuvini o'chirish
    DELETE FROM qarz_tolovlari WHERE id = p_tolov_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Savdoni bekor qilish funksiyasi
CREATE OR REPLACE FUNCTION fn_savdoni_bekor_qilish(
    p_savdo_id UUID,
    p_xodim TEXT
) RETURNS VOID AS $$
DECLARE
    v_savdo RECORD;
    v_qator RECORD;
BEGIN
    SELECT * INTO v_savdo FROM savdolar WHERE id = p_savdo_id AND holat = 'yakunlandi';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Savdo topilmadi yoki allaqachon bekor qilingan.';
    END IF;

    -- 1. Tovarlar qoldig'ini qaytarish
    FOR v_qator IN SELECT * FROM savdo_qatorlari WHERE savdo_id = p_savdo_id
    LOOP
        UPDATE tovarlar SET qoldiq = qoldiq + v_qator.soni WHERE id = v_qator.tovar_id;
    END LOOP;

    -- 2. Mijoz qarzini qaytarish (qarzga olingan summani ayirish)
    IF v_savdo.mijoz_id IS NOT NULL AND v_savdo.qarz_summa > 0 THEN
        IF v_savdo.valyuta = 'UZS' THEN
            UPDATE mijozlar SET qarz_uzs = qarz_uzs - v_savdo.qarz_summa WHERE id = v_savdo.mijoz_id;
        ELSIF v_savdo.valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd - v_savdo.qarz_summa WHERE id = v_savdo.mijoz_id;
        END IF;
    END IF;

    -- 3. Pul harakatini bekor qilish
    FOR v_qator IN SELECT * FROM pul_harakati WHERE manba_turi = 'savdo' AND manba_id::text = p_savdo_id::text AND holat = 'faol'
    LOOP
        IF v_qator.hisob_id IS NOT NULL THEN
            UPDATE hisoblar SET joriy_balans = joriy_balans - v_qator.summa WHERE id = v_qator.hisob_id;
        END IF;
        
        UPDATE pul_harakati 
        SET holat = 'bekor_qilindi',
            izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || p_xodim || ')'
        WHERE id = v_qator.id;
    END LOOP;

    -- 4. Savdoni holatini o'zgartirish
    UPDATE savdolar 
    SET holat = 'bekor_qilindi', 
        izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || p_xodim || ')'
    WHERE id = p_savdo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
