// Public-by-design: the anon key only grants access gated by Postgres RLS
// policies (see yt-storer-web/supabase/migrations/0001_init.sql), so it is
// safe to ship inside the extension.
export const SUPABASE_URL = "https://dzibcfdmkryloosdizow.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWJjZmRta3J5bG9vc2Rpem93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTUwOTAsImV4cCI6MjEwMjI5MTA5MH0.YKBtHFakZUrHkwHJpxizh7CdfOaRByCvJJ0r8vWbHwM";
