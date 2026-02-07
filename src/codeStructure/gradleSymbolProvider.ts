/**
 * Gradle Document Symbol Provider
 * Provides outline structure for Gradle and Gradle KTS files
 */

import * as vscode from 'vscode';

/**
 * DocumentSymbolProvider for Gradle build files
 * Provides structure for:
 * - plugins {}
 * - dependencies {}
 * - android {} configuration
 * - Task definitions
 */
export class GradleSymbolProvider implements vscode.DocumentSymbolProvider {
  /**
   * Provide document symbols for Gradle files
   */
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const text = document.getText();
    const symbols: vscode.DocumentSymbol[] = [];

    // Parse main blocks
    this.parsePlugins(document, text, symbols);
    this.parseAndroidBlock(document, text, symbols);
    this.parseDependencies(document, text, symbols);
    this.parseTasks(document, text, symbols);
    this.parseRepositories(document, text, symbols);

    return symbols;
  }

  /**
   * Parse plugins block
   */
  private parsePlugins(
    document: vscode.TextDocument,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ): void {
    const pluginsMatch = text.match(/plugins\s*\{([^}]+)\}/s);
    if (!pluginsMatch) return;

    const startIndex = text.indexOf('plugins');
    const startPos = document.positionAt(startIndex);
    const endPos = document.positionAt(startIndex + pluginsMatch[0].length);

    const pluginsSymbol = new vscode.DocumentSymbol(
      'plugins',
      'Build plugins',
      vscode.SymbolKind.Namespace,
      new vscode.Range(startPos, endPos),
      new vscode.Range(startPos, startPos)
    );

    // Parse individual plugins
    const pluginContent = pluginsMatch[1];
    
    // Match: id("...") or id '...'
    const idRegex = /id\s*[\("']([^"']+)[\)"']/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idRegex.exec(pluginContent)) !== null) {
      const pluginId = idMatch[1];
      const absIndex = text.indexOf(idMatch[0], startIndex);
      const pos = document.positionAt(absIndex);
      
      pluginsSymbol.children.push(new vscode.DocumentSymbol(
        pluginId,
        'plugin',
        vscode.SymbolKind.Module,
        new vscode.Range(pos, pos),
        new vscode.Range(pos, pos)
      ));
    }

    // Match: kotlin("...") or java or application
    const kotlinRegex = /(?:kotlin|java|application|groovy)\s*[\("']?([^"'\)\s]*)[\)"']?/g;
    let ktMatch: RegExpExecArray | null;
    while ((ktMatch = kotlinRegex.exec(pluginContent)) !== null) {
      const pluginName = ktMatch[1] ? `kotlin-${ktMatch[1]}` : ktMatch[0].trim();
      const absIndex = text.indexOf(ktMatch[0], startIndex);
      const pos = document.positionAt(absIndex);
      
      pluginsSymbol.children.push(new vscode.DocumentSymbol(
        pluginName,
        'plugin',
        vscode.SymbolKind.Module,
        new vscode.Range(pos, pos),
        new vscode.Range(pos, pos)
      ));
    }

    if (pluginsSymbol.children.length > 0 || pluginsMatch) {
      symbols.push(pluginsSymbol);
    }
  }

  /**
   * Parse android {} configuration block
   */
  private parseAndroidBlock(
    document: vscode.TextDocument,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ): void {
    // Find android { block (accounting for nesting)
    const androidStart = text.match(/\bandroid\s*\{/);
    if (!androidStart || androidStart.index === undefined) return;

    const startIndex = androidStart.index;
    const blockEnd = this.findMatchingBrace(text, startIndex + androidStart[0].length - 1);
    if (blockEnd === -1) return;

    const startPos = document.positionAt(startIndex);
    const endPos = document.positionAt(blockEnd + 1);

    const androidSymbol = new vscode.DocumentSymbol(
      'android',
      'Android configuration',
      vscode.SymbolKind.Object,
      new vscode.Range(startPos, endPos),
      new vscode.Range(startPos, startPos)
    );

    const androidContent = text.substring(startIndex, blockEnd + 1);

    // Parse common android sub-blocks
    const subBlocks = ['defaultConfig', 'buildTypes', 'productFlavors', 'compileOptions', 'kotlinOptions', 'buildFeatures', 'sourceSets'];
    for (const blockName of subBlocks) {
      const blockRegex = new RegExp(`${blockName}\\s*\\{`);
      const blockMatch = androidContent.match(blockRegex);
      if (blockMatch && blockMatch.index !== undefined) {
        const absIndex = startIndex + blockMatch.index;
        const pos = document.positionAt(absIndex);
        
        androidSymbol.children.push(new vscode.DocumentSymbol(
          blockName,
          'configuration',
          vscode.SymbolKind.Property,
          new vscode.Range(pos, pos),
          new vscode.Range(pos, pos)
        ));
      }
    }

    // Parse key configuration values
    const configPatterns = [
      { pattern: /namespace\s*[=\s]*["']([^"']+)["']/, name: 'namespace' },
      { pattern: /compileSdk\s*[=\s]*(\d+)/, name: 'compileSdk' },
      { pattern: /minSdk\s*[=\s]*(\d+)/, name: 'minSdk' },
      { pattern: /targetSdk\s*[=\s]*(\d+)/, name: 'targetSdk' },
      { pattern: /versionCode\s*[=\s]*(\d+)/, name: 'versionCode' },
      { pattern: /versionName\s*[=\s]*["']([^"']+)["']/, name: 'versionName' },
    ];

    for (const config of configPatterns) {
      const match = androidContent.match(config.pattern);
      if (match && match.index !== undefined) {
        const value = match[1];
        const absIndex = startIndex + match.index;
        const pos = document.positionAt(absIndex);
        
        androidSymbol.children.push(new vscode.DocumentSymbol(
          `${config.name}: ${value}`,
          'value',
          vscode.SymbolKind.Constant,
          new vscode.Range(pos, pos),
          new vscode.Range(pos, pos)
        ));
      }
    }

    symbols.push(androidSymbol);
  }

  /**
   * Parse dependencies block
   */
  private parseDependencies(
    document: vscode.TextDocument,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ): void {
    const depsMatch = text.match(/\bdependencies\s*\{/);
    if (!depsMatch || depsMatch.index === undefined) return;

    const startIndex = depsMatch.index;
    const blockEnd = this.findMatchingBrace(text, startIndex + depsMatch[0].length - 1);
    if (blockEnd === -1) return;

    const startPos = document.positionAt(startIndex);
    const endPos = document.positionAt(blockEnd + 1);

    const depsSymbol = new vscode.DocumentSymbol(
      'dependencies',
      'Project dependencies',
      vscode.SymbolKind.Array,
      new vscode.Range(startPos, endPos),
      new vscode.Range(startPos, startPos)
    );

    const depsContent = text.substring(startIndex, blockEnd + 1);

    // Parse dependency declarations
    const depTypes = ['implementation', 'api', 'testImplementation', 'androidTestImplementation', 'kapt', 'ksp', 'compileOnly', 'runtimeOnly'];
    
    for (const depType of depTypes) {
      const depRegex = new RegExp(`${depType}\\s*[\\("']([^"'\\)]+)[\\)"']`, 'g');
      let depMatch: RegExpExecArray | null;
      
      while ((depMatch = depRegex.exec(depsContent)) !== null) {
        const dep = depMatch[1];
        // Simplify dependency name (take artifact name)
        const parts = dep.split(':');
        const simpleName = parts.length >= 2 ? parts[1] : dep;
        
        const absIndex = startIndex + (depMatch.index || 0);
        const pos = document.positionAt(absIndex);
        
        depsSymbol.children.push(new vscode.DocumentSymbol(
          simpleName,
          depType,
          vscode.SymbolKind.Package,
          new vscode.Range(pos, pos),
          new vscode.Range(pos, pos)
        ));
      }
    }

    if (depsSymbol.children.length > 0) {
      symbols.push(depsSymbol);
    }
  }

  /**
   * Parse task definitions
   */
  private parseTasks(
    document: vscode.TextDocument,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ): void {
    // Match: task taskName { or tasks.register("taskName") or task("taskName")
    const taskPatterns = [
      /\btask\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[({]/g,
      /\btask\s*\(\s*["']([^"']+)["']\s*\)/g,
      /tasks\.register\s*\(\s*["']([^"']+)["']/g,
    ];

    for (const pattern of taskPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const taskName = match[1];
        const pos = document.positionAt(match.index);
        
        symbols.push(new vscode.DocumentSymbol(
          taskName,
          'task',
          vscode.SymbolKind.Function,
          new vscode.Range(pos, pos),
          new vscode.Range(pos, pos)
        ));
      }
    }
  }

  /**
   * Parse repositories block
   */
  private parseRepositories(
    document: vscode.TextDocument,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ): void {
    const reposMatch = text.match(/\brepositories\s*\{([^}]+)\}/);
    if (!reposMatch || reposMatch.index === undefined) return;

    const startIndex = reposMatch.index;
    const startPos = document.positionAt(startIndex);
    const endPos = document.positionAt(startIndex + reposMatch[0].length);

    const reposSymbol = new vscode.DocumentSymbol(
      'repositories',
      'Maven repositories',
      vscode.SymbolKind.Namespace,
      new vscode.Range(startPos, endPos),
      new vscode.Range(startPos, startPos)
    );

    const reposContent = reposMatch[1];
    const repoNames = ['google', 'mavenCentral', 'mavenLocal', 'jcenter', 'gradlePluginPortal'];
    
    for (const repo of repoNames) {
      if (reposContent.includes(repo)) {
        const repoIndex = text.indexOf(repo, startIndex);
        if (repoIndex !== -1) {
          const pos = document.positionAt(repoIndex);
          reposSymbol.children.push(new vscode.DocumentSymbol(
            repo,
            'repository',
            vscode.SymbolKind.Field,
            new vscode.Range(pos, pos),
            new vscode.Range(pos, pos)
          ));
        }
      }
    }

    if (reposSymbol.children.length > 0) {
      symbols.push(reposSymbol);
    }
  }

  /**
   * Find matching closing brace for an opening brace
   */
  private findMatchingBrace(text: string, openBraceIndex: number): number {
    let depth = 1;
    for (let i = openBraceIndex + 1; i < text.length; i++) {
      if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }
}
