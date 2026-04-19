import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

interface RequestBody {
  messages: Message[];
  roomId?: string;
  useRoomBotPrompt?: boolean;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

async function verifyRoomMember(roomId: string, authorization: string | null): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabasePublic.auth.getUser(token);
  if (userError || !userData.user) {
    return null;
  }

  const { data: member } = await supabaseAdmin
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!member) {
    return null;
  }

  return userData.user.id;
}

async function buildMessagesWithRoomPrompt(roomId: string, messages: Message[]): Promise<Message[]> {
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('bot_prompt')
    .eq('id', roomId)
    .maybeSingle();

  const { data: config } = await supabaseAdmin
    .from('room_bot_configs')
    .select('bot_prompt')
    .eq('room_id', roomId)
    .maybeSingle();

  const effectivePrompt = config?.bot_prompt || room?.bot_prompt || '';
  if (!effectivePrompt) {
    return messages;
  }

  const systemMessage: Message = {
    role: 'system',
    content: [{ type: 'text', text: effectivePrompt }],
  };

  return [systemMessage, ...messages];
}

Deno.serve(async (req) => {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, roomId, useRoomBotPrompt }: RequestBody = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: '消息不能为空' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let finalMessages = messages;
    if (useRoomBotPrompt && roomId) {
      const userId = await verifyRoomMember(roomId, req.headers.get('Authorization'));
      if (!userId) {
        return new Response(
          JSON.stringify({ error: '无权访问该房间机器人' }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      finalMessages = await buildMessagesWithRoomPrompt(roomId, messages);
    }

    // 获取API密钥
    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API密钥未配置' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 调用文心一言API
    const apiUrl = 'https://app-aygkbmf3b8qp-api-k93RZBjPykEa-gateway.appmiaoda.com/v2/chat/completions';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: finalMessages,
        enable_thinking: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API错误:', errorData);
      return new Response(
        JSON.stringify({ 
          error: errorData.error?.message || '调用AI服务失败' 
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 流式返回响应
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ error: '无法读取响应流' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                // 转发SSE数据
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            }
          }
        } catch (error) {
          console.error('流处理错误:', error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Edge Function错误:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : '未知错误' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
