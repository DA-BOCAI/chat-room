# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 React + TypeScript + Supabase 的多人聊天室应用（秒哒），包含实时消息、AI 机器人集成、内容审核和消息摘要功能。

## 开发命令

```bash
# 安装依赖
npm i

# 启动开发服务器
npm run dev

# 运行所有检查（TypeScript + Biome + ast-grep + Tailwind）
npm run lint
```

注意：`npm run build` 被禁用，只能使用 `npm run lint` 进行检查。

## 技术栈

- **前端框架**: React 18 + TypeScript + Vite
- **样式**: Tailwind CSS + Radix UI 组件
- **后端**: Supabase（认证、数据库、实时订阅）
- **路由**: React Router 7
- **HTTP 客户端**: ky (支持 SSE 流式请求)
- **UI 反馈**: Sonner (Toast)

## 核心架构

### 路由结构
- `/register` - 用户注册
- `/login` - 用户登录
- `/lobby` - 聊天室大厅（房间列表）
- `/room/:roomId` - 聊天室页面

### 认证流程
- 使用 AuthContext (`src/contexts/AuthContext.tsx`) 管理认证状态
- 用户名登录：Supabase Auth 使用 `${username}@miaoda.com` 格式邮箱
- Session 存储在 `sessionStorage`（每个标签页可独立登录）
- RouteGuard 组件保护需要认证的路由

### 数据库层 (`src/db/`)
- `supabase.ts` - Supabase 客户端初始化，使用 sessionStorage 存储 session
- `api.ts` - 数据库操作函数（房间、成员、消息的 CRUD）

### 实时订阅
使用 Supabase Realtime 的 `postgres_changes` 订阅：
- 消息频道: `room-messages-${roomId}` - 监听新消息
- 成员频道: `room-members-${roomId}` - 监听成员变化
- 大厅订阅: `lobby-rooms` - 监听房间创建/删除/成员变化

### 聊天室功能 (`src/pages/ChatRoomPage.tsx`)
1. 进入房间时检查 `last_seen` 时间，离线超过1分钟生成消息摘要
2. 消息摘要通过 Supabase Edge Function `message-summary` 获取
3. 消息输入支持 @AI机器人 触发 AI 对话
4. 内容审核通过 Edge Function `content-moderation` 实现
5. 智能滚动：初始加载定位到底部，后续新消息根据用户位置智能滚动

### AI 集成 (`src/lib/sse.ts`)
- `sendStreamRequest` - 通过 SSE 调用 Edge Function `chat-with-ai`
- AI 响应流式返回并保存到数据库

### 组件结构
- `src/components/chat/` - 聊天室相关组件（MessageList, MessageInput, MessageSummary, OnlineUserList, RoomCard, CreateRoomDialog）
- `src/components/ui/` - 基于 Radix UI 的 shadcn 风格组件

## 环境变量

```
VITE_SUPABASE_URL - Supabase 项目 URL
VITE_SUPABASE_ANON_KEY - Supabase 匿名密钥
```

## 代码规范

- Biome 进行 TypeScript 检查和 linting
- ast-grep 规则检查 (`.rules/` 目录)
- Tailwind CSS 语法检查
- 使用 `// @ts-ignore` 绕过某些类型问题（AuthContext 中较常见）
