# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

- **前端框架**: React 18 + TypeScript + Vite (使用 rolldown-vite)
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
- **Session 存储在 `sessionStorage`**（每个标签页可独立登录，这是核心设计）
- RouteGuard 组件保护需要认证的路由

### 数据库层 (`src/db/`)
- `supabase.ts` - Supabase 客户端初始化，使用 sessionStorage 存储 session
- `api.ts` - 数据库操作函数（房间、成员、消息的 CRUD）

### 实时订阅 (ChatRoomPage.tsx)
使用 Supabase Realtime 的 `postgres_changes` 订阅，有三个独立频道：
1. **消息频道** (`room-messages-${roomId}`) - 监听 INSERT/DELETE 事件，支持临时消息替换和二分查找优化插入
2. **成员频道** (`room-members-${roomId}`) - 监听 INSERT/UPDATE/DELETE 事件，UPDATE 用于 last_seen 离线状态
3. **房间频道** (`room-${roomId}`) - 监听房间删除事件

**智能滚动**: 使用 `useRef` 追踪用户滚动位置，当用户在看历史消息时不自动滚动，新消息仅在用户位于底部时才自动滚动。

**Profile 缓存**: 使用 `Map<userId, Profile>` 缓存，避免重复查询 profile 表。

### AI 集成
- **Edge Function** (`supabase/functions/chat-with-ai/index.ts`) - 调用文心一言 API，流式返回 AI 响应
- **SSE 封装** (`src/lib/sse.ts`) - `sendStreamRequest` 函数处理 SSE 流式请求

**@AI 机器人交互** (MessageInput.tsx):
1. 用户输入包含 `@AI` 时，触发 AI 对话模式
2. 创建临时消息（`id: ai-temp-${timestamp}`）用于流式显示 AI 响应
3. 收到 AI 响应后替换临时消息为真实消息

### 内容审核 (双层机制)
1. **本地审核** (`src/lib/moderation.ts`) - `localModeration` 函数，使用敏感词列表快速过滤
2. **云端审核** - 调用 Edge Function `content-moderation` 进行深度审核

**审核流程**: 本地敏感词过滤 → 乐观发送消息 → 后台异步云端审核 → 审核失败则删除消息并发送警告

### 消息摘要 (离线召回)
当用户重新进入房间时：
1. 检查 `last_seen` 时间戳或 sessionStorage 中存储的离开时间
2. 获取离线期间的所有消息
3. 调用 `message-summary` Edge Function 生成 AI 摘要
4. 显示摘要面板，用户可点击跳转至未读消息位置

**离开时间存储**: `sessionStorage.setItem(`last_left_${roomId}`, timestamp)` 确保标签页关闭后仍能恢复

### 大厅实时订阅 (LobbyPage.tsx)
- 订阅 `lobby-rooms` 频道监听房间的 INSERT/UPDATE/DELETE 事件
- 订阅 `room_members` 表的 `*` 事件监听成员变化，触发在线人数更新
- 进入大厅时调用 `leaveAllRooms()` 退出所有房间

## 环境变量

```
VITE_SUPABASE_URL - Supabase 项目 URL
VITE_SUPABASE_ANON_KEY - Supabase 匿名密钥
```

## Edge Functions (supabase/functions/)
- `chat-with-ai` - AI 对话（调用文心一言 API）
- `message-summary` - 生成聊天摘要
- `content-moderation` - 内容审核

## 代码规范

- Biome 进行 TypeScript 检查和 linting
- ast-grep 规则检查 (`.rules/` 目录)
- Tailwind CSS 语法检查
- 使用 `// @ts-ignore` 绕过某些类型问题（AuthContext 中较常见）
