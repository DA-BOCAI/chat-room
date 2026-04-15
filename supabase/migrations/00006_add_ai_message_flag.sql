-- 为messages表添加is_ai字段，标记AI生成的消息
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai boolean DEFAULT false;