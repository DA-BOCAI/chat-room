import { supabase } from './supabase';
import type { Room, Message, RoomMember } from '@/types/types';

// ==================== 房间相关 ====================

// 获取所有房间列表（包含在线人数）
export async function getRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      room_members(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取房间列表失败:', error);
    return [];
  }

  return (Array.isArray(data) ? data : []).map((room) => ({
    ...room,
    member_count: room.room_members?.[0]?.count || 0,
  }));
}

// 创建房间
export async function createRoom(name: string, type: 'public' | 'private', password?: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('未登录');
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      name,
      type,
      password: password || null,
      creator_id: user.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 验证房间密码
export async function verifyRoomPassword(roomId: string, password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('rooms')
    .select('password')
    .eq('id', roomId)
    .maybeSingle();

  if (error || !data) return false;
  return data.password === password;
}

// 删除房间（解散）
export async function deleteRoom(roomId: string) {
  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', roomId);

  if (error) throw error;
}

// 获取房间详情
export async function getRoomById(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (error) {
    console.error('获取房间详情失败:', error);
    return null;
  }
  return data;
}

// ==================== 房间成员相关 ====================

// 加入房间
export async function joinRoom(roomId: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('未登录');
  }

  const { error } = await supabase
    .from('room_members')
    .insert({
      room_id: roomId,
      user_id: user.user.id,
    });

  if (error) throw error;
}

// 退出房间
export async function leaveRoom(roomId: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('未登录');
  }

  // 更新last_seen时间
  await supabase
    .from('room_members')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', user.user.id);

  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.user.id);

  if (error) throw error;
}

// 退出所有房间
export async function leaveAllRooms() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return;
  }

  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('user_id', user.user.id);

  if (error) {
    console.error('退出所有房间失败:', error);
  }
}

// 获取房间成员列表
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('获取房间成员失败:', error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

// 检查用户是否在房间中
export async function isUserInRoom(roomId: string): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return false;

  const { data, error } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.user.id)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

// 获取用户在房间的最后查看时间
export async function getUserLastSeen(roomId: string): Promise<string | null> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data, error } = await supabase
    .from('room_members')
    .select('last_seen')
    .eq('room_id', roomId)
    .eq('user_id', user.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data.last_seen;
}

// ==================== 消息相关 ====================

// 获取房间消息列表
export async function getRoomMessages(roomId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('获取消息列表失败:', error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

// 发送消息
export async function sendMessage(roomId: string, content: string, isAi: boolean = false, isWarning: boolean = false) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('未登录');
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('消息内容不能为空');
  }

  if (trimmedContent.length > 500) {
    throw new Error('消息长度不能超过500字');
  }

  const { error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      user_id: user.user.id,
      content: trimmedContent,
      is_ai: isAi,
      is_warning: isWarning,
    });

  if (error) throw error;
}
