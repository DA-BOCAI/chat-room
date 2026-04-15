-- 修改rooms表，允许creator_id为NULL（用于系统默认房间）
ALTER TABLE rooms ALTER COLUMN creator_id DROP NOT NULL;

-- 添加is_default字段，标记默认房间
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- 更新删除策略，默认房间不能被删除
DROP POLICY IF EXISTS "房间创建者可删除房间" ON rooms;
CREATE POLICY "房间创建者可删除非默认房间" ON rooms
  FOR DELETE USING (
    creator_id = auth.uid() AND is_default = false
  );

-- 插入三个默认房间
INSERT INTO rooms (name, type, creator_id, is_default, created_at)
VALUES 
  ('旅行', 'public', NULL, true, now()),
  ('游戏', 'public', NULL, true, now()),
  ('美食', 'public', NULL, true, now())
ON CONFLICT DO NOTHING;