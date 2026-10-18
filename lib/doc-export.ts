// Turns a plain-text resume or cover letter into a real .docx or .pdf file, with no
// libraries. Both use Times New Roman, 12pt for body text, with normal margins and spacing.
// Resume input: first line is the name, the next is contact details, lines in CAPITALS are
// section headings, "Job Title | Company" followed by "City, ST | Dates" is a job or school,
// and lines starting with "•", "-" or "*" are bullets. Pass letter = true for a cover letter.
// The output is built to be read correctly by application-form parsers: one column, no
// tables or tabs, real Word bullet lists, and each job as a title line followed by a
// "Company | City, ST | Dates" line, written in reading order.

type Kind = "name" | "contact" | "heading" | "role" | "bullet" | "body";
type Line = { text: string; kind: Kind; sub?: string };

function header(raw: string[]): Line[] {
  const out: Line[] = [];
  const first = raw.findIndex((t) => t);
  if (first < 0) return out;
  const name = raw[first];
  if (name.length < 60 && !/[.,:;]$/.test(name) && !/^dear\b/i.test(name)) {
    out.push({ text: name, kind: "name" });
    const next = raw.slice(first + 1).find((t) => t) ?? "";
    if (/@|\d{3}|linkedin|\|/i.test(next)) out.push({ text: tidy(next), kind: "contact" });
  }
  return out;
}

function parse(text: string, letter: boolean): Line[] {
  const raw = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const top = header(raw);
  let skip = top.length;
  const lines: Line[] = [...top];
  if (letter) {
    // Every non-blank line is its own paragraph; spacing between them comes from the layout.
    for (const t of raw) {
      if (!t) continue;
      if (skip > 0) { skip--; continue; }
      lines.push({ text: t, kind: "body" });
    }
    return lines;
  }
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t) continue;
    if (skip > 0) { skip--; continue; }
    const bullet = t.match(/^[•\-*·▪●]\s*(.*)$/);
    if (bullet) {
      lines.push({ text: bullet[1], kind: "bullet" });
      continue;
    }
    if (t.length < 60 && /[A-Z]/.test(t) && t === t.toUpperCase()) {
      lines.push({ text: t, kind: "heading" });
      continue;
    }
    const next = raw[i + 1] ?? "";
    if (t.includes("|") && next.includes("|") && !/^[•\-*·▪●]/.test(next)) {
      // "Title | Company" + "City | Dates" -> bold "Title", then "Company | City | Dates".
      const [title, ...org] = t.split("|").map((s) => s.trim()).filter(Boolean);
      const sub = [org.join(", "), ...next.split("|").map((s) => s.trim())].filter(Boolean).join(" | ");
      lines.push({ text: title, kind: "role", sub: tidy(sub) });
      i++;
      continue;
    }
    lines.push({ text: t, kind: "body" });
  }
  return lines;
}

// "Atlanta, GA   |   June 2024 -- May 2025" -> "Atlanta, GA | June 2024 – May 2025"
function tidy(s: string) {
  return s.replace(/\s*\|\s*/g, " | ").replace(/\s+(--|-|—)\s+/g, " – ").replace(/\s+/g, " ").trim();
}

// ---------- Layout ----------

// Page sizes in points (1/72 inch). Word uses twentieths of a point.
const PAGE_W = 612, PAGE_H = 792;
const BODY = 12, NAME = 16;
const LEAD = 13.8; // single spacing for 12pt Times New Roman
const BULLET_INDENT = 18;
// Space before each kind of line, in points.
const GAP = { heading: 12, headingAfter: 4, role: 7, contactAfter: 6, para: 12 };
type Style = { margin: number };
const RESUME: Style = { margin: 54 }; // 0.75 inch on every side
const LETTER: Style = { margin: 72 }; // 1 inch on every side
// Room left free at the bottom when checking fit, so Word (which measures slightly
// differently) also stays on one page.
const SAFETY = 14;

function fits(text: string) {
  return layoutPdf(text, false, RESUME, SAFETY).length === 1;
}

