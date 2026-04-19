import { useEffect, useRef } from 'react';
import { Bot, ShieldAlert } from 'lucide-react';
import type { Message } from '@/types/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { MessageContent } from '@/components/chat/MessageContent';

// 移到组件外部作为纯函数，避免每次渲染重建
const formatTime = (dateString: string): string => {
  try {
    return format(new Date(dateString), 'HH:mm:ss', { locale: zhCN });
  } catch {
    return '';
  }
};

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  botName?: string;
}

export function MessageList({ messages, currentUserId, botName }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  useEffect(() => {
    if (scrollRef.current) {
      const isNewMessage = messages.length > prevMessagesLengthRef.current;
      const scrollContainer = scrollRef.current;
      
      // 1. 初始加载：定位到最新消息（底部）
      if (isInitialLoadRef.current && messages.length > 0) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        isInitialLoadRef.current = false;
      } 
      // 2. 后续更新：智能滚动
      else if (isNewMessage) {
        // 检查用户是否接近底部（阈值100px）
        const isAtBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
        
        // 获取最后一条消息
        const lastMessage = messages[messages.length - 1];
        // 如果是用户自己发送的消息，或者是原本就在底部，则滚动
        const isOwnMessage = lastMessage?.user_id === currentUserId && !lastMessage?.is_ai && !lastMessage?.is_warning;

        if (isAtBottom || isOwnMessage) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        // 如果用户在查看历史消息且新消息是监管提醒或他人消息，则不滚动，保持当前阅读位置
      }
      
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages, currentUserId]);

  return (
    <div 
      className="flex-1 overflow-y-auto p-4" 
      ref={scrollRef}
    >
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
            const isStreamingAI = Boolean(isAI && message.id.startsWith('ai-temp-'));
            
            // 监管警告消息居中显示
            if (isWarning) {
              return (
                <div key={message.id} data-message-id={message.id} className="flex justify-center">
                  <div className="max-w-[80%] flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>系统监管</span>
                      <span>{formatTime(message.created_at)}</span>
                    </div>
                    <div className="px-4 py-2 rounded border border-destructive/50 bg-destructive/10 text-destructive">
                      <MessageContent content={message.content} centered />
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div
                key={message.id}
                data-message-id={message.id}
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
                    <MessageContent content={message.content} streaming={isStreamingAI} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
