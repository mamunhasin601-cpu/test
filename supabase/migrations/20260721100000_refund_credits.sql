-- Функция возврата кредитов — симметрична spend_credits, но добавляет баланс
-- назад. Нужна для случаев, когда часть запрошенных вариантов генерации не
-- удалась (например, в режиме сравнения моделей): кредиты списываются заранее
-- за все варианты, а за те, что реально не сгенерировались, возвращаются
-- этим вызовом.
CREATE OR REPLACE FUNCTION public.refund_credits(_amount INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance INT;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.credits
     SET balance = balance + _amount, updated_at = now()
   WHERE user_id = auth.uid()
   RETURNING balance INTO new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'credits_row_not_found'; END IF;
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.refund_credits(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(INT) TO authenticated;
