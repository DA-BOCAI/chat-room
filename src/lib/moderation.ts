// 本地敏感词快速过滤层 - 零延迟预检
// 减少不必要的 API 调用

const LOCAL_BLOCKWORDS = [
  // 政治敏感 (示例关键词，实际需要根据业务调整)
  '政治敏感词1',
  '政治敏感词2',
  // 暴力相关
  '暴力',
  '杀人',
  // 色情相关
  '色情',
  '色情网站',
  // 违法相关
  '赌博',
  '毒品',
  // 骚扰歧视
  '歧视',
  '辱骂',
  // 其他常见违规
  '诈骗',
];

export interface LocalModerationResult {
  isPass: boolean;
  matchedWords?: string[];
  category?: string;
}

export function localModeration(content: string): LocalModerationResult {
  const lowerContent = content.toLowerCase();

  for (const word of LOCAL_BLOCKWORDS) {
    if (lowerContent.includes(word.toLowerCase())) {
      return {
        isPass: false,
        matchedWords: [word],
        category: '敏感词'
      };
    }
  }

  return { isPass: true };
}
