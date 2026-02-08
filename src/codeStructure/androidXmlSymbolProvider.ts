import * as vscode from 'vscode';
interface XmlElement {
  name: string;
  attributes: Map<string, string>;
  startLine: number;
  endLine: number;
  children: XmlElement[];
}
export class AndroidXmlSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const text = document.getText();
    const fileName = document.fileName.toLowerCase();
    if (fileName.includes('androidmanifest.xml')) {
      return this.parseManifest(document, text);
    } else if (this.isLayoutFile(fileName)) {
      return this.parseLayout(document, text);
    } else if (this.isValuesFile(fileName)) {
      return this.parseValues(document, text);
    }
    return this.parseGenericXml(document, text);
  }
  private isLayoutFile(fileName: string): boolean {
    return fileName.includes('/layout/') || fileName.includes('/layout-');
  }
  private isValuesFile(fileName: string): boolean {
    return fileName.includes('/values/') || fileName.includes('/values-');
  }
  private parseLayout(
    document: vscode.TextDocument,
    text: string
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const tagStack: { symbol: vscode.DocumentSymbol; indent: number }[] = [];
    const tagRegex = /<\/?([a-zA-Z0-9_.]+)([^>]*?)(\/?)\s*>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1];
      const attributes = match[2];
      const selfClosing = match[3] === '/';
      const isClosing = fullMatch.startsWith('</');
      if (isClosing) {
        tagStack.pop();
        continue;
      }
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + fullMatch.length);
      const idMatch = attributes.match(/android:id\s*=\s*"@\+?id\/([^"]+)"/);
      const id = idMatch ? idMatch[1] : undefined;
      // Create symbol
      const label = id ? `${tagName} (@${id})` : tagName;
      const symbol = new vscode.DocumentSymbol(
        label,
        this.getViewDescription(tagName),
        this.getViewSymbolKind(tagName),
        new vscode.Range(startPos, endPos),
        new vscode.Range(startPos, endPos)
      );
      // Add to parent or root
      if (tagStack.length > 0) {
        tagStack[tagStack.length - 1].symbol.children.push(symbol);
      } else {
        symbols.push(symbol);
      }
      // Push to stack if not self-closing
      if (!selfClosing) {
        tagStack.push({ symbol, indent: startPos.character });
      }
    }
    return symbols;
  }
  /**
   * Parse values XML (strings, colors, dimens)
   */
  private parseValues(
    document: vscode.TextDocument,
    text: string
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    // Match resource elements
    const resourceRegex = /<(string|color|dimen|style|integer|bool|array|string-array|integer-array|plurals|item)\s+name\s*=\s*"([^"]+)"[^>]*>/g;
    let match: RegExpExecArray | null;
    while ((match = resourceRegex.exec(text)) !== null) {
      const type = match[1];
      const name = match[2];
      const startPos = document.positionAt(match.index);
      const endMatch = text.indexOf(`</${type}>`, match.index);
      const endPos = endMatch !== -1 
        ? document.positionAt(endMatch + type.length + 3)
        : document.positionAt(match.index + match[0].length);
      const symbol = new vscode.DocumentSymbol(
        name,
        type,
        this.getResourceSymbolKind(type),
        new vscode.Range(startPos, endPos),
        new vscode.Range(startPos, document.positionAt(match.index + match[0].length))
      );
      symbols.push(symbol);
    }
    return symbols;
  }
  private parseManifest(
    document: vscode.TextDocument,
    text: string
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const packageMatch = text.match(/package\s*=\s*"([^"]+)"/);
    if (packageMatch) {
      const pos = document.positionAt(packageMatch.index || 0);
      symbols.push(new vscode.DocumentSymbol(
        packageMatch[1],
        'package',
        vscode.SymbolKind.Package,
        new vscode.Range(pos, pos),
        new vscode.Range(pos, pos)
      ));
    }
    // Components
    const componentTypes = ['activity', 'service', 'receiver', 'provider'];
    for (const componentType of componentTypes) {
      const regex = new RegExp(`<${componentType}[^>]*android:name\\s*=\\s*"([^"]+)"[^>]*>`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const name = match[1];
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const simpleName = name.startsWith('.') ? name.substring(1) : name.split('.').pop() || name;
        symbols.push(new vscode.DocumentSymbol(
          simpleName,
          componentType,
          this.getComponentSymbolKind(componentType),
          new vscode.Range(startPos, endPos),
          new vscode.Range(startPos, endPos)
        ));
      }
    }
    const permRegex = /<uses-permission\s+android:name\s*=\s*"([^"]+)"/g;
    let permMatch: RegExpExecArray | null;
    while ((permMatch = permRegex.exec(text)) !== null) {
      const permission = permMatch[1].split('.').pop() || permMatch[1];
      const pos = document.positionAt(permMatch.index);
      symbols.push(new vscode.DocumentSymbol(
        permission,
        'permission',
        vscode.SymbolKind.Key,
        new vscode.Range(pos, pos),
        new vscode.Range(pos, pos)
      ));
    }
    return symbols;
  }
  private parseGenericXml(
    document: vscode.TextDocument,
    text: string
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const rootMatch = text.match(/<([a-zA-Z0-9_:]+)[\s>]/);
    if (rootMatch) {
      const pos = document.positionAt(rootMatch.index || 0);
      symbols.push(new vscode.DocumentSymbol(
        rootMatch[1],
        'root element',
        vscode.SymbolKind.Struct,
        new vscode.Range(pos, document.positionAt(text.length)),
        new vscode.Range(pos, pos)
      ));
    }
    return symbols;
  }
  private getViewSymbolKind(tagName: string): vscode.SymbolKind {
    const lowerTag = tagName.toLowerCase();
    if (lowerTag.includes('layout') || lowerTag.includes('group') || 
        lowerTag.includes('constraint') || lowerTag.includes('frame') ||
        lowerTag.includes('linear') || lowerTag.includes('relative')) {
      return vscode.SymbolKind.Struct;
    }
    if (lowerTag.includes('text') || lowerTag.includes('edit')) {
      return vscode.SymbolKind.String;
    }
    if (lowerTag.includes('button') || lowerTag.includes('image')) {
      return vscode.SymbolKind.Event;
    }
    if (lowerTag.includes('recycler') || lowerTag.includes('list')) {
      return vscode.SymbolKind.Array;
    }
    return vscode.SymbolKind.Field;
  }
  private getViewDescription(tagName: string): string {
    const lowerTag = tagName.toLowerCase();
    if (lowerTag.includes('layout') || lowerTag.includes('group')) {
      return 'ViewGroup';
    }
    return 'View';
  }
  private getResourceSymbolKind(type: string): vscode.SymbolKind {
    switch (type) {
      case 'string':
        return vscode.SymbolKind.String;
      case 'color':
        return vscode.SymbolKind.Constant;
      case 'dimen':
        return vscode.SymbolKind.Number;
      case 'style':
        return vscode.SymbolKind.Class;
      case 'integer':
      case 'bool':
        return vscode.SymbolKind.Constant;
      case 'array':
      case 'string-array':
      case 'integer-array':
        return vscode.SymbolKind.Array;
      default:
        return vscode.SymbolKind.Variable;
    }
  }
  private getComponentSymbolKind(componentType: string): vscode.SymbolKind {
    switch (componentType) {
      case 'activity':
        return vscode.SymbolKind.Class;
      case 'service':
        return vscode.SymbolKind.Function;
      case 'receiver':
        return vscode.SymbolKind.Event;
      case 'provider':
        return vscode.SymbolKind.Interface;
      default:
        return vscode.SymbolKind.Object;
    }
  }
}
