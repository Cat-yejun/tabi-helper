import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// data URL(base64) 에서 media_type 과 순수 base64 데이터 분리
export function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/);
  if (!m) throw new Error("이미지 형식이 올바르지 않습니다 (data URL 필요)");
  return { mediaType: m[1], data: m[2] };
}

// 응답 텍스트에서 첫 JSON 객체를 안전하게 파싱 (코드펜스/잡설 제거)
export function extractJson<T>(text: string): T {
  let t = text.trim();
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const startArr = t.indexOf("[");
  const begin =
    startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
  if (begin === -1) throw new Error("JSON 을 찾지 못했습니다: " + text.slice(0, 200));
  const open = t[begin];
  const close = open === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  const slice = t.slice(begin, end + 1);
  return JSON.parse(slice) as T;
}

// 모든 text 블록을 합쳐 반환
export function joinText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}
