// 用户信息类型
export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

// 聊天室类型
export interface Room {
  id: string;
  name: string;
  type: 'public' | 'private';
  password?: string;
  creator_id: string | null;
  is_default?: boolean;
  bot_name?: string;
  bot_prompt?: string;
  created_at: string;
  member_count?: number;
}

// 房间成员类型
export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  last_seen?: string | null;
  profile?: Profile;
}

// 消息类型
export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  is_ai?: boolean;
  is_warning?: boolean;
  created_at: string;
  profile?: Profile;
}

// 内容审核结果
export interface ModerationResult {
  isSafe: boolean;
  violationType?: string;
  warningMessage?: string;
  error?: string;
  flaggedCategories?: string[];
}
