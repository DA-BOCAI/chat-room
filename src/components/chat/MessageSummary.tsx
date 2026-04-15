import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, ArrowDown } from 'lucide-react';

interface MessageSummaryProps {
  summary: string;
  unreadCount: number;
  onViewDetails: () => void;
  onClose: () => void;
}

export function MessageSummary({ summary, unreadCount, onViewDetails, onClose }: MessageSummaryProps) {
  return (
    <Card className="border-primary/20 bg-accent/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">未读消息摘要</CardTitle>
            <Badge variant="default" className="text-xs">
              {unreadCount}条未读
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {summary}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2"
          onClick={onViewDetails}
        >
          <ArrowDown className="h-4 w-4" />
          查看详情
        </Button>
      </CardContent>
    </Card>
  );
}
