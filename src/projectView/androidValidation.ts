import * as fs from 'fs';
import * as path from 'path';
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}
const ANDROID_NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const RESERVED_NAMES = new Set([
  'public', 'private', 'protected',
  'class', 'interface', 'enum',
  'default', 'switch', 'case',
  'null', 'true', 'false',
  'new', 'return', 'void',
  'int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short',
]);
export const RESOURCE_FOLDER_TYPES = [
  'drawable',
  'layout',
  'values',
  'mipmap',
  'raw',
  'xml',
  'anim',
  'animator',
  'menu',
  'color',
  'font',
  'navigation',
  'transition',
] as const;
export type ResourceFolderType = typeof RESOURCE_FOLDER_TYPES[number];
const VALID_QUALIFIERS = {
  density: ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi', 'nodpi', 'tvdpi', 'anydpi'],
  screenSize: ['small', 'normal', 'large', 'xlarge'],
  orientation: ['port', 'land'],
  uiMode: ['car', 'desk', 'television', 'appliance', 'watch', 'vrheadset'],
  nightMode: ['night', 'notnight'],
  wideColorGamut: ['widecg', 'nowidecg'],
  hdr: ['highdr', 'lowdr'],
};
export const COMMON_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt-rBR', name: 'Portuguese (Brazil)' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'zh-rTW', name: 'Chinese (Traditional)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'id', name: 'Indonesian' },
] as const;
export function validateResourceName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      isValid: false,
      error: 'Resource name cannot be empty',
    };
  }
  const trimmed = name.trim();
  const baseName = trimmed.replace(/\.[^.]+$/, '');
  if (!ANDROID_NAME_REGEX.test(baseName)) {
    const suggestion = suggestResourceName(baseName);
    return {
      isValid: false,
      error: 'Resource name must start with a lowercase letter and contain only lowercase letters, digits, and underscores',
      suggestion: suggestion !== baseName ? suggestion : undefined,
    };
  }
  if (RESERVED_NAMES.has(baseName)) {
    return {
      isValid: false,
      error: `"${baseName}" is a reserved word`,
      suggestion: `${baseName}_resource`,
    };
  }
  if (baseName.length > 100) {
    return {
      isValid: false,
      error: 'Resource name is too long (max 100 characters)',
    };
  }
  return { isValid: true };
}
export function validateFolderName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      isValid: false,
      error: 'Folder name cannot be empty',
    };
  }
  const trimmed = name.trim().toLowerCase();
  const parts = trimmed.split('-');
  const resourceType = parts[0];
  if (!RESOURCE_FOLDER_TYPES.includes(resourceType as ResourceFolderType)) {
    return {
      isValid: false,
      error: `"${resourceType}" is not a valid resource folder type`,
      suggestion: RESOURCE_FOLDER_TYPES.find(t => t.startsWith(resourceType)),
    };
  }
  if (parts.length > 1) {
    const qualifiers = parts.slice(1);
    const invalidQualifier = qualifiers.find(q => !isValidQualifier(q));
    if (invalidQualifier) {
      return {
        isValid: false,
        error: `"${invalidQualifier}" is not a valid resource qualifier`,
      };
    }
  }
  return { isValid: true };
}
function isValidQualifier(qualifier: string): boolean {
  for (const qualifierSet of Object.values(VALID_QUALIFIERS)) {
    if (qualifierSet.includes(qualifier)) {
      return true;
    }
  }
  if (/^[a-z]{2}(-r[A-Z]{2})?$/.test(qualifier)) {
    return true;
  }
  if (/^[wh]\d+dp$/.test(qualifier)) {
    return true;
  }
  if (/^v\d+$/.test(qualifier)) {
    return true;
  }
  if (/^sw\d+dp$/.test(qualifier)) {
    return true;
  }
  return false;
}
export function validateLocaleSuffix(locale: string): ValidationResult {
  if (!locale || locale.trim().length === 0) {
    return {
      isValid: false,
      error: 'Locale cannot be empty',
    };
  }
  const trimmed = locale.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(trimmed)) {
    return { isValid: true };
  }
  if (/^[a-z]{2}-r[A-Z]{2}$/i.test(locale.trim())) {
    return { isValid: true };
  }
  return {
    isValid: false,
    error: 'Locale must be in format "xx" (e.g., "es") or "xx-rYY" (e.g., "pt-rBR")',
  };
}
export function suggestResourceName(input: string): string {
  let suggestion = input.toLowerCase();
  suggestion = suggestion.replace(/[\s-]+/g, '_');
  suggestion = suggestion.replace(/[^a-z0-9_]/g, '');
  if (!/^[a-z]/.test(suggestion)) {
    suggestion = 'res_' + suggestion;
  }
  suggestion = suggestion.replace(/^_+|_+$/g, '');
  suggestion = suggestion.replace(/_+/g, '_');
  return suggestion || 'resource';
}
export async function checkPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
export async function checkDuplicate(
  directory: string,
  fileName: string
): Promise<{ exists: boolean; conflictPath?: string }> {
  const targetPath = path.join(directory, fileName);
  const exists = await checkPathExists(targetPath);
  return {
    exists,
    conflictPath: exists ? targetPath : undefined,
  };
}
