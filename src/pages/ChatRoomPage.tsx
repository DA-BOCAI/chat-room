import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { MessageInput } from '@/components/chat/MessageInput';
import { MessageList } from '@/components/chat/MessageList';
import { MessageSummary } from '@/components/chat/MessageSummary';
import { OnlineUserList } from '@/components/chat/OnlineUserList';
import { RoomBotSettingsDialog } from '@/components/chat/RoomBotSettingsDialog';
import { Button } from '@/components/ui/button';
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
import {
  checkUserRoomStatus,
  deleteRoom,
  getRoomById,
  getRoomMembers,
  getRoomMessages,
  leaveRoom,
} from '@/db/api';
import { supabase } from '@/db/supabase';
import {
  confirmTempMessage,
  mergeHydratedMessages,
  readCachedRoomMessages,
  reconcileIncomingMessage,
  writeCachedRoomMessages,
} from '@/lib/chatMessages';
import type { Message, Profile, Room, RoomMember } from '@/types/types';

async function getUnreadMessages(roomId: string, lastSeen: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('content, created_at, profile:profiles(username)')
    .eq('room_id', roomId)
    .gt('created_at', lastSeen)
    .order('created_at', { ascending: true });

  if (error) {
    return [];
  }

  return data || [];
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
  const [members, setMembers] = useState<Map<string, RoomMember>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const profileCacheRef = useRef<Map<string, Profile>>(new Map());

  const initProfileCache = (nextMessages: Message[]) => {
    for (const message of nextMessages) {
      if (message.profile && !profileCacheRef.current.has(message.user_id)) {
        profileCacheRef.current.set(message.user_id, message.profile);
      }
    }
  };

  const getProfile = async (userId: string): Promise<Profile | null> => {
    const cached = profileCacheRef.current.get(userId);
    if (cached) {
      return cached;
    }

    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      profileCacheRef.current.set(userId, data);
    }
    return data;
  };

  const updateMessageContent = (messageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === messageId ? { ...message, content } : message))
    );
  };

  const removeMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
  };

  const addTempMessage = (message: Message) => {
    setMessages((prev) => reconcileIncomingMessage(prev, message));
  };

  const confirmMessage = (
    tempId: string,
    persisted: {
      id: string;
      created_at?: string;
      content?: string;
    }
  ) => {
    setMessages((prev) => confirmTempMessage(prev, tempId, persisted));
  };

  const generateSummary = async (lastSeen: string) => {
    if (!roomId || !user?.id) {
      return;
    }

    setLoadingSummary(true);

    try {
      const unreadMessages = await getUnreadMessages(roomId, lastSeen);
      if (unreadMessages.length === 0) {
        return;
      }

      const messageText = unreadMessages
        .map((message: any) => {
          const username = message.profile?.username || '未知用户';
          return `${username}: ${message.content}`;
        })
        .join('\n');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-with-ai`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `请用 3 到 5 句话简洁总结以下聊天记录：\n${messageText}`,
                },
              ],
            },
          ],
          enable_thinking: false,
        }),
      });

      if (!response.ok || !response.body) {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let summaryText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            summaryText += parsed.choices?.[0]?.delta?.content || '';
          } catch {}
        }
      }

      setSummaryData({
        summary: summaryText.trim(),
        unreadCount: unreadMessages.length,
        hasUnread: true,
        firstUnreadTime: unreadMessages[0].created_at,
      });
      setShowSummary(Boolean(summaryText.trim()));
    } catch (error) {
      console.error('生成消息摘要失败:', error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadRoomData = async () => {
    if (!roomId) {
      return;
    }

    try {
      const cachedMessages = readCachedRoomMessages(roomId);
      if (cachedMessages.length > 0) {
        setMessages(cachedMessages);
        initProfileCache(cachedMessages);
      }

      const { inRoom, lastSeen } = await checkUserRoomStatus(roomId);
      if (!inRoom) {
        toast.error('您不在该房间中');
        navigate('/lobby');
        return;
      }

      const [roomData, membersData, serverMessages] = await Promise.all([
        getRoomById(roomId),
        getRoomMembers(roomId),
        getRoomMessages(roomId),
      ]);

      const hydratedMessages = mergeHydratedMessages(cachedMessages, serverMessages);

      setRoom(roomData);
      setMembers(new Map(membersData.map((member) => [member.user_id, member])));
      setMessages(hydratedMessages);
      initProfileCache(hydratedMessages);
      setLoading(false);

      const lastLeftAt = sessionStorage.getItem(`last_left_${roomId}`);
      if (lastLeftAt) {
        await generateSummary(lastLeftAt);
        sessionStorage.removeItem(`last_left_${roomId}`);
      } else if (lastSeen) {
        await generateSummary(lastSeen);
      }
    } catch (error) {
      console.error('加载房间数据失败:', error);
      toast.error('加载房间失败，请稍后重试');
      navigate('/lobby');
    }
  };

  useEffect(() => {
    if (!roomId) {
      return;
    }

    writeCachedRoomMessages(roomId, messages);
  }, [roomId, messages]);

  useEffect(() => {
    void loadRoomData();

    if (!roomId) {
      return;
    }

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
          const incomingMessage = payload.new as Message;
          if (!incomingMessage || incomingMessage.room_id !== roomId) {
            return;
          }

          const profile = await getProfile(incomingMessage.user_id);
          setMessages((prev) =>
            reconcileIncomingMessage(prev, {
              ...incomingMessage,
              profile: profile || undefined,
            })
          );
        }
      )
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
          setMessages((prev) => prev.filter((message) => message.id !== deletedId));
        }
      )
      .subscribe();

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
          const member = payload.new as RoomMember;
          const profile = await getProfile(member.user_id);
          if (!profile) {
            return;
          }

          setMembers((prev) => {
            const next = new Map(prev);
            next.set(member.user_id, { ...member, profile });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const member = payload.new as RoomMember;

          if (member.last_seen) {
            setMembers((prev) => {
              const next = new Map(prev);
              next.delete(member.user_id);
              return next;
            });
            return;
          }

          const profile = await getProfile(member.user_id);
          if (!profile) {
            return;
          }

          setMembers((prev) => {
            const next = new Map(prev);
            next.set(member.user_id, { ...member, profile });
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_members',
        },
        (payload) => {
          const oldRow = payload.old as { id?: string; user_id?: string };
          setMembers((prev) => {
            const next = new Map(prev);

            if (oldRow.user_id) {
              next.delete(oldRow.user_id);
              return next;
            }

            if (oldRow.id) {
              for (const [userId, member] of next.entries()) {
                if (member.id === oldRow.id) {
                  next.delete(userId);
                  break;
                }
              }
            }

            return next;
          });
        }
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const updatedRoom = payload.new as Room;
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  name: updatedRoom.name,
                  type: updatedRoom.type,
                  is_default: updatedRoom.is_default,
                  bot_name: updatedRoom.bot_name,
                  bot_prompt: updatedRoom.bot_prompt,
                }
              : prev
          );
        }
      )
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
    if (!roomId) {
      return;
    }

    try {
      sessionStorage.setItem(`last_left_${roomId}`, new Date().toISOString());
      await leaveRoom(roomId);
      toast.success('已退出房间');
      navigate('/lobby');
    } catch (error) {
      toast.error(`退出房间失败: ${(error as Error).message}`);
    }
  };

  const handleDeleteRoom = async () => {
    if (!roomId) {
      return;
    }

    try {
      await deleteRoom(roomId);
      toast.success('房间已解散');
      navigate('/lobby');
    } catch (error) {
      toast.error(`解散房间失败: ${(error as Error).message}`);
    }
  };

  const handleBotUpdated = (config: { botName: string; botPrompt: string }) => {
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            bot_name: config.botName,
            bot_prompt: config.botPrompt,
          }
        : prev
    );
  };

  const handleViewDetails = () => {
    if (!summaryData?.firstUnreadTime) {
      return;
    }

    const firstUnreadIndex = messages.findIndex(
      (message) =>
        new Date(message.created_at).getTime() >=
        new Date(summaryData.firstUnreadTime as string).getTime()
    );

    if (firstUnreadIndex !== -1) {
      const messageElements = document.querySelectorAll('[data-message-id]');
      if (messageElements[firstUnreadIndex]) {
        messageElements[firstUnreadIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }

    setShowSummary(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">房间不存在</p>
          <Button onClick={() => navigate('/lobby')}>返回大厅</Button>
        </div>
      </div>
    );
  }

  const isCreator = user?.id === room.creator_id;
  const canDelete = isCreator && !room.is_default;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (roomId) {
                sessionStorage.setItem(`last_left_${roomId}`, new Date().toISOString());
              }
              navigate('/lobby');
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-foreground">{room.name}</h1>
            <p className="text-xs text-muted-foreground">{members.size} 人在线</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCreator && !room.is_default && (
            <RoomBotSettingsDialog
              roomId={roomId || ''}
              currentBotName={room.bot_name}
              onUpdated={handleBotUpdated}
            />
          )}

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
                    解散后，房间内成员会被移出，历史消息也会被清空，此操作不可恢复。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteRoom}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <MessageList
            messages={messages}
            currentUserId={user?.id || ''}
            botName={room.bot_name}
          />
          <MessageInput
            roomId={roomId || ''}
            room={room}
            existingMessages={messages}
            onUpdateMessage={updateMessageContent}
            onDeleteMessage={removeMessage}
            onAddTempMessage={addTempMessage}
            onConfirmMessage={confirmMessage}
          />
        </div>

        <div className="flex w-80 flex-col border-l border-border bg-card">
          {loadingSummary && (
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在生成离线消息摘要...</span>
              </div>
            </div>
          )}

          {showSummary && summaryData?.hasUnread && (
            <div className="border-b border-border p-4">
              <MessageSummary
                summary={summaryData.summary}
                unreadCount={summaryData.unreadCount}
                onViewDetails={handleViewDetails}
                onClose={() => setShowSummary(false)}
              />
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <OnlineUserList members={[...members.values()]} creatorId={room.creator_id} />
          </div>
        </div>
      </div>
    </div>
  );
}
