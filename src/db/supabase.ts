
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 使用sessionStorage而不是localStorage，让每个标签页可以独立登录不同账号
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    // @ts-expect-error multiTab 在运行时受支持，但当前类型定义缺失该字段。
    // 关闭多标签页广播，避免不同标签登录状态互相覆盖。
    multiTab: false,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
