
CREATE POLICY "Users read own uploads" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own uploads" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own generations" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'generations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users write own generations" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'generations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own generations" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'generations' AND auth.uid()::text = (storage.foldername(name))[1]);
