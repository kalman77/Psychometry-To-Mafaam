/* The smallest .docx Word will open: a content-type map, one relationship and
 * the document itself.
 *
 * Every paragraph is marked bidi and every run rtl, because an essay written
 * for this exam is Hebrew and a docx that opens left-aligned is a docx someone
 * has to fix by hand. */

import type { EssayDocument } from '../../presentation/web/ports.ts';
import { zip } from './zip.ts';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES = `${XML}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );

/** Word has no newline inside a run: a blank line is a new paragraph, and a
 *  single break is <w:br/>. */
function paragraph(text: string, bold = false): string {
  const runs = text
    .split('\n')
    .map((line) => escapeXml(line))
    .join('</w:t><w:br/><w:t xml:space="preserve">');
  return (
    '<w:p><w:pPr><w:bidi/></w:pPr>' +
    `<w:r><w:rPr><w:rtl/>${bold ? '<w:b/>' : ''}</w:rPr>` +
    `<w:t xml:space="preserve">${runs}</w:t></w:r></w:p>`
  );
}

export function essayDocx(document: EssayDocument): Blob {
  const blocks = [paragraph(document.title, true)];
  if (document.subtitle) blocks.push(paragraph(document.subtitle));
  blocks.push(paragraph(''));
  // A blank line separates paragraphs on screen; keep that in the document.
  for (const block of document.essay.split(/\n{2,}/)) blocks.push(paragraph(block));

  const body = `${XML}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${blocks.join('')}<w:sectPr><w:bidi/></w:sectPr></w:body>
</w:document>`;

  const encoder = new TextEncoder();
  return zip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(RELS) },
    { name: 'word/document.xml', data: encoder.encode(body) },
  ]);
}
