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
  checkUserRoomStatus,
} from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Room, RoomMember, Message, Profile } from '@/types/types';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { OnlineUserList } from '@/components/chat/OnlineUserList';
import { MessageSummary } from '@/components/chat/MessageSummary';

// 二分查找插入位置（假设 messages 按 created_at 升序）
function binarySearchInsert(messages: Message[], newTime: number): number {
  let left = 0;
  let right = messages.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const msgTime = new Date(messages[mid].created_at).getTime();
    if (msgTime < newTime) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

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

  // Profile 缓存
  const profileCacheRef = useRef<Map<string, Profile>>(new Map());

  // 初始化 profile 缓存
  const initProfileCache = (msgs: Message[]) => {
    msgs.forEach(msg => {
      if (msg.profile && !profileCacheRef.current.has(msg.user_id)) {
        profileCacheRef.current.set(msg.user_id, msg.profile);
      }
    });
  };

  // 获取 profile（先查缓存）
  const getProfile = async (userId: string): Promise<Profile | null> => {
    const cached = profileCacheRef.current.get(userId);
    if (cached) return cached;

    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      profileCacheRef.current.set(userId, data);
    }
    return data;
  };

  // 更新消息内容（用于AI流式更新）
  const updateMessageContent = (messageId: string, content: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, content } : msg
    ));
  };

  // 删除消息（用于审核失败后删除）
  const removeMessage = (messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  };

  // 添加临时消息（用于AI流式显示）
  const addTempMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

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

    // 并行检查用户房间状态
    const { inRoom, lastSeen } = await checkUserRoomStatus(roomId);
    console.log('用户最后查看时间:', lastSeen);

    if (!inRoom) {
      toast.error('您不在该房间中');
      navigate('/lobby');
      return;
    }

    // 并行获取房间、成员、消息数据
    const [roomData, membersData, messagesData] = await Promise.all([
      getRoomById(roomId),
      getRoomMembers(roomId),
      getRoomMessages(roomId),
    ]);

    setRoom(roomData);
    setMembers(membersData);
    setMessages(messagesData);

    // 初始化 profile 缓存
    initProfileCache(messagesData);

    setLoading(false);

    // 检查是否需要生成摘要
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

    // 订阅消息变化（优化：O(1) 追加 + profile 缓存）
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
        async (payload) => {
          const newMessage = payload.new as Message;
          if (newMessage && newMessage.room_id === roomId) {
            // 先查缓存获取 profile
            const profile = await getProfile(newMessage.user_id);

            setMessages(prev => {
              // 检查是否是临时消息需要替换
              const tempIndex = prev.findIndex(m => m.id.startsWith('temp-') || m.id.startsWith('ai-temp-'));
              if (tempIndex !== -1) {
                // 移除临时消息
                const withoutTemp = prev.filter((_, index) => index !== tempIndex);
                const msgWithProfile = { ...newMessage, profile: profile || prev[tempIndex].profile };

                // 优化：直接 push 再排序（大多数情况消息有序）
                const lastTime = withoutTemp.length > 0
                  ? new Date(withoutTemp[withoutTemp.length - 1].created_at).getTime()
                  : 0;
                const newTime = new Date(msgWithProfile.created_at).getTime();

                if (newTime >= lastTime) {
                  return [...withoutTemp, msgWithProfile];
                }

                // 乱序情况用二分查找
                const insertIndex = binarySearchInsert(withoutTemp, newTime);
                const updated = [...withoutTemp];
                updated.splice(insertIndex, 0, msgWithProfile);
                return updated;
              }

              // 非临时消息：优化插入
              const lastTime = prev.length > 0
                ? new Date(prev[prev.length - 1].created_at).getTime()
                : 0;
              const newTime = new Date(newMessage.created_at).getTime();

              if (newTime >= lastTime) {
                return [...prev, { ...newMessage, profile: profile || undefined }];
              }

              // 乱序情况用二分查找
              const insertIndex = binarySearchInsert(prev, newTime);
              const updated = [...prev];
              updated.splice(insertIndex, 0, { ...newMessage, profile: profile || undefined });
              return updated;
            });
          }
        }
      )
      // 监听消息删除（审核不通过时消息被删除，UI 自动移除）
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .subscribe();

    // 订阅成员变化（增量更新：只处理 INSERT/DELETE）
    const membersChannel = supabase
      .channel(`room-members-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMember = payload.new as RoomMember;
          const profile = await getProfile(newMember.user_id);
          if (profile) {
            setMembers(prev => [...prev, { ...newMember, profile }]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deleted = payload.old as { user_id: string };
          setMembers(prev => prev.filter(m => m.user_id !== deleted.user_id));
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
    
    // 关闭摘要面板
    setShowSummary(false);
  };

  const handleCloseSummary = () => {
    setShowSummary(false);
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
          <MessageInput
            roomId={roomId || ''}
            room={room}
            existingMessages={messages}
            onUpdateMessage={updateMessageContent}
            onDeleteMessage={removeMessage}
            onAddTempMessage={addTempMessage}
          />
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
