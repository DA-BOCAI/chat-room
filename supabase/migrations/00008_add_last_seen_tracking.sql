-- 为room_members表添加last_seen字段，记录用户最后查看房间的时间
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- 创建更新last_seen的函数
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$;

-- 创建触发器，当用户重新加入房间时自动更新last_seen
CREATE OR REPLACE TRIGGER update_room_member_last_seen
  BEFORE UPDATE ON room_members
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen();