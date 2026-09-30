/** frontmatter 层：由 src/main.ts 在第 2 步机械拆出（逻辑未改，只加了 import/export）。 */
/** frontmatter 区间：ok = 有完整 --- 对；unterminated = 只有开始标记（写盘必须拒绝）。 */
export type FrontmatterSpan =
  | { state: "unterminated"; prefix: string; eol: string }
  | { state: "ok"; prefix: string; eol: string; closeEol: string | null; fmText: string; afterClose: number };

export function frontmatterSpan(content: unknown): FrontmatterSpan | null {
  const text = String(content === null || content === undefined ? "" : content);
  const head = text.match(/^((?:\uFEFF)?(?:[ \t]*\r?\n)*[ \t]*)---[ \t]*(\r?\n|$)/);
  if (!head) return null;
  const fmStart = head[0].length;
  const rest = text.slice(fmStart);
  const close = rest.match(/(?:^|\r?\n)[ \t]*---[ \t]*(?=\r?\n|$)/);
  if (!close) return { state: "unterminated", prefix: head[1], eol: head[2] || "\n" };
  const closeEol = close[0].startsWith("\r\n") ? "\r\n" : close[0].startsWith("\n") ? "\n" : null;
  return {
    state: "ok",
    prefix: head[1],
    eol: head[2] || "\n",
    closeEol,
    fmText: rest.slice(0, close.index ?? 0),
    afterClose: fmStart + (close.index ?? 0) + close[0].length,
  };
}

export function makeMD(fm: Record<string, unknown>, body?: string): string {
  const lines = ["---"];
  Object.keys(fm).forEach((key: any) => {
    if (fm[key] !== undefined && fm[key] !== null) lines.push(key + ": " + yamlValue(fm[key]));
  });
  /* 正文开头的空行要去掉：parseFM 只剥掉 `---` 后的一个换行，正文若以换行开头， makeMD→parseFM 每往返一次就会多出一个空行。写入端做规范化，读取端保持忠实。 */ lines.push(
    "---",
    "",
    (body || "").replace(/^\r?\n+/, "").trimEnd(),
    "",
  );
  return lines.join("\n");
}

