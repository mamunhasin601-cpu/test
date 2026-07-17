
CREATE OR REPLACE FUNCTION public.spend_credits(_amount INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance INT;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.credits
     SET balance = balance - _amount, updated_at = now()
   WHERE user_id = auth.uid() AND balance >= _amount
   RETURNING balance INTO new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.spend_credits(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_credits(INT) TO authenticated;