// A resume that is still too long after the AI shortened it loses its lowest bullets
// (from the job with the most bullets) until it fits. The layout itself never changes.
export function fitResume(text: string): { text: string; trimmed: boolean } {
  if (fits(text)) return { text, trimmed: false };
  const lines = text.replace(/\r/g, "").split("\n");
  for (let guard = 0; guard < 200 && !fits(lines.join("\n")); guard++) {
    const groups: number[][] = [];
    let cur: number[] | null = null;
    lines.forEach((l, i) => {
      if (/^\s*[•\-*·▪●]/.test(l)) {
        if (!cur) groups.push((cur = []));
        cur.push(i);
      } else if (l.trim()) cur = null;
    });
    const most = groups.reduce<number[] | null>((a, g) => (!a || g.length >= a.length ? g : a), null);
    if (most && most.length) {
      lines.splice(most[most.length - 1], 1);
      continue;
    }
    // No bullets left: drop the last phrase of the longest plain line.
    const long = lines.map((l, i) => [l.length, i] as const).filter(([n]) => n > 80).sort((a, b) => b[0] - a[0]);
    if (!long.length) break;
    const i = long[0][1];
    const cut = lines[i].replace(/\s*([.;•,][^.;•,]*)$/, "");
    if (cut.length >= lines[i].length) break;
    lines[i] = cut;
  }
  return { text: lines.join("\n"), trimmed: true };
}

// ---------- Fact check ----------

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/g, (_, m: string) => m)
    .replace(/\bsept\b/g, "sep")
    .replace(/\band\b/g, "&")
    .replace(/(\d)\.(?=\d)/g, "$1\u0001") // keep decimal points such as 3.8
    .replace(/[^a-z0-9&%\u0001 ]+/g, " ")
    .replace(/\u0001/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set("with from that this have into your their they them were been also over under about across using while where which through other more most than each such both able well very upon within".split(" "));
// The meaningful words of a line, roughly stemmed ("Created" and "creating" both become "creat").
function words(s: string) {
  return norm(s)
    .split(" ")
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w))
    .map((w) => w.replace(/(ings?|ed|es|s|ly|ion|ions|er|ers)$/, "").slice(0, 6));
}

// Compares a generated resume or cover letter with the user's own resume and returns a list
// of details that don't match it (an empty list means nothing was found). It checks that
// every job and school line (title, company, place, dates, GPA) comes from the same entry
// in the resume, and that every number is in the resume or the job posting.
export function checkFacts(doc: string, base: string, extra = "", letter = false): string[] {
  const issues: string[] = [];
  const nb = norm(base);
  const has = (s: string) => !norm(s) || nb.includes(norm(s));
  if (!letter) {
    // Each job or school in the resume, with the lines under it (honors, GPA, bullets).
    const baseRoles: { text: string; sub: string }[] = [];
    for (const l of parse(base, false)) {
      if (l.kind === "role") baseRoles.push({ text: l.text, sub: l.sub ?? "" });
      else if (l.kind === "heading") baseRoles.push({ text: "", sub: "" });
      else if (baseRoles.length) baseRoles[baseRoles.length - 1].sub += " " + l.text;
    }
    for (const r of parse(doc, false).filter((l) => l.kind === "role")) {
      const parts = (r.sub ?? "").split("|").map((s) => s.trim()).filter(Boolean);
      if (!has(r.text)) {
        issues.push(`"${r.text}" isn't a title in your resume.`);
        continue;
      }
      // The same title in the resume: its company, place and dates must match too.
      const same = baseRoles.filter((b) => b.text && (norm(b.text).includes(norm(r.text)) || norm(r.text).includes(norm(b.text))));
      for (const p of parts) {
        const inEntry = same.some((b) => norm(`${b.text} ${b.sub}`).includes(norm(p)));
        if (same.length ? !inEntry : !has(p)) issues.push(`"${r.text}": "${p}" doesn't match your resume.`);
      }
    }
    // Each bullet must describe what the resume says about that same job: most of its words
    // have to appear in that job's entry.
    let entry = "";
    for (const l of parse(doc, false)) {
      if (l.kind === "role") {
        const b = baseRoles.find((x) => x.text && (norm(x.text).includes(norm(l.text)) || norm(l.text).includes(norm(x.text))));
        entry = b ? `${b.text} ${b.sub}` : "";
      } else if (l.kind === "heading") entry = "";
      else if (l.kind === "bullet" && entry) {
        const known = new Set(words(entry));
        const own = words(l.text);
        const missing = own.filter((w) => !known.has(w));
        if (own.length >= 4 && missing.length / own.length > 0.5) {
          issues.push(`This bullet isn't backed by your resume for that job: "${l.text}"`);
        }
      }
    }
  }
  const allowed = norm(`${base} ${extra}`);
  const numbers = new Set(doc.match(/\d[\d,.]*\d%?|\d%?/g) ?? []);
  for (const n of numbers) {
    const clean = n.replace(/[.,]$/, "");
    if (!allowed.includes(norm(clean))) issues.push(`The number ${clean} isn't in your resume.`);
  }
  return issues;
}

