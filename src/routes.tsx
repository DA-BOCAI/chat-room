import type { ReactNode } from 'react';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import ChatRoomPage from './pages/ChatRoomPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: '注册',
    path: '/register',
    element: <RegisterPage />,
    public: true,
  },
  {
    name: '登录',
    path: '/login',
    element: <LoginPage />,
    public: true,
  },
  {
    name: '聊天室大厅',
    path: '/lobby',
    element: <LobbyPage />,
  },
  {
    name: '聊天室',
    path: '/room/:roomId',
    element: <ChatRoomPage />,
  },
];
