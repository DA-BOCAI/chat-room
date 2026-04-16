import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendMessage } from '@/db/api';
import { sendStreamRequest } from '@/lib/sse';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { localModeration } from '@/lib/moderation';
import type { Room, ModerationResult, Message } from '@/types/types';

interface MessageInputProps {
  roomId: string;
  room: Room | null;
  existingMessages?: Message[];
  onUpdateMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onAddTempMessage?: (message: Message) => void;
}

export function MessageInput({ roomId, room, existingMessages = [], onUpdateMessage, onDeleteMessage, onAddTempMessage }: MessageInputProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // 内容审核
  const moderateContent = async (content: string): Promise<ModerationResult> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          roomId,
          userId: user?.id
        })
      });

      if (!response.ok) {
        console.error('内容审核失败:', response.statusText);
        return { isSafe: true }; // 审核失败时默认允许
      }

      const result: ModerationResult = await response.json();
      return result;
    } catch (error) {
      console.error('调用审核API失败:', error);
      return { isSafe: true }; // 出错时默认允许
    }
  };

  // 发送监管警告消息（仅通知触发者本人）
  const sendWarningMessage = (violationType: string, warningMessage?: string) => {
    const warningText = `⚠️ 系统监管提醒：检测到您的消息包含${violationType}内容，请注意文明用语，遵守社区规范。${warningMessage ? `（${warningMessage}）` : ''}`;
    toast.error(warningText, {
      duration: 5000,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error('消息内容不能为空');
      return;
    }

    if (content.length > 500) {
      toast.error('消息长度不能超过500字');
      return;
    }

    const messageContent = content.trim();
    setContent('');
    setSending(true);

    // 1. 先进行本地敏感词快速过滤
    const localResult = localModeration(messageContent);
    if (!localResult.isPass) {
      sendWarningMessage(localResult.category || '敏感词');
      setSending(false);
      return;
    }

    // 2. 立即发送消息（乐观更新），后台异步审核
    let tempId: string | null = null;
    try {
      tempId = `temp-${Date.now()}`;
      if (onAddTempMessage) {
        onAddTempMessage({
          id: tempId,
          room_id: roomId,
          user_id: user?.id || '',
          content: messageContent,
          is_ai: false,
          created_at: new Date().toISOString(),
        });
      }

      await sendMessage(roomId, messageContent);
    } catch (error) {
      // 发送失败，移除临时消息
      if (tempId && onDeleteMessage) {
        onDeleteMessage(tempId);
      }
      toast.error(`发送失败: ${(error as Error).message}`);
      setSending(false);
      return;
    }

    // 3. 后台异步审核（fire-and-forget），不阻塞 UI
    moderateContent(messageContent).then(result => {
      if (!result.isSafe) {
        // 审核不通过：发送警告消息（消息已发送，通过实时订阅 DELETE 事件自动从 UI 移除）
        sendWarningMessage(
          result.violationType || '敏感',
          result.warningMessage
        );
      }
    });

    // 检查是否@了AI机器人
    const botName = room?.bot_name;
    const isAtBot = botName && messageContent.includes(`@${botName}`);

    // 如果@了机器人，调用AI
    if (isAtBot && room?.bot_prompt) {
      setAiGenerating(true);
      handleAIResponse(messageContent, room);
    }

    setSending(false);
  };

  const handleAIResponse = async (userMessage: string, room: Room) => {
    // 生成临时 ID 用于流式更新
    const tempId = `ai-temp-${Date.now()}`;
    let aiResponse = '';
    let rafId: number | null = null;
    let pendingUpdate = false;

    try {
      // 添加临时 AI 消息到列表
      if (onAddTempMessage) {
        onAddTempMessage({
          id: tempId,
          room_id: roomId,
          user_id: user?.id || '',
          content: '',
          is_ai: true,
          created_at: new Date().toISOString(),
        });
      }

      // 复用已有消息历史（不重新查询）
    const recentMessages = existingMessages.slice(-5);

      // 构建消息历史
      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: Array<{ type: 'text'; text: string }>;
      }> = [
        {
          role: 'system',
          content: [{ type: 'text', text: room.bot_prompt || '' }]
        },
        // 添加最近的对话历史
        ...recentMessages.map(msg => {
          const msgRole: 'system' | 'user' | 'assistant' = msg.is_ai ? 'assistant' : 'user';
          return {
            role: msgRole,
            content: [{ type: 'text' as const, text: msg.content }]
          };
        }),
        // 添加当前用户消息
        {
          role: 'user',
          content: [{ type: 'text' as const, text: userMessage }]
        }
      ];

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      await sendStreamRequest({
        functionUrl: `${supabaseUrl}/functions/v1/chat-with-ai`,
        requestBody: {
          messages,
          roomId
        },
        supabaseAnonKey,
        onData: (data) => {
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content || '';
            aiResponse += chunk;
            pendingUpdate = true;

            // 使用 requestAnimationFrame 节流
            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                if (pendingUpdate && onUpdateMessage) {
                  onUpdateMessage(tempId, aiResponse);
                }
                rafId = null;
                pendingUpdate = false;
              });
            }
          } catch (e) {
            console.warn('解析AI响应失败:', e);
          }
        },
        onComplete: async () => {
          // 取消任何待处理的动画帧
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }
          // 如果还有待更新内容，先更新一次
          if (pendingUpdate && onUpdateMessage) {
            onUpdateMessage(tempId, aiResponse);
          }
          // AI响应完成后，在保存到数据库的时刻生成时间戳
          const aiCreatedAt = new Date().toISOString();
          if (aiResponse.trim()) {
            try {
              await sendMessage(roomId, aiResponse, true, false, aiCreatedAt);
            } catch (error) {
              console.error('保存AI消息失败:', error);
            }
          }
          setAiGenerating(false);
        },
        onError: (error) => {
          console.error('AI响应失败:', error);
          toast.error('AI响应失败，请稍后重试');
          setAiGenerating(false);
        }
      });
    } catch (error) {
      console.error('调用AI失败:', error);
      toast.error('调用AI失败，请稍后重试');
      setAiGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const botName = room?.bot_name;
  const placeholderText = botName 
    ? `输入消息内容（@${botName} 可以与AI对话，按Enter发送）` 
    : '输入消息内容（按Enter发送，Shift+Enter换行）';

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4">
      {aiGenerating && (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{botName}正在思考中...</span>
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          placeholder={placeholderText}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || aiGenerating}
          maxLength={500}
          className="min-h-[60px] max-h-[120px] resize-none"
        />
        <Button type="submit" disabled={sending || aiGenerating || !content.trim()} className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mt-1 text-right">
        {content.length}/500
      </div>
    </form>
  );
}
