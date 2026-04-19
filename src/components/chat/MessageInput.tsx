import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sendMessage } from '@/db/api';
import { supabase } from '@/db/supabase';
import { localModeration } from '@/lib/moderation';
import { sendStreamRequest } from '@/lib/sse';
import type { Message, ModerationResult, Room } from '@/types/types';

interface MessageInputProps {
  roomId: string;
  room: Room | null;
  existingMessages?: Message[];
  onUpdateMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onAddTempMessage?: (message: Message) => void;
  onConfirmMessage?: (
    tempId: string,
    persisted: {
      id: string;
      created_at?: string;
      content?: string;
    }
  ) => void;
}

export function MessageInput({
  roomId,
  room,
  existingMessages = [],
  onUpdateMessage,
  onDeleteMessage,
  onAddTempMessage,
  onConfirmMessage,
}: MessageInputProps) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const getNextMessageTimestamp = (messages: Message[], anchorCreatedAt?: string): string => {
    const lastMessageTime =
      messages.length > 0 ? new Date(messages[messages.length - 1].created_at).getTime() : 0;
    const anchorTime = anchorCreatedAt ? new Date(anchorCreatedAt).getTime() : 0;

    return new Date(Math.max(lastMessageTime, anchorTime) + 1).toISOString();
  };

  const moderateContent = async (value: string): Promise<ModerationResult> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: value,
          roomId,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        return { isSafe: true };
      }

      return await response.json();
    } catch (error) {
      console.error('调用内容审核失败:', error);
      return { isSafe: true };
    }
  };

  const sendWarningMessage = (violationType: string, warningMessage?: string) => {
    const suffix = warningMessage ? `：${warningMessage}` : '';
    toast.error(`检测到消息包含${violationType}内容，请调整后再发送${suffix}`, {
      duration: 5000,
    });
  };

  const confirmPersistedMessage = (
    tempId: string,
    savedMessage: { id: string; created_at: string } | null,
    finalContent: string
  ) => {
    if (!savedMessage) {
      return;
    }

    onConfirmMessage?.(tempId, {
      id: savedMessage.id,
      created_at: savedMessage.created_at,
      content: finalContent,
    });
  };

  const handleAIResponse = async (
    userMessage: string,
    currentRoom: Room,
    userMessageCreatedAt?: string
  ) => {
    const tempId = `ai-temp-${Date.now()}`;
    const tempCreatedAt = getNextMessageTimestamp(existingMessages, userMessageCreatedAt);
    const recentMessages = [
      ...existingMessages.filter((message) => !message.is_warning).slice(-5),
      {
        id: `local-user-${Date.now()}`,
        room_id: roomId,
        user_id: user?.id || '',
        content: userMessage,
        is_ai: false,
        created_at: tempCreatedAt,
      } satisfies Message,
    ];

    let aiResponse = '';
    let rafId: number | null = null;
    let pendingUpdate = false;

    try {
      onAddTempMessage?.({
        id: tempId,
        room_id: roomId,
        user_id: user?.id || '',
        content: '',
        is_ai: true,
        created_at: tempCreatedAt,
      });

      const requestMessages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: Array<{ type: 'text'; text: string }>;
      }> = recentMessages.map((message) => ({
        role: message.is_ai ? 'assistant' : 'user',
        content: [{ type: 'text', text: message.content }],
      }));

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      await sendStreamRequest({
        functionUrl: `${supabaseUrl}/functions/v1/chat-with-ai`,
        requestBody: {
          messages: requestMessages,
          roomId,
          useRoomBotPrompt: true,
        },
        supabaseAnonKey,
        authToken: accessToken,
        onData: (data) => {
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content || '';
            aiResponse += chunk;
            pendingUpdate = true;

            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                if (pendingUpdate) {
                  onUpdateMessage?.(tempId, aiResponse);
                }
                rafId = null;
                pendingUpdate = false;
              });
            }
          } catch (error) {
            console.warn('解析 AI 响应失败:', error);
          }
        },
        onComplete: async () => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }

          if (pendingUpdate) {
            onUpdateMessage?.(tempId, aiResponse);
          }

          if (aiResponse.trim()) {
            try {
              const savedMessage = await sendMessage(
                roomId,
                aiResponse,
                true,
                false,
                new Date().toISOString()
              );
              confirmPersistedMessage(tempId, savedMessage, aiResponse);
            } catch (error) {
              console.error('保存 AI 消息失败:', error);
            }
          } else {
            onDeleteMessage?.(tempId);
          }

          setAiGenerating(false);
        },
        onError: (error) => {
          console.error('AI 响应失败:', error);
          onDeleteMessage?.(tempId);
          toast.error(`${currentRoom.bot_name || 'AI'} 响应失败，请稍后重试`);
          setAiGenerating(false);
        },
      });
    } catch (error) {
      console.error('调用 AI 失败:', error);
      onDeleteMessage?.(tempId);
      toast.error(`${currentRoom.bot_name || 'AI'} 调用失败，请稍后重试`);
      setAiGenerating(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!content.trim()) {
      toast.error('消息内容不能为空');
      return;
    }

    if (content.length > 500) {
      toast.error('消息长度不能超过 500 字');
      return;
    }

    const messageContent = content.trim();
    setContent('');
    setSending(true);

    const localResult = localModeration(messageContent);
    if (!localResult.isPass) {
      sendWarningMessage(localResult.category || '敏感');
      setSending(false);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    let savedMessage: { id: string; created_at: string } | null = null;
    try {
      onAddTempMessage?.({
        id: tempId,
        room_id: roomId,
        user_id: user?.id || '',
        content: messageContent,
        is_ai: false,
        created_at: new Date().toISOString(),
        profile: profile || undefined,
      });

      savedMessage = await sendMessage(roomId, messageContent);
      confirmPersistedMessage(tempId, savedMessage, messageContent);
    } catch (error) {
      onDeleteMessage?.(tempId);
      toast.error(`发送失败: ${(error as Error).message}`);
      setSending(false);
      return;
    }

    void moderateContent(messageContent).then((result) => {
      if (!result.isSafe) {
        sendWarningMessage(result.violationType || '敏感', result.warningMessage);
      }
    });

    const botName = room?.bot_name;
    const isAtBot = Boolean(botName && messageContent.includes(`@${botName}`));
    if (room && isAtBot) {
      setAiGenerating(true);
      void handleAIResponse(messageContent, room, savedMessage?.created_at);
    }

    setSending(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event);
    }
  };

  const botName = room?.bot_name;
  const placeholderText = botName
    ? `输入消息，使用 @${botName} 可以触发机器人回复`
    : '输入消息，Enter 发送，Shift + Enter 换行';

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4">
      {aiGenerating && (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{botName || 'AI'} 正在回复...</span>
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          placeholder={placeholderText}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || aiGenerating}
          maxLength={500}
          className="min-h-[60px] max-h-[120px] resize-none"
        />
        <Button
          type="submit"
          disabled={sending || aiGenerating || !content.trim()}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-1 text-right text-xs text-muted-foreground">{content.length}/500</div>
    </form>
  );
}
