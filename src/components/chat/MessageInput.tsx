import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendMessage, getRoomMessages } from '@/db/api';
import { sendStreamRequest } from '@/lib/sse';
import { supabase } from '@/db/supabase';
import type { Room } from '@/types/types';

interface MessageInputProps {
  roomId: string;
  room: Room | null;
}

export function MessageInput({ roomId, room }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

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

    // 检查是否@了AI机器人
    const botName = room?.bot_name;
    const isAtBot = botName && content.includes(`@${botName}`);

    setSending(true);
    try {
      // 先发送用户消息
      await sendMessage(roomId, content);
      const userMessage = content;
      setContent('');

      // 如果@了机器人，调用AI
      if (isAtBot && room?.bot_prompt) {
        setAiGenerating(true);
        await handleAIResponse(userMessage, room);
      }
    } catch (error) {
      if ((error as Error).message.includes('网络')) {
        toast.error('网络连接异常，消息发送失败，请检查网络后重试');
      } else {
        toast.error(`发送失败: ${(error as Error).message}`);
      }
    } finally {
      setSending(false);
    }
  };

  const handleAIResponse = async (userMessage: string, room: Room) => {
    try {
      // 获取最近的聊天历史（用于上下文）
      const recentMessages = await getRoomMessages(roomId, 10);
      
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
        ...recentMessages.slice(-5).map(msg => {
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

      let aiResponse = '';
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
          } catch (e) {
            console.warn('解析AI响应失败:', e);
          }
        },
        onComplete: async () => {
          // AI响应完成后，保存到数据库
          if (aiResponse.trim()) {
            try {
              await sendMessage(roomId, aiResponse, true);
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
