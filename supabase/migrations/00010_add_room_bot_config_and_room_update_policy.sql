-- 房间机器人私有提示词配置（仅房主可读写）
CREATE TABLE IF NOT EXISTS room_bot_configs (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  bot_prompt text NOT NULL CHECK (length(trim(bot_prompt)) > 0 AND char_length(bot_prompt) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 迁移历史提示词数据，避免功能回归
INSERT INTO room_bot_configs (room_id, bot_prompt)
SELECT id, bot_prompt
FROM rooms
WHERE bot_prompt IS NOT NULL AND length(trim(bot_prompt)) > 0
ON CONFLICT (room_id) DO UPDATE
SET bot_prompt = EXCLUDED.bot_prompt,
    updated_at = now();

ALTER TABLE room_bot_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "房主可查看机器人提示词" ON room_bot_configs;
CREATE POLICY "房主可查看机器人提示词" ON room_bot_configs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rooms
      WHERE rooms.id = room_bot_configs.room_id
      AND rooms.creator_id = auth.uid()
      AND rooms.is_default = false
    )
  );

DROP POLICY IF EXISTS "房主可新增机器人提示词" ON room_bot_configs;
CREATE POLICY "房主可新增机器人提示词" ON room_bot_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rooms
      WHERE rooms.id = room_bot_configs.room_id
      AND rooms.creator_id = auth.uid()
      AND rooms.is_default = false
    )
  );

DROP POLICY IF EXISTS "房主可更新机器人提示词" ON room_bot_configs;
CREATE POLICY "房主可更新机器人提示词" ON room_bot_configs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rooms
      WHERE rooms.id = room_bot_configs.room_id
      AND rooms.creator_id = auth.uid()
      AND rooms.is_default = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rooms
      WHERE rooms.id = room_bot_configs.room_id
      AND rooms.creator_id = auth.uid()
      AND rooms.is_default = false
    )
  );

DROP POLICY IF EXISTS "房主可删除机器人提示词" ON room_bot_configs;
CREATE POLICY "房主可删除机器人提示词" ON room_bot_configs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rooms
      WHERE rooms.id = room_bot_configs.room_id
      AND rooms.creator_id = auth.uid()
      AND rooms.is_default = false
    )
  );

CREATE OR REPLACE FUNCTION set_room_bot_configs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_bot_configs_updated_at ON room_bot_configs;
CREATE TRIGGER trg_room_bot_configs_updated_at
  BEFORE UPDATE ON room_bot_configs
  FOR EACH ROW
  EXECUTE FUNCTION set_room_bot_configs_updated_at();

-- 房主更新房间基础配置（用于 bot_name）
DROP POLICY IF EXISTS "房主可更新房间" ON rooms;
DROP POLICY IF EXISTS "房间创建者可更新房间" ON rooms;
CREATE POLICY "房主可更新非默认房间" ON rooms
  FOR UPDATE TO authenticated
  USING (
    creator_id = auth.uid()
    AND is_default = false
  )
  WITH CHECK (
    creator_id = auth.uid()
    AND is_default = false
  );