// ---------- DOCX (a zip of a few XML files) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal zip writer (files stored uncompressed), which Word accepts.
function zip(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function makeDocx(input: string, letter = false): Uint8Array {
  const text = letter ? input : fitResume(input).text;
  const style = letter ? LETTER : RESUME;
  const tw = (pt: number) => Math.round(pt * 20);
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const run = (t: string, o: { bold?: boolean; size?: number } = {}) =>
    `<w:r><w:rPr>${font}${o.bold ? "<w:b/>" : ""}<w:sz w:val="${(o.size ?? BODY) * 2}"/><w:szCs w:val="${(o.size ?? BODY) * 2}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`;
  const spacing = (before: number, after: number) =>
    `<w:spacing w:before="${tw(before)}" w:after="${tw(after)}" w:line="240" w:lineRule="auto"/>`;
  const para = (inner: string, ppr: string) => `<w:p><w:pPr>${ppr}</w:pPr>${inner}</w:p>`;

  let prev: Kind | "" = "";
  const body = parse(text, letter)
    .map((l) => {
      const after = prev;
      prev = l.kind;
      switch (l.kind) {
        case "name":
          return para(run(l.text.toUpperCase(), { bold: true, size: NAME }), `${spacing(0, 2)}<w:jc w:val="center"/>`);
        case "contact":
          return para(run(l.text), `${spacing(0, letter ? 24 : GAP.contactAfter)}<w:jc w:val="center"/>`);
        case "heading":
          return para(
            run(l.text, { bold: true }),
            `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>${spacing(GAP.heading, GAP.headingAfter)}`,
          );
        case "role":
          return (
            para(run(l.text, { bold: true }), `<w:keepNext/>${spacing(after === "heading" ? 0 : GAP.role, 0)}`) +
            para(run(l.sub ?? ""), `<w:keepNext/>${spacing(0, 1)}`)
          );
        case "bullet":
          return para(
            run(l.text),
            `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>${spacing(0, 0)}<w:ind w:left="${tw(BULLET_INDENT)}" w:hanging="${tw(BULLET_INDENT)}"/>`,
          );
        default:
          return para(run(l.text), spacing(0, letter ? GAP.para : 0));
      }
    })
    .join("");
  const m = tw(style.margin);
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="${tw(PAGE_W)}" w:h="${tw(PAGE_H)}"/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="${BODY * 2}"/><w:szCs w:val="${BODY * 2}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  // A real bulleted list, so Word and application forms see list items, not typed symbols.
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${tw(BULLET_INDENT)}" w:hanging="${tw(BULLET_INDENT)}"/></w:pPr><w:rPr>${font}</w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;
  const enc = new TextEncoder();
  return zip([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
    { name: "word/document.xml", data: enc.encode(doc) },
    { name: "word/styles.xml", data: enc.encode(styles) },
    { name: "word/numbering.xml", data: enc.encode(numbering) },
  ]);
}

// ---------- PDF (Times, US Letter) ----------

// Glyph widths (per 1000 units) for characters 32-126.
const TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const TIMES_BOLD = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520];

// Characters outside ASCII that WinAnsi encoding can show, with their byte and width.
const WIN: Record<string, [number, number]> = {
  "•": [0x95, 350], "–": [0x96, 500], "—": [0x97, 1000], "‘": [0x91, 333], "’": [0x92, 333],
  "“": [0x93, 444], "”": [0x94, 444], "…": [0x85, 1000], "é": [0xe9, 444], "è": [0xe8, 444],
  "á": [0xe1, 444], "ñ": [0xf1, 500], "ó": [0xf3, 500], "ü": [0xfc, 500], "·": [0xb7, 250],
};

type Face = "R" | "B";

function width(s: string, size: number, face: Face = "R") {
  const table = face === "B" ? TIMES_BOLD : TIMES;
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? table[c - 32] : WIN[ch]?.[1] ?? 500;
  }
  return (w * size) / 1000;
}

function pdfString(s: string) {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (WIN[ch]) out += "\\" + WIN[ch][0].toString(8).padStart(3, "0");
    else out += "?";
  }
  return `(${out})`;
}

