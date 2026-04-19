import { Streamdown } from 'streamdown';

interface MessageContentProps {
  content: string;
  streaming?: boolean;
  centered?: boolean;
}

export function MessageContent({
  content,
  streaming = false,
  centered = false,
}: MessageContentProps) {
  return (
    <div
      className={[
        'text-sm leading-6 break-words',
        centered ? 'text-center' : 'text-left',
        '[&_p]:my-0',
        '[&_p+p]:mt-3',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-current/20 [&_blockquote]:pl-3 [&_blockquote]:italic',
        '[&_a]:underline [&_a]:underline-offset-4',
        '[&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-black/10 [&_pre]:bg-black/5',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
        '[&_th]:border [&_th]:border-current/15 [&_th]:bg-black/5 [&_th]:px-2 [&_th]:py-1',
        '[&_td]:border [&_td]:border-current/15 [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-4 [&_hr]:border-current/15',
      ].join(' ')}
    >
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        parseIncompleteMarkdown={streaming}
        controls={false}
      >
        {content}
      </Streamdown>
    </div>
  );
}
