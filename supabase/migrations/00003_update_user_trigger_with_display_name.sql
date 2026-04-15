-- 更新触发器函数，支持display_name和session_id
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_username text;
  user_display_name text;
  user_session_id text;
  is_anon boolean;
BEGIN
  -- 从email中提取用户名（格式：username@miaoda.com）
  user_username := split_part(NEW.email, '@', 1);
  
  -- 检查是否是会话ID格式（session_开头）
  is_anon := user_username LIKE 'session_%';
  
  -- 从metadata中获取display_name
  user_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', user_username);
  
  -- 如果是匿名用户，使用username作为session_id
  IF is_anon THEN
    user_session_id := user_username;
  ELSE
    user_session_id := NULL;
  END IF;
  
  INSERT INTO public.profiles (id, username, display_name, session_id, is_anonymous)
  VALUES (
    NEW.id,
    user_username,
    user_display_name,
    user_session_id,
    is_anon
  );
  RETURN NEW;
END;
$$;