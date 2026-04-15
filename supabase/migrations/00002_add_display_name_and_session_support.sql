-- 为profiles表添加display_name和session_id字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_session_id ON profiles(session_id);

-- 更新RLS策略，移除authenticated要求
DROP POLICY IF EXISTS "所有已登录用户可查看用户信息" ON profiles;
CREATE POLICY "所有用户可查看用户信息" ON profiles
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "所有已登录用户可查看房间" ON rooms;
CREATE POLICY "所有用户可查看房间" ON rooms
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "已登录用户可创建房间" ON rooms;
CREATE POLICY "所有用户可创建房间" ON rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "所有已登录用户可查看房间成员" ON room_members;
CREATE POLICY "所有用户可查看房间成员" ON room_members
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "已登录用户可加入房间" ON room_members;
CREATE POLICY "所有用户可加入房间" ON room_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "房间成员可查看房间消息" ON messages;
CREATE POLICY "所有房间成员可查看消息" ON messages
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
    )
  );

DROP POLICY IF EXISTS "房间成员可发送消息" ON messages;
CREATE POLICY "所有房间成员可发送消息" ON messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = messages.room_id
      AND room_members.user_id = auth.uid()
    )
  );