import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  getRoomById,
  getRoomMembers,
  getRoomMessages,
  leaveRoom,
  deleteRoom,
  isUserInRoom,
} from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Room, RoomMember, Message } from '@/types/types';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { OnlineUserList } from '@/components/chat/OnlineUserList';

export default function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoomData = async () => {
    if (!roomId) return;

    // 检查用户是否在房间中
    const inRoom = await isUserInRoom(roomId);
    if (!inRoom) {
      toast.error('您不在该房间中');
      navigate('/lobby');
      return;
    }

    const [roomData, membersData, messagesData] = await Promise.all([
      getRoomById(roomId),
      getRoomMembers(roomId),
      getRoomMessages(roomId),
    ]);

    setRoom(roomData);
    setMembers(membersData);
    setMessages(messagesData);
    setLoading(false);
  };

  useEffect(() => {
    loadRoomData();

    if (!roomId) return;

    // 订阅消息变化
    const messagesChannel = supabase
      .channel(`room-messages-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const messagesData = await getRoomMessages(roomId);
          setMessages(messagesData);
        }
      )
      .subscribe();

    // 订阅成员变化
    const membersChannel = supabase
      .channel(`room-members-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const membersData = await getRoomMembers(roomId);
          setMembers(membersData);
        }
      )
      .subscribe();

    // 订阅房间删除
    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          toast.error('该聊天室已被解散');
          navigate('/lobby');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomId, navigate]);

  const handleLeaveRoom = async () => {
    if (!roomId) return;

    try {
      await leaveRoom(roomId);
      toast.success('已退出房间');
      navigate('/lobby');
    } catch (error) {
      toast.error(`退出房间失败: ${(error as Error).message}`);
    }
  };

  const handleDeleteRoom = async () => {
    if (!roomId) return;

    try {
      await deleteRoom(roomId);
      toast.success('房间已解散');
      navigate('/lobby');
    } catch (error) {
      toast.error(`解散房间失败: ${(error as Error).message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">房间不存在</p>
          <Button onClick={() => navigate('/lobby')}>返回大厅</Button>
        </div>
      </div>
    );
  }

  const isCreator = user?.id === room.creator_id;
  const canDelete = isCreator && !room.is_default; // 只有创建者且非默认房间才能解散

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航栏 */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/lobby')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-foreground">{room.name}</h1>
            <p className="text-xs text-muted-foreground">{members.length}人在线</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  解散房间
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认解散房间？</AlertDialogTitle>
                  <AlertDialogDescription>
                    解散后，房间内所有用户将被移出，历史消息将被清空，此操作不可恢复。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteRoom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    确认解散
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button variant="outline" size="sm" onClick={handleLeaveRoom}>
              退出房间
            </Button>
          )}
        </div>
      </header>

      {/* 主体区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 消息区域 */}
        <div className="flex-1 flex flex-col">
          <MessageList messages={messages} currentUserId={user?.id || ''} botName={room.bot_name} />
          <MessageInput roomId={roomId || ''} room={room} />
        </div>

        {/* 在线用户列表 */}
        <OnlineUserList members={members} creatorId={room.creator_id} />
      </div>
    </div>
  );
}
