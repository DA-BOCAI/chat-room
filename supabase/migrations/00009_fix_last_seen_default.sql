-- 修改last_seen字段默认值为NULL，这样首次加入房间时不会有last_seen记录
ALTER TABLE room_members ALTER COLUMN last_seen SET DEFAULT NULL;

-- 删除之前的触发器，因为我们要手动控制last_seen的更新
DROP TRIGGER IF EXISTS update_room_member_last_seen ON room_members;
DROP FUNCTION IF EXISTS update_last_seen();