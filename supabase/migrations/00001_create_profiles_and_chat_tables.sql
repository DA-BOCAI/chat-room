-- 创建用户信息表
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 创建聊天室表
CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('public', 'private')),
  password text,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 创建房间成员表
CREATE TABLE room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- 创建消息表
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 创建索引优化查询性能
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_messages_room_id ON messages(room_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- 创建触发器同步用户数据
CREATE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 从email中提取用户名（格式：username@miaoda.com）
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_new_user();

-- 启用Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 配置RLS策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- profiles表策略：所有已登录用户可查看所有用户信息
CREATE POLICY "所有已登录用户可查看用户信息" ON profiles
  FOR SELECT TO authenticated USING (true);

-- rooms表策略：所有已登录用户可查看所有房间
CREATE POLICY "所有已登录用户可查看房间" ON rooms
  FOR SELECT TO authenticated USING (true);

-- rooms表策略：已登录用户可创建房间
CREATE POLICY "已登录用户可创建房间" ON rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- rooms表策略：房间创建者可删除房间
CREATE POLICY "房间创建者可删除房间" ON rooms
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- room_members表策略：所有已登录用户可查看房间成员
CREATE POLICY "所有已登录用户可查看房间成员" ON room_members
  FOR SELECT TO authenticated USING (true);

-- room_members表策略：已登录用户可加入房间
CREATE POLICY "已登录用户可加入房间" ON room_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- room_members表策略：用户可退出自己加入的房间
CREATE POLICY "用户可退出自己加入的房间" ON room_members
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- messages表策略：房间成员可查看房间消息
CREATE POLICY "房间成员可查看房间消息" ON messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
      AND room_members.user_id = auth.uid()
    )
  );

-- messages表策略：房间成员可发送消息
CREATE POLICY "房间成员可发送消息" ON messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
      AND room_members.user_id = auth.uid()
    )
  );