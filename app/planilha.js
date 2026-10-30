'use strict';
// Planilha .xlsx sem dependências: o XML do Office Open num zip sem compressão.
// Colunas: { t: título, k: 'txt' | 'num' | 'brl' | 'x' | 'data', w?: largura máxima }.

// Texto em UTF-8, como o formato exige.
const enc = new TextEncoder();
// Tabela e cálculo do CRC-32, a soma de verificação que o zip guarda para cada arquivo.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = b => {
  let c = ~0;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};

// Monta um zip sem compressão (método 0): cabeçalho local + conteúdo de cada arquivo,
// depois o diretório central e o registro de fim. files: [[nome, texto]].
function zip(files) {
  const parts = [],
    dir = [];
  let off = 0;
  const head = (size, sets) => {
    const v = new DataView(new ArrayBuffer(size));
    sets.forEach(([at, val, len]) => (len === 4 ? v.setUint32(at, val, true) : v.setUint16(at, val, true)));
    return new Uint8Array(v.buffer);
  };
  for (const [name, text] of files) {
    const n = enc.encode(name),
      d = enc.encode(text),
      c = crc32(d);
    // versão 2.0, nomes em UTF-8 (bit 11), sem compressão, data 01/01/1980
    const comum = [
      [4, 20],
      [6, 0x0800],
      [8, 0],
      [10, 0],
      [12, 33],
      [14, c, 4],
      [18, d.length, 4],
      [22, d.length, 4],
      [26, n.length],
      [28, 0],
    ];
    parts.push(head(30, [[0, 0x04034b50, 4], ...comum]), n, d);
    dir.push(
      head(46, [
        [0, 0x02014b50, 4],
        [4, 20],
        ...comum.map(([at, v, l]) => [at + 2, v, l]),
        [32, 0],
        [34, 0],
        [36, 0],
        [38, 0, 4],
        [42, off, 4],
      ]),
      n,
    );
    off += 30 + n.length + d.length;
  }
  const size = dir.reduce((a, b) => a + b.length, 0);
  const fim = head(22, [
    [0, 0x06054b50, 4],
    [8, files.length],
    [10, files.length],
    [12, size, 4],
    [16, off, 4],
  ]);
  const all = [...parts, ...dir, fim],
    out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

// Escapa texto para XML e remove caracteres de controle que o Excel recusa.
const x = s =>
  String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Letra da coluna a partir do índice: 0 → A, 25 → Z, 26 → AA.
const letra = i => (i >= 26 ? letra(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
// Estilos (índices de cellXfs): 1 cabeçalho, 2 texto, 3 número, 4 reais, 5 retorno, 6 data
const ST = { txt: 2, num: 3, brl: 4, x: 5, data: 6 };
// Data "2026-12-15" vira o número de série do Excel (dias desde 30/12/1899), sem passar por fuso.
const serie = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  return m ? (Date.UTC(+m[1], m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5 : null;
};
// Célula sem valor (nada é escrito no XML).
const vazio = v => v == null || v === '';

// Uma célula: número com o estilo da coluna ou, se não for número, texto com quebra de linha.
function cell(ref, v, k) {
  if (vazio(v)) return '';
  const n = k === 'data' ? serie(v) : k === 'txt' ? null : Number(v);
  if (n != null && Number.isFinite(n)) return '<c r="' + ref + '" s="' + ST[k] + '"><v>' + n + '</v></c>';
  return '<c r="' + ref + '" s="2" t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
}
// Largura pelo maior conteúdo da coluna, com teto; o texto longo quebra linha dentro do teto.
function largura(c, rows, i) {
  const tam = v =>
    vazio(v)
      ? 0
      : c.k === 'brl'
        ? Number(v).toFixed(2).length + 6
        : c.k === 'data'
          ? 10
          : c.k === 'txt'
            ? String(v).length
            : String(v).length + 2;
  return Math.min(c.w || 60, Math.max(c.t.length + 3, ...rows.map(r => tam(r[i]) + 2)));
}
// Uma aba: largura das colunas, cabeçalho fixo (pane) e filtro (autoFilter) na primeira linha.
function sheet(cols, rows) {
  const fim = letra(cols.length - 1) + (rows.length + 1);
  const linha = (r, vals, f) =>
    '<row r="' + r + '">' + vals.map((v, i) => f(letra(i) + r, v, i)).join('') + '</row>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:' +
    fim +
    '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' +
    cols
      .map(
        (c, i) =>
          '<col min="' +
          (i + 1) +
          '" max="' +
          (i + 1) +
          '" width="' +
          largura(c, rows, i) +
          '" customWidth="1"/>',
      )
      .join('') +
    '</cols>' +
    '<sheetData>' +
    linha(
      1,
      cols.map(c => c.t),
      (ref, v) => '<c r="' + ref + '" s="1" t="inlineStr"><is><t>' + x(v) + '</t></is></c>',
    ) +
    rows.map((r, j) => linha(j + 2, r, (ref, v, i) => cell(ref, v, cols[i].k))).join('') +
    '</sheetData>' +
    '<autoFilter ref="A1:' +
    fim +
    '"/></worksheet>'
  );
}
// Estilos usados pelas células: fonte, preenchimento do cabeçalho e formatos de número (reais, retorno, data).
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="0.0&quot;×&quot;"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// abas: [{ nome, cols, rows }] → bytes do arquivo .xlsx
export function xlsx(abas) {
  const ns = 'http://schemas.openxmlformats.org/',
    rel = ns + 'officeDocument/2006/relationships';
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const nome = a => x(a.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return zip([
    [
      '[Content_Types].xml',
      xml +
        '<Types xmlns="' +
        ns +
        'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        abas
          .map(
            (_, i) =>
              '<Override PartName="/xl/worksheets/sheet' +
              (i + 1) +
              '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      xml +
        '<Relationships xmlns="' +
        ns +
        'package/2006/relationships"><Relationship Id="rId1" Type="' +
        rel +
        '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      xml +
        '<workbook xmlns="' +
        ns +
        'spreadsheetml/2006/main" xmlns:r="' +
        rel +
        '"><sheets>' +
        abas
          .map(
            (a, i) => '<sheet name="' + nome(a) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>',
          )
          .join('') +
        '</sheets>' +
        '<definedNames>' +
        abas
          .map(
            (a, i) =>
              '<definedName name="_xlnm._FilterDatabase" localSheetId="' +
              i +
              '" hidden="1">\'' +
              nome(a) +
              "'!$A$1:$" +
              letra(a.cols.length - 1) +
              '$' +
              (a.rows.length + 1) +
              '</definedName>',
          )
          .join('') +
        '</definedNames></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      xml +
        '<Relationships xmlns="' +
        ns +
        'package/2006/relationships">' +
        abas
          .map(
            (_, i) =>
              '<Relationship Id="rId' +
              (i + 1) +
              '" Type="' +
              rel +
              '/worksheet" Target="worksheets/sheet' +
              (i + 1) +
              '.xml"/>',
          )
          .join('') +
        '<Relationship Id="rId' +
        (abas.length + 1) +
        '" Type="' +
        rel +
        '/styles" Target="styles.xml"/></Relationships>',
    ],
    ['xl/styles.xml', STYLES],
    ...abas.map((a, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheet(a.cols, a.rows)]),
  ]);
}
