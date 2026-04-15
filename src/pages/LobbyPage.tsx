import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { getRooms, joinRoom, leaveAllRooms } from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Room } from '@/types/types';
import { RoomCard } from '@/components/chat/RoomCard';
import { CreateRoomDialog } from '@/components/chat/CreateRoomDialog';
import { RoomPasswordDialog } from '@/components/chat/RoomPasswordDialog';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; roomId: string; roomName: string }>({
    open: false,
    roomId: '',
    roomName: '',
  });

  const loadRooms = async () => {
    const data = await getRooms();
    // 过滤掉可能的无效房间（双重保险）
    const validRooms = data.filter(room => room.id && room.name);
    // 将默认房间置顶，按创建时间排序
    const sortedRooms = validRooms.sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setRooms(sortedRooms);
    setLoading(false);
  };

  useEffect(() => {
    // 进入大厅时，退出所有房间（确保用户不占用房间席位）
    leaveAllRooms().then(() => {
      loadRooms();
    });

    // 订阅房间变化
    const channel = supabase
      .channel('lobby-rooms')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rooms',
        },
        () => {
          loadRooms();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
        },
        () => {
          loadRooms();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rooms',
        },
        (payload) => {
          // 立即从本地状态中移除已删除的房间
          setRooms(prevRooms => prevRooms.filter(room => room.id !== payload.old.id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
        },
        () => {
          loadRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRoomClick = async (room: Room) => {
    if (room.type === 'private') {
      setPasswordDialog({
        open: true,
        roomId: room.id,
        roomName: room.name,
      });
    } else {
      try {
        await joinRoom(room.id);
        navigate(`/room/${room.id}`);
      } catch (error) {
        toast.error(`加入房间失败: ${(error as Error).message}`);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('已退出登录');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">多人聊天室</h1>
            <p className="text-sm text-muted-foreground">欢迎，{profile?.username}</p>
          </div>
          <div className="flex items-center gap-3">
            <CreateRoomDialog />
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      {/* 房间列表 */}
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">聊天室大厅</h2>
          <p className="text-sm text-muted-foreground">选择一个房间开始聊天</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">暂无聊天室</p>
            <p className="text-sm text-muted-foreground">点击「创建房间」按钮创建第一个聊天室</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
            ))}
          </div>
        )}
      </main>

      {/* 密码输入对话框 */}
      <RoomPasswordDialog
        open={passwordDialog.open}
        onOpenChange={(open) => setPasswordDialog({ ...passwordDialog, open })}
        roomId={passwordDialog.roomId}
        roomName={passwordDialog.roomName}
      />
    </div>
  );
}
