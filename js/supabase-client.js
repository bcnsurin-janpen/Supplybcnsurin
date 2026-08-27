// ============================================
// สร้าง Supabase client จากค่าที่ตั้งไว้ใน supabase-config.js
// ============================================
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
