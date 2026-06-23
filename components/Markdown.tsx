"use client";

import React from "react";

// 외부 라이브러리 없이 자주 쓰는 마크다운만 가볍게 렌더링
// (굵게 **bold**, 기울임 *it*, 인라인 코드 `code`, - 목록, 1. 목록, 줄바꿈)
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **bold** / *italic* / `code` 를 토큰으로 분리
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex);
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith("**") && p.endsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-${i}`}>{p.slice(2, -2)}</strong>);
    } else if (p.startsWith("`") && p.endsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-${i}`} className="rounded bg-line/60 px-1 py-0.5 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    } else if (p.startsWith("*") && p.endsWith("*")) {
      nodes.push(<em key={`${keyPrefix}-${i}`}>{p.slice(1, -1)}</em>);
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-${i}`}>{p}</React.Fragment>);
    }
  });
  return nodes;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={key} className={`my-1 ${list.ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
        {list.items.map((it, i) => (
          <li key={i}>{renderInline(it, `${key}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    // 제목(#) 은 굵은 한 줄로 단순화
    const heading = line.match(/^#{1,6}\s+(.*)$/);

    if (ul) {
      if (!list || list.ordered) flushList(`list-${idx}`);
      list = list || { ordered: false, items: [] };
      list.items.push(ul[1]);
    } else if (ol) {
      if (!list || !list.ordered) flushList(`list-${idx}`);
      list = list || { ordered: true, items: [] };
      list.items.push(ol[1]);
    } else {
      flushList(`list-${idx}`);
      if (heading) {
        blocks.push(<p key={idx} className="mt-1 font-bold text-ink">{renderInline(heading[1], `h-${idx}`)}</p>);
      } else if (line.trim() === "") {
        blocks.push(<div key={idx} className="h-2" />);
      } else {
        blocks.push(<p key={idx}>{renderInline(line, `p-${idx}`)}</p>);
      }
    }
  });
  flushList("list-end");

  return <div className="space-y-0.5 leading-relaxed">{blocks}</div>;
}
