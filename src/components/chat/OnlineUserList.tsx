import { Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RoomMember } from '@/types/types';

interface OnlineUserListProps {
  members: RoomMember[];
  creatorId: string | null;
}

export function OnlineUserList({ members, creatorId }: OnlineUserListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4" />
          <span>在线用户 ({members.length})</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {members.map((member) => (
            <div
              key={member.id}
              className="px-3 py-2 rounded text-sm text-foreground hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>
                <span className="truncate">{member.profile?.username || '未知用户'}</span>
                {member.user_id === creatorId && (
                  <span className="text-xs text-muted-foreground">(创建者)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
