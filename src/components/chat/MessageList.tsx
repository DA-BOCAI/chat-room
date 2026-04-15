import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, ShieldAlert } from 'lucide-react';
import type { Message } from '@/types/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  botName?: string;
}

export function MessageList({ messages, currentUserId, botName }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 自动滚动到底部
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'HH:mm:ss', { locale: zhCN });
    } catch {
      return '';
    }
  };

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {botName ? (
              <div className="space-y-2">
                <p>暂无消息，发送第一条消息开始聊天吧</p>
                <p className="text-xs">💡 提示：使用 @{botName} 可以与AI助手对话</p>
              </div>
            ) : (
              <p>暂无消息，发送第一条消息开始聊天吧</p>
            )}
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.user_id === currentUserId;
            const isAI = message.is_ai;
            const isWarning = message.is_warning;
            
            // 监管警告消息居中显示
            if (isWarning) {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="max-w-[80%] flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>系统监管</span>
                      <span>{formatTime(message.created_at)}</span>
                    </div>
                    <div className="px-4 py-2 rounded border border-destructive/50 bg-destructive/10 text-destructive">
                      <p className="text-sm break-words whitespace-pre-wrap text-center">{message.content}</p>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div
                key={message.id}
                className={`flex ${isOwn && !isAI ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] ${isOwn && !isAI ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isAI && <Bot className="h-3.5 w-3.5 text-primary" />}
                    <span>{isAI ? botName : (message.profile?.username || '未知用户')}</span>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded border ${
                      isAI
                        ? 'bg-accent text-accent-foreground border-primary/20'
                        : isOwn
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-card-foreground border-border'
                    }`}
                  >
                    <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
