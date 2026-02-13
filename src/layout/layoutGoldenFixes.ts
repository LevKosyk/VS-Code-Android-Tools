export interface LayoutGoldenFixResult {
  xml: string;
  stringsXml: string;
}

function normalizeResourceName(name: string): string {
  let next = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(next)) {
    next = `text_${next}`;
  }
  return next || 'new_text';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function applyGoldenLayoutFixes(xmlInput: string): LayoutGoldenFixResult {
  let xml = xmlInput;
  const strings: Array<{ name: string; value: string }> = [];
  const used = new Set<string>();

  const hardcodedRegex = /android:(text|hint|contentDescription)="([^"]+)"/g;
  xml = xml.replace(hardcodedRegex, (_full, attr: string, value: string, offset: number, whole: string) => {
    if (/^(@string\/|@android:string\/|@\{|\?)/.test(value)) {
      return `android:${attr}="${value}"`;
    }
    const tagStart = whole.lastIndexOf('<', offset);
    const tagEnd = whole.indexOf('>', offset);
    const tagSlice = tagStart >= 0 && tagEnd > tagStart ? whole.slice(tagStart, tagEnd + 1) : '';
    const idMatch = /android:id="@\+id\/([A-Za-z0-9_]+)"/.exec(tagSlice);
    let base = idMatch?.[1] ? `${idMatch[1]}_${attr}` : `${attr}_${value}`;
    base = normalizeResourceName(base);
    let name = base;
    let idx = 2;
    while (used.has(name)) {
      name = `${base}_${idx++}`;
    }
    used.add(name);
    strings.push({ name, value });
    return `android:${attr}="@string/${name}"`;
  });

  const tagRegex = /<(ImageView|ImageButton|androidx\.appcompat\.widget\.AppCompatImageView)([^>]*?)\/>/g;
  xml = xml.replace(tagRegex, (full, tag: string, attrs: string) => {
    const hasSrc = /(android:src|app:srcCompat)="[^"]+"/.test(attrs);
    const hasCd = /android:contentDescription="[^"]*"/.test(attrs);
    if (hasSrc && !hasCd) {
      return `<${tag}${attrs} android:contentDescription="@null"/>`;
    }
    return full;
  });

  const anyTagRegex = /<([A-Za-z0-9_.]+)([^>]*?)\/>/g;
  xml = xml.replace(anyTagRegex, (full, tag: string, attrs: string) => {
    if (!/android:id="@\+id\//.test(attrs)) {
      return full;
    }
    if (/ConstraintLayout$/.test(tag)) {
      return full;
    }
    const hasConstraint = /app:layout_constraint(Top|Bottom|Start|End|Left|Right|Baseline|Circle)[^=]*="[^"]+"/.test(attrs);
    if (hasConstraint) {
      return full;
    }
    return `<${tag}${attrs} app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"/>`;
  });

  const stringsBody = strings
    .map(s => `    <string name="${s.name}">${escapeXml(s.value)}</string>`)
    .join('\n');
  const stringsXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${stringsBody}\n</resources>\n`;

  return { xml, stringsXml };
}
