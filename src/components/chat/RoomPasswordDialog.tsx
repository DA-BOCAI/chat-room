import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { verifyRoomPassword, joinRoom } from '@/db/api';
import { useNavigate } from 'react-router-dom';

interface RoomPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
}

export function RoomPasswordDialog({ open, onOpenChange, roomId, roomName }: RoomPasswordDialogProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error('请输入房间密码');
      return;
    }

    setLoading(true);
    try {
      const isValid = await verifyRoomPassword(roomId, password);
      if (!isValid) {
        toast.error('房间密码错误，请重新输入');
        setLoading(false);
        return;
      }

      await joinRoom(roomId);
      toast.success('加入房间成功');
      onOpenChange(false);
      setPassword('');
      navigate(`/room/${roomId}`);
    } catch (error) {
      toast.error(`加入房间失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>输入房间密码</DialogTitle>
          <DialogDescription>
            房间「{roomName}」是私密房间，请输入密码加入
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">房间密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="请输入房间密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setPassword('');
              }}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '验证中...' : '加入'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
