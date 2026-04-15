import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { signUpWithUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证用户名
    if (!username.trim()) {
      toast.error('请输入用户名');
      return;
    }

    // 验证用户名格式（仅允许字母、数字和下划线）
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error('用户名只能包含字母、数字和下划线');
      return;
    }

    // 验证密码长度
    if (password.length < 6) {
      toast.error('密码长度不能少于6位');
      return;
    }

    // 验证密码一致性
    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }

    // 验证用户协议
    if (!agreed) {
      toast.error('请阅读并同意用户协议与隐私政策');
      return;
    }

    setLoading(true);
    const { error } = await signUpWithUsername(username, password);
    setLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('该用户名已存在，请更换');
      } else {
        toast.error(`注册失败: ${error.message}`);
      }
      return;
    }

    toast.success('注册成功，请登录');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">注册账号</CardTitle>
          <CardDescription>创建您的聊天室账号</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码（不少于6位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="agreement"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked as boolean)}
                disabled={loading}
              />
              <label
                htmlFor="agreement"
                className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                我已阅读并同意《用户协议》与《隐私政策》
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              已有账号？
              <Link to="/login" className="text-primary hover:underline ml-1">
                立即登录
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
