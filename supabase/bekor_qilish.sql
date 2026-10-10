-- Mijoz qarz to'lovini bekor qilish funksiyasi
CREATE OR REPLACE FUNCTION fn_qarz_tolov_bekor_qilish(
    p_harakat_id UUID,
    p_xodim TEXT
) RETURNS VOID AS $$
DECLARE
    v_harakat RECORD;
BEGIN
    SELECT * INTO v_harakat FROM pul_harakati WHERE id = p_harakat_id AND holat = 'faol';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Faol to''lov topilmadi yoki allaqachon bekor qilingan.';
    END IF;

    -- 1. Hisobdan pulni ayirish
    IF v_harakat.hisob_id IS NOT NULL THEN
        UPDATE hisoblar
        SET joriy_balans = joriy_balans - v_harakat.summa
        WHERE id = v_harakat.hisob_id;
    END IF;

    -- 2. Mijoz qarzini qaytarish
    IF v_harakat.mijoz_id IS NOT NULL THEN
        IF v_harakat.valyuta = 'UZS' THEN
            UPDATE mijozlar SET qarz_uzs = qarz_uzs + v_harakat.summa WHERE id = v_harakat.mijoz_id;
        ELSIF v_harakat.valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd + v_harakat.summa WHERE id = v_harakat.mijoz_id;
        END IF;
    END IF;

    -- 3. Pul harakatini holatini o'zgartirish
    UPDATE pul_harakati 
    SET holat = 'bekor_qilindi', 
        izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || p_xodim || ')'
    WHERE id = p_harakat_id;
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

    -- 2. Mijoz qarzini qaytarish
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
