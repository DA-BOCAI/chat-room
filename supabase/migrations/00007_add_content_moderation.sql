-- 创建违规记录表
CREATE TABLE IF NOT EXISTS moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  violation_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_moderation_logs_room_id ON moderation_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_id ON moderation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON moderation_logs(created_at);

-- 为messages表添加is_warning字段，标记监管警告消息
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_warning boolean DEFAULT false;

-- RLS策略
ALTER TABLE moderation_logs ENABLE ROW LEVEL SECURITY;

-- 只有认证用户可以查看违规记录（用于管理员功能）
CREATE POLICY "认证用户可查看违规记录" ON moderation_logs
  FOR SELECT TO authenticated USING (true);

-- 系统可以插入违规记录
CREATE POLICY "系统可插入违规记录" ON moderation_logs
  FOR INSERT TO authenticated WITH CHECK (true);