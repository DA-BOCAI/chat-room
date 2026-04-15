import { Lock, Users, Star, Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Room } from '@/types/types';

interface RoomCardProps {
  room: Room;
  onClick: () => void;
}

export function RoomCard({ room, onClick }: RoomCardProps) {
  return (
    <Card
      className="cursor-pointer border-border hover:border-primary transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {room.is_default && (
                <Star className="h-4 w-4 text-primary shrink-0" fill="currentColor" />
              )}
              <h3 className="font-semibold text-foreground truncate">{room.name}</h3>
              {room.type === 'private' && (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant={room.type === 'public' ? 'secondary' : 'outline'} className="text-xs">
                {room.type === 'public' ? '公开' : '私密'}
              </Badge>
              {room.is_default && (
                <Badge variant="default" className="text-xs">
                  官方
                </Badge>
              )}
              {room.bot_name && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  {room.bot_name}
                </Badge>
              )}
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>{room.member_count || 0}人在线</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
