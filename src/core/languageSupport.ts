/**
 * Language Support Validation
 * Ensures required language extensions are installed and active
 */

import * as vscode from 'vscode';
import { showWarning } from '../ui/notifications';

interface RequiredExtension {
  id: string;
  name: string;
  url: string;
}

const REQUIRED_EXTENSIONS: Record<string, RequiredExtension> = {
  java: {
    id: 'vscjava.vscode-java-pack',
    name: 'Extension Pack for Java',
    url: 'https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack'
  },
  kotlin: {
    id: 'fwcd.kotlin',
    name: 'Kotlin Language',
    url: 'https://marketplace.visualstudio.com/items?itemName=fwcd.kotlin'
  }
};

/**
 * Check if required language extensions are installed
 */
export async function checkLanguageExtensions(): Promise<void> {
  const missing: RequiredExtension[] = [];

  // Check Java
  const javaExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.java.id);
  if (!javaExt) {
    missing.push(REQUIRED_EXTENSIONS.java);
  }

  // Check Kotlin
  const kotlinExt = vscode.extensions.getExtension(REQUIRED_EXTENSIONS.kotlin.id);
  if (!kotlinExt) {
    missing.push(REQUIRED_EXTENSIONS.kotlin);
  }

  if (missing.length > 0) {
    const message = `Missing language support extensions: ${missing.map(e => e.name).join(', ')}. IntelliSense may not work correctly.`;
    const action = 'Install Missing Extensions';
    
    const selection = await vscode.window.showWarningMessage(message, action);
    
    if (selection === action) {
      for (const ext of missing) {
        vscode.env.openExternal(vscode.Uri.parse(ext.url));
      }
    }
  }
}

/**
 * Ensure language mode is correct for a document
 */
export async function ensureLanguageMode(document: vscode.TextDocument): Promise<void> {
  const ext = document.fileName.split('.').pop()?.toLowerCase();
  
  if (ext === 'java' && document.languageId !== 'java') {
    await vscode.languages.setTextDocumentLanguage(document, 'java');
  } else if ((ext === 'kt' || ext === 'kts') && document.languageId !== 'kotlin') {
    await vscode.languages.setTextDocumentLanguage(document, 'kotlin');
  }
}
