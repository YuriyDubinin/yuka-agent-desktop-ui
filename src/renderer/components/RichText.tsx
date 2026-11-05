import { Fragment, type ReactNode, useState } from 'react';

interface RichTextProps {
  text: string;
  /** Wrap words so each new one materialises (blur → sharp) as it streams in. */
  animate?: boolean;
  /** Stagger the reveal of text that arrives all at once (e.g. the greeting). */
  stagger?: boolean;
}

const MAX_STAGGER_MS = 1100;
const STAGGER_STEP_MS = 16;

/**
 * Lightweight formatter for model output: ``` fenced blocks, `inline code` and **bold**.
 * Tolerates unfinished markup while the reply is still streaming. Keys are positional, so
 * appending text only mounts – and animates – the new words.
 */
export function RichText({ text, animate = false, stagger = false }: RichTextProps) {
  return <>{buildNodes(text, animate, stagger)}</>;
}

function buildNodes(text: string, animate: boolean, stagger: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split('```');
  let wordIndex = 0;

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];

    if (partIndex % 2 === 1) {
      const language = part.match(/^([\w+-]+)\n/)?.[1] ?? '';
      const body = part.replace(/^[\w+-]*\n/, '').replace(/\n$/, '');
      nodes.push(<CodeBlock key={`c${partIndex}`} code={body} language={language} />);
      continue;
    }

    // Line breaks right next to a code block would add empty lines under pre-wrap.
    let prose = part;
    if (partIndex > 0) prose = prose.replace(/^\n+/, '');
    if (partIndex < parts.length - 1) prose = prose.replace(/\n+$/, '');

    const tokens = prose.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\s+)/g).filter(Boolean);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex];
      const key = `${partIndex}-${tokenIndex}`;

      if (/^\s+$/.test(token)) {
        nodes.push(<Fragment key={key}>{token}</Fragment>);
        continue;
      }
      if (!animate) {
        nodes.push(<Fragment key={key}>{renderInline(token)}</Fragment>);
        continue;
      }

      const delay = stagger ? Math.min(wordIndex * STAGGER_STEP_MS, MAX_STAGGER_MS) : 0;
      wordIndex += 1;
      nodes.push(
        <span key={key} className="w" style={delay ? { animationDelay: `${delay}ms` } : undefined}>
          {renderInline(token)}
        </span>,
      );
    }
  }
  return nodes;
}

function renderInline(token: string): ReactNode {
  if (token.length > 2 && token.startsWith('`') && token.endsWith('`')) {
    return <code className="inline-code">{token.slice(1, -1)}</code>;
  }
  if (token.length > 4 && token.startsWith('**') && token.endsWith('**')) {
    return <strong>{token.slice(2, -2)}</strong>;
  }
  return token;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <figure className="code">
      <figcaption className="code__bar">
        <span className="code__lang">{language || 'code'}</span>
        <button
          type="button"
          className={`code__copy${copied ? ' is-done' : ''}`}
          onClick={onCopy}
          aria-label={copied ? 'Скопировано' : 'Копировать код'}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <g className="code__copy-icon">
              <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
              <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
            </g>
            <path className="code__check" d="M5 12.5l4.2 4.2L19 7" />
          </svg>
          <span>{copied ? 'скопировано' : 'копировать'}</span>
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
