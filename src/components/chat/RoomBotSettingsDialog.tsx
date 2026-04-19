import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { getRoomBotConfigForOwner, updateRoomBotConfig } from '@/db/api';

interface RoomBotSettingsDialogProps {
  roomId: string;
  currentBotName?: string;
  onUpdated?: (config: { botName: string; botPrompt: string }) => void;
}

export function RoomBotSettingsDialog({ roomId, currentBotName, onUpdated }: RoomBotSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botName, setBotName] = useState('');
  const [botPrompt, setBotPrompt] = useState('');

  useEffect(() => {
    if (!open) return;

    let canceled = false;
    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const config = await getRoomBotConfigForOwner(roomId);
        if (canceled) return;
        setBotName(config.bot_name || currentBotName || '');
        setBotPrompt(config.bot_prompt || '');
      } catch (error) {
        if (!canceled) {
          toast.error(`加载机器人配置失败: ${(error as Error).message}`);
          setOpen(false);
        }
      } finally {
        if (!canceled) {
          setLoadingConfig(false);
        }
      }
    };

    loadConfig();

    return () => {
      canceled = true;
    };
  }, [open, roomId, currentBotName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!botName.trim()) {
      toast.error('请输入机器人名称');
      return;
    }
    if (botName.trim().length > 20) {
      toast.error('机器人名称不能超过20个字符');
      return;
    }
    if (!botPrompt.trim()) {
      toast.error('请输入机器人提示词');
      return;
    }
    if (botPrompt.trim().length > 4000) {
      toast.error('机器人提示词不能超过4000个字符');
      return;
    }

    setSaving(true);
    try {
      const result = await updateRoomBotConfig(roomId, botName, botPrompt);
      onUpdated?.({
        botName: result.bot_name,
        botPrompt: result.bot_prompt,
      });
      toast.success('机器人配置已保存');
      setOpen(false);
    } catch (error) {
      toast.error(`保存失败: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bot className="h-4 w-4" />
          机器人设置
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>机器人设置</DialogTitle>
          <DialogDescription>
            只有房主可编辑机器人名称与提示词，成员可通过 @机器人名 进行对话。
          </DialogDescription>
        </DialogHeader>

        {loadingConfig ? (
          <div className="py-8 text-center text-sm text-muted-foreground">正在加载配置...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="botName">机器人名称</Label>
              <Input
                id="botName"
                placeholder="例如：旅行助手"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                disabled={saving}
                maxLength={20}
                required
              />
              <p className="text-xs text-muted-foreground">{botName.length}/20</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="botPrompt">机器人提示词（仅房主可见）</Label>
              <Textarea
                id="botPrompt"
                placeholder="请输入该机器人的角色设定、语气、边界和回答偏好..."
                value={botPrompt}
                onChange={(e) => setBotPrompt(e.target.value)}
                disabled={saving}
                className="min-h-[180px]"
                maxLength={4000}
                required
              />
              <p className="text-xs text-muted-foreground text-right">{botPrompt.length}/4000</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