function wrap(text: string, size: number, max: number, face: Face = "R") {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(next, size, face) > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function layoutPdf(text: string, letter: boolean, style: Style, reserve = 0) {
  const margin = style.margin;
  const bottom = margin + reserve;
  const maxW = PAGE_W - 2 * margin;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_H - margin;
  let top = true; // no extra space at the top of a page
  const newPage = () => {
    pages.push(ops.join("\n"));
    ops = [];
    y = PAGE_H - margin;
    top = true;
  };
  const room = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const space = (h: number) => {
    if (!top) y -= h;
  };
  const fonts: Record<Face, string> = { R: "F1", B: "F2" };
  // Text is drawn in reading order (top to bottom, left to right) so it copies out cleanly.
  const draw = (s: string, x: number, size: number, face: Face, h: number) => {
    ops.push(`BT /${fonts[face]} ${size} Tf ${x.toFixed(2)} ${(y - size * 0.95).toFixed(2)} Td ${pdfString(s)} Tj ET`);
    y -= h;
    top = false;
  };
  const centered = (s: string, size: number, face: Face, h: number) =>
    draw(s, margin + (maxW - width(s, size, face)) / 2, size, face, h);

  let prev: Kind | "" = "";
  for (const l of parse(text, letter)) {
    const after = prev;
    prev = l.kind;
    switch (l.kind) {
      case "name":
        centered(l.text.toUpperCase(), NAME, "B", NAME * 1.2);
        break;
      case "contact":
        for (const s of wrap(l.text, BODY, maxW)) centered(s, BODY, "R", LEAD);
        y -= letter ? 24 : GAP.contactAfter;
        break;
      case "heading":
        space(GAP.heading);
        room(LEAD + GAP.headingAfter + 3 * LEAD); // keep the heading with what follows
        draw(l.text, margin, BODY, "B", LEAD);
        ops.push(`0 G 0.6 w ${margin} ${(y + 1.5).toFixed(2)} m ${PAGE_W - margin} ${(y + 1.5).toFixed(2)} l S`);
        y -= GAP.headingAfter;
        break;
      case "role": {
        if (after !== "heading") space(GAP.role);
        const title = wrap(l.text, BODY, maxW, "B");
        const sub = wrap(l.sub ?? "", BODY, maxW);
        room((title.length + sub.length + 1) * LEAD); // keep the job's first bullet with it
        for (const s of title) draw(s, margin, BODY, "B", LEAD);
        for (const s of sub) draw(s, margin, BODY, "R", LEAD);
        y -= 1;
        break;
      }
      case "bullet": {
        const parts = wrap(l.text, BODY, maxW - BULLET_INDENT);
        parts.forEach((s, i) => {
          room(LEAD);
          if (i === 0) ops.push(`BT /F1 ${BODY} Tf ${(margin + 4).toFixed(2)} ${(y - BODY * 0.95).toFixed(2)} Td ${pdfString("•")} Tj ET`);
          draw(s, margin + BULLET_INDENT, BODY, "R", LEAD);
        });
        break;
      }
      default:
        for (const s of wrap(l.text, BODY, maxW)) {
          room(LEAD);
          draw(s, margin, BODY, "R", LEAD);
        }
        if (letter) y -= GAP.para;
    }
  }
  pages.push(ops.join("\n"));
  return pages;
}

// How many pages it takes as written, before any trimming.
export function pageCount(text: string, letter = false) {
  return letter ? layoutPdf(text, true, LETTER).length : layoutPdf(text, false, RESUME, SAFETY).length;
}

export function makePdf(input: string, letter = false): Uint8Array {
  const text = letter ? input : fitResume(input).text;
  const pages = layoutPdf(text, letter, letter ? LETTER : RESUME);
  // Objects: 1 catalog, 2 pages, 3-4 fonts, 5 info, then a page and its content stream per page.
  const objs: string[] = [];
  const first = 6;
  const name = parse(text, letter).find((l) => l.kind === "name")?.text ?? "";
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${first + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>";
  objs[5] = `<< /Title ${pdfString(`${name}${name ? " - " : ""}${letter ? "Cover Letter" : "Resume"}`)} /Author ${pdfString(name)} >>`;
  pages.forEach((content, i) => {
    const id = first + i * 2;
    objs[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objs[id + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  // Every character written is a single byte, so string length equals byte length.
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
