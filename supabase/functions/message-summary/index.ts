import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Message {
  content: string;
  username: string;
  created_at: string;
}

interface RequestBody {
  roomId: string;
  userId: string;
  lastSeen: string;
}

Deno.serve(async (req) => {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomId, userId, lastSeen }: RequestBody = await req.json();

    if (!roomId || !userId || !lastSeen) {
      return new Response(
        JSON.stringify({ error: '参数不完整' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 初始化Supabase客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 获取用户离线期间的消息
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select(`
        content,
        created_at,
        profile:profiles(username)
      `)
      .eq('room_id', roomId)
      .gt('created_at', lastSeen)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('获取消息失败:', messagesError);
      return new Response(
        JSON.stringify({ error: '获取消息失败' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 如果没有未读消息，直接返回
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ 
          summary: '',
          unreadCount: 0,
          hasUnread: false
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 构建消息文本
    const messageTexts = messages.map((msg: any) => {
      const username = msg.profile?.username || '未知用户';
      return `${username}: ${msg.content}`;
    }).join('\n');

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

    // 使用AI生成摘要
    const summaryPrompt = `你是一个聊天记录总结助手。请对以下聊天记录进行智能摘要，要求：
1. 提炼核心讨论主题、关键结论或行动项
2. 保持客观中立，准确反映对话内容
3. 语言简洁明了，控制在3-5句话内
4. 如果有多个主题，分点列出

聊天记录（共${messages.length}条消息）：
${messageTexts}

请直接输出摘要内容，不要添加"摘要："等前缀。`;

    const apiUrl = 'https://app-aygkbmf3b8qp-api-k93RZBjPykEa-gateway.appmiaoda.com/v2/chat/completions';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: summaryPrompt }]
          }
        ],
        enable_thinking: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('AI总结API错误:', errorData);
      return new Response(
        JSON.stringify({ 
          error: 'AI总结服务暂时不可用',
          unreadCount: messages.length,
          hasUnread: true
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 读取流式响应
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ 
          error: '无法读取响应流',
          unreadCount: messages.length,
          hasUnread: true
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const decoder = new TextDecoder();
    let summaryText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            summaryText += content;
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        summary: summaryText.trim(),
        unreadCount: messages.length,
        hasUnread: true,
        firstUnreadTime: messages[0].created_at
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

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
