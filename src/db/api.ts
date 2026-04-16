import { supabase } from './supabase';
import type { Room, Message, RoomMember } from '@/types/types';

// ==================== 房间相关 ====================

// 获取所有房间列表（包含在线人数）
export async function getRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取房间列表失败:', error);
    return [];
  }

  const roomList = Array.isArray(data) ? data : [];
  if (roomList.length === 0) return [];

  // 一次查询获取所有房间的在线人数
  const roomIds = roomList.map(r => r.id);
  const { data: membersData } = await supabase
    .from('room_members')
    .select('room_id')
    .in('room_id', roomIds)
    .is('last_seen', null);

  const countMap = new Map<string, number>();
  membersData?.forEach(m => {
    countMap.set(m.room_id, (countMap.get(m.room_id) || 0) + 1);
  });

  return roomList.map(room => ({
    ...room,
    member_count: countMap.get(room.id) || 0
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

  // 使用upsert，用户重新加入时重置last_seen为NULL（表示在线）
  const { error } = await supabase
    .from('room_members')
    .upsert({
      room_id: roomId,
      user_id: user.user.id,
      last_seen: null, // 重置为NULL表示在线
    }, {
      onConflict: 'room_id,user_id',
      ignoreDuplicates: false
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

// 获取房间成员列表（只返回真正在线的用户，即 last_seen 为 NULL）
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('room_id', roomId)
    .is('last_seen', null)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('获取房间成员失败:', error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

// 检查用户是否在房间中（只检查 last_seen 为 NULL 的记录，即真正在线的用户）
export async function isUserInRoom(roomId: string): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return false;

  const { data, error } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.user.id)
    .is('last_seen', null)
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

// 联合查询：检查用户是否在房间中以及最后查看时间
export async function checkUserRoomStatus(roomId: string): Promise<{ inRoom: boolean; lastSeen: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { inRoom: false, lastSeen: null };

  const { data, error } = await supabase
    .from('room_members')
    .select('last_seen')
    .eq('room_id', roomId)
    .eq('user_id', user.user.id)
    .maybeSingle();

  if (error || !data) return { inRoom: false, lastSeen: null };

  return {
    inRoom: data.last_seen === null,
    lastSeen: data.last_seen || null
  };
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
export async function sendMessage(
  roomId: string,
  content: string,
  isAi: boolean = false,
  isWarning: boolean = false,
  createdAt?: string
): Promise<{ id: string } | null> {
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

  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      user_id: user.user.id,
      content: trimmedContent,
      is_ai: isAi,
      is_warning: isWarning,
      ...(createdAt && { created_at: createdAt }),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

// 删除消息
export async function deleteMessage(messageId: string) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) throw error;
}

// 更新消息内容
export async function updateMessage(messageId: string, content: string) {
  const { error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', messageId);

  if (error) throw error;
}