export function parseFM(content: unknown): { data: Record<string, unknown>; body: string } {
  const text = String(content === null || content === undefined ? "" : content);
  const span = frontmatterSpan(text);
  if (!span || span.state !== "ok") return { data: {}, body: text };
  const data: Record<string, unknown> = {};
  const lines = span.fmText === "" ? [] : span.fmText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([^:#][^:]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const raw = match[2].trim();
    if (raw === "") {
      const items: unknown[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && /^\s+-\s*/.test(lines[cursor])) {
        items.push(parseFMValue(lines[cursor].replace(/^\s+-\s*/, "")));
        cursor += 1;
      }
      data[key] = items.length ? items : "";
      index = cursor - 1;
      continue;
    }
    data[key] = parseFMValue(raw);
  }
  return { data, body: text.slice(span.afterClose).replace(/^\r?\n/, "") };
}

export function parseFMValue(raw: unknown): unknown {
  const value = String(raw).trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch (error: any) {
    return value.replace(/^['"]|['"]$/g, "");
  }
}
/**
 * frontmatter 区间探测：容忍 UTF-8 BOM 与 `---` 之前的空白行（外部工具导入、Git 检出、OneDrive 同步
 * 都可能产生这两种写法）。旧实现用 `startsWith("---")` 判定，遇到它们会把整份文件（含 frontmatter）
 * 当成正文 —— 一旦进入覆写路径就等于把 YAML 降级成文本。
 * 返回 null = 顶部根本没有 frontmatter；state = "unterminated" = 有开头分隔符但缺闭合分隔符（结构已损坏）。
 */
/** 选出行尾：优先沿用 frontmatter 正文自身占多数的写法，全无换行时退回落入参。
 *  混行尾的文件（例如开头行 CRLF、内部行 LF）只有按段沿用才能做到字节级不变。 */

export function pickEol(text: any, fallback: any) {
  const crlf = (String(text).match(/\r\n/g) || []).length;
  const lf = (String(text).match(/\n/g) || []).length - crlf;
  if (crlf > lf) return "\r\n";
  if (lf > 0) return "\n";
  return fallback;
}

import { expectedError } from "./dom";

export function text(value: unknown, fallback?: string | number): string {
  if (Array.isArray(value)) return value.join("、") || String(fallback || "—");
  return value === undefined || value === null || value === "" ? String(fallback || "—") : String(value);
}
/** 让插件写出来的 frontmatter 和手写的一模一样：只有 YAML 会误解的值才加引号。
 *  旧实现对所有字符串一律 JSON.stringify，于是 status: active 会变成 status: "active"，
 *  用户的 frontmatter 每被插件碰一下就多一层引号。日期仍然加引号 —— 不加会被 YAML
 *  解析成 Date 对象，同一个字段在库里就会出现字符串/日期两种运行时类型。 */

export function writeFM(content: unknown, patch: Record<string, unknown>, removeKeys: string[] = []): string {
  const text = String(content === null || content === undefined ? "" : content);
  const span = frontmatterSpan(text);
  if (!span || span.state !== "ok") {
    /* 有开头分隔符却没有闭合分隔符：结构已损坏。旧实现会把整份文件（含原 frontmatter）当成正文
       再套一层新 frontmatter，等于把 YAML 降级成文本；这里改为拒绝写入，由调用方提示用户先修笔记。 */
    if (span) throw expectedError("这篇笔记的 frontmatter 缺少闭合的 ---，已取消写入以免破坏内容。");
    const parsed = parseFM(text);
    return makeMD(Object.assign({}, parsed.data, patch), parsed.body);
  }
  const lines = span.fmText === "" ? [] : span.fmText.split(/\r?\n/);
  (removeKeys || []).forEach((key: any) => {
    const keyPattern = new RegExp("^" + key + "\\s*:");
    const index = lines.findIndex((line: any) => keyPattern.test(line));
    if (index < 0) return;
    let endIndex = index + 1;
    while (endIndex < lines.length && (/^\s/.test(lines[endIndex]) || lines[endIndex] === "")) endIndex++;
    lines.splice(index, endIndex - index);
  });
  Object.keys(patch).forEach((key: any) => {
    const keyPattern = new RegExp("^" + key + "\\s*:");
    const index = lines.findIndex((line: any) => keyPattern.test(line));
    const serialized = key + ": " + yamlValue(patch[key]);
    if (index < 0) {
      lines.push(serialized);
      return;
    }
    let endIndex = index + 1;
    while (endIndex < lines.length && (/^\s/.test(lines[endIndex]) || lines[endIndex] === "")) endIndex++;
    lines.splice(index, endIndex - index, serialized);
  });
  /* 保留 BOM 与 `---` 之前的空白行；行尾按段沿用原文（开头行 / 正文 / 闭合行各自保留），
     这样即使文件本身是混行尾，没有改动的行也一个字节都不会变。 */
  const bodyEol = pickEol(span.fmText, span.eol);
  const closing = span.closeEol || bodyEol;
  const block =
    lines.length === 0
      ? span.prefix + "---" + span.eol + "---"
      : span.prefix + "---" + span.eol + lines.join(bodyEol) + closing + "---";
  return block + text.slice(span.afterClose);
}

export function yamlScalar(text: any) {
  const raw = String(text);
  if (raw === "") return '""';
  if (/^\s|\s$/.test(raw)) return JSON.stringify(raw);
  if (/[\n\r\t]/.test(raw)) return JSON.stringify(raw);
  /* 以 YAML 指示符开头（- ? : , [ ] { } # & * ! | > ' " % @ `）必须加引号 */
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(raw)) return JSON.stringify(raw);
  if (/[:#]\s|[:#]$/.test(raw)) return JSON.stringify(raw);
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(raw)) return JSON.stringify(raw);
  if (/^[-+]?(\d+(\.\d+)?|\.\d+)(e[-+]?\d+)?$/i.test(raw)) return JSON.stringify(raw);
  /* 日期/时间保持字符串，避免 Obsidian 把它读成 Date */
  if (/^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$/.test(raw)) return JSON.stringify(raw);
  return raw;
}

export function yamlValue(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return yamlScalar(String(value));
}
