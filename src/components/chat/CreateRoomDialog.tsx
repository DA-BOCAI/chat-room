import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createRoom, joinRoom } from '@/db/api';
import { useNavigate } from 'react-router-dom';

export function CreateRoomDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('请输入房间名称');
      return;
    }

    if (type === 'private' && password.length < 4) {
      toast.error('私密房间密码不能少于4位');
      return;
    }

    setLoading(true);
    try {
      const room = await createRoom(name.trim(), type, type === 'private' ? password : undefined);
      await joinRoom(room.id);
      toast.success('房间创建成功');
      setOpen(false);
      setName('');
      setPassword('');
      setType('public');
      navigate(`/room/${room.id}`);
    } catch (error) {
      toast.error(`创建房间失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          创建房间
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建聊天室</DialogTitle>
          <DialogDescription>创建一个新的聊天室，邀请朋友一起聊天</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomName">房间名称</Label>
            <Input
              id="roomName"
              placeholder="请输入房间名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>房间类型</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as 'public' | 'private')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="public" disabled={loading} />
                <Label htmlFor="public" className="font-normal cursor-pointer">
                  公开房间（所有人可见并加入）
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" disabled={loading} />
                <Label htmlFor="private" className="font-normal cursor-pointer">
                  私密房间（需要密码才能加入）
                </Label>
              </div>
            </RadioGroup>
          </div>
          {type === 'private' && (
            <div className="space-y-2">
              <Label htmlFor="password">房间密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入房间密码（不少于4位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '创建中...' : '创建'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
