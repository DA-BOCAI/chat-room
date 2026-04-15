import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Loader2 } from 'lucide-react';
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
  getUserLastSeen,
} from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Room, RoomMember, Message } from '@/types/types';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { OnlineUserList } from '@/components/chat/OnlineUserList';
import { MessageSummary } from '@/components/chat/MessageSummary';

interface SummaryData {
  summary: string;
  unreadCount: number;
  hasUnread: boolean;
  firstUnreadTime?: string;
}

export default function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // 生成消息摘要
  const generateSummary = async (lastSeen: string) => {
    if (!roomId || !user?.id) return;

    setLoadingSummary(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      console.log('开始生成摘要，参数:', { roomId, userId: user.id, lastSeen });

      const response = await fetch(`${supabaseUrl}/functions/v1/message-summary`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          userId: user.id,
          lastSeen
        })
      });

      console.log('摘要API响应状态:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('生成摘要失败:', response.statusText, errorText);
        return;
      }

      const result: SummaryData = await response.json();
      console.log('摘要结果:', result);
      
      if (result.hasUnread && result.summary) {
        setSummaryData(result);
        setShowSummary(true);
        console.log('显示摘要面板');
      } else {
        console.log('没有未读消息或摘要为空');
      }
    } catch (error) {
      console.error('调用摘要API失败:', error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadRoomData = async () => {
    if (!roomId) return;

    // 检查用户是否在房间中
    const inRoom = await isUserInRoom(roomId);
    if (!inRoom) {
      toast.error('您不在该房间中');
      navigate('/lobby');
      return;
    }

    // 获取用户最后查看时间
    const lastSeen = await getUserLastSeen(roomId);
    console.log('用户最后查看时间:', lastSeen);
    
    const [roomData, membersData, messagesData] = await Promise.all([
      getRoomById(roomId),
      getRoomMembers(roomId),
      getRoomMessages(roomId),
    ]);

    setRoom(roomData);
    setMembers(membersData);
    setMessages(messagesData);
    setLoading(false);

    // 检查是否需要生成摘要（取消时间限制，只要有last_seen就尝试生成）
    if (lastSeen) {
      const lastSeenTime = new Date(lastSeen).getTime();
      const now = new Date().getTime();
      const diffMinutes = (now - lastSeenTime) / (1000 * 60);
      
      console.log('时间差（分钟）:', diffMinutes);
      
      // 只要离线超过1分钟就生成摘要
      if (diffMinutes > 1) {
        console.log('触发智能总结，last_seen:', lastSeen);
        await generateSummary(lastSeen);
      } else {
        console.log('离线时间不足1分钟，不生成摘要');
      }
    } else {
      console.log('没有last_seen记录，可能是首次进入房间');
    }
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

  // 滚动到未读消息位置
  const handleViewDetails = () => {
    if (!summaryData?.firstUnreadTime) return;
    
    // 找到第一条未读消息的索引
    const firstUnreadIndex = messages.findIndex(
      msg => new Date(msg.created_at).getTime() >= new Date(summaryData.firstUnreadTime!).getTime()
    );
    
    if (firstUnreadIndex !== -1) {
      // 滚动到该消息
      const messageElements = document.querySelectorAll('[data-message-id]');
      if (messageElements[firstUnreadIndex]) {
        messageElements[firstUnreadIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
    // 关闭摘要面板并清除last_seen（标记已读）
    setShowSummary(false);
    clearLastSeen();
  };

  // 清除last_seen（标记用户已查看所有消息）
  const clearLastSeen = async () => {
    if (!roomId || !user?.id) return;
    
    try {
      await supabase
        .from('room_members')
        .update({ last_seen: null })
        .eq('room_id', roomId)
        .eq('user_id', user.id);
      
      console.log('已清除last_seen，标记消息为已读');
    } catch (error) {
      console.error('清除last_seen失败:', error);
    }
  };

  const handleCloseSummary = () => {
    setShowSummary(false);
    // 关闭摘要时也清除last_seen，标记消息为已读
    clearLastSeen();
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

        {/* 右侧边栏 */}
        <div className="w-80 border-l border-border bg-card flex flex-col">
          {/* 摘要面板 */}
          {loadingSummary && (
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在生成消息摘要...</span>
              </div>
            </div>
          )}
          
          {showSummary && summaryData && (
            <div className="p-4 border-b border-border">
              <MessageSummary
                summary={summaryData.summary}
                unreadCount={summaryData.unreadCount}
                onViewDetails={handleViewDetails}
                onClose={handleCloseSummary}
              />
            </div>
          )}

          {/* 在线用户列表 */}
          <div className="flex-1 overflow-hidden">
            <OnlineUserList members={members} creatorId={room.creator_id} />
          </div>
        </div>
      </div>
    </div>
  );
}
