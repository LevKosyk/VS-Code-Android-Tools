/**
 * Android Resource Validation
 * Validates Android resource names, folder names, and locale suffixes
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of a validation check
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Android resource naming rules:
 * - Must start with a lowercase letter
 * - Can contain only lowercase letters, digits, and underscores
 * - Cannot be a reserved word
 */
const ANDROID_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

/**
 * Reserved Android resource names
 */
const RESERVED_NAMES = new Set([
  'public', 'private', 'protected',
  'class', 'interface', 'enum',
  'default', 'switch', 'case',
  'null', 'true', 'false',
  'new', 'return', 'void',
  'int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short',
]);

/**
 * Valid Android resource folder prefixes
 */
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

/**
 * Valid Android resource qualifiers
 */
const VALID_QUALIFIERS = {
  // Screen density
  density: ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi', 'nodpi', 'tvdpi', 'anydpi'],
  // Screen size
  screenSize: ['small', 'normal', 'large', 'xlarge'],
  // Screen orientation
  orientation: ['port', 'land'],
  // UI mode
  uiMode: ['car', 'desk', 'television', 'appliance', 'watch', 'vrheadset'],
  // Night mode
  nightMode: ['night', 'notnight'],
  // Wide color gamut
  wideColorGamut: ['widecg', 'nowidecg'],
  // HDR
  hdr: ['highdr', 'lowdr'],
};

/**
 * Common Android locales for quick selection
 */
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

/**
 * Validate resource file name (e.g., activity_main, strings)
 */
export function validateResourceName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      isValid: false,
      error: 'Resource name cannot be empty',
    };
  }

  const trimmed = name.trim();

  // Remove file extension if present
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

/**
 * Validate resource folder name (e.g., drawable, layout-land, values-es)
 */
export function validateFolderName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      isValid: false,
      error: 'Folder name cannot be empty',
    };
  }

  const trimmed = name.trim().toLowerCase();
  const parts = trimmed.split('-');

  // First part must be a valid resource type
  const resourceType = parts[0];
  if (!RESOURCE_FOLDER_TYPES.includes(resourceType as ResourceFolderType)) {
    return {
      isValid: false,
      error: `"${resourceType}" is not a valid resource folder type`,
      suggestion: RESOURCE_FOLDER_TYPES.find(t => t.startsWith(resourceType)),
    };
  }

  // Check if qualifiers (parts after the type) are valid
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

/**
 * Check if a qualifier string is valid
 */
function isValidQualifier(qualifier: string): boolean {
  // Check against known qualifiers
  for (const qualifierSet of Object.values(VALID_QUALIFIERS)) {
    if (qualifierSet.includes(qualifier)) {
      return true;
    }
  }

  // Check for locale format (e.g., en, es, pt-rBR)
  if (/^[a-z]{2}(-r[A-Z]{2})?$/.test(qualifier)) {
    return true;
  }

  // Check for screen width/height (e.g., w600dp, h400dp)
  if (/^[wh]\d+dp$/.test(qualifier)) {
    return true;
  }

  // Check for API level (e.g., v21, v26)
  if (/^v\d+$/.test(qualifier)) {
    return true;
  }

  // Check for smallest width (e.g., sw600dp)
  if (/^sw\d+dp$/.test(qualifier)) {
    return true;
  }

  return false;
}

/**
 * Validate locale suffix (e.g., es, fr, pt-rBR)
 */
export function validateLocaleSuffix(locale: string): ValidationResult {
  if (!locale || locale.trim().length === 0) {
    return {
      isValid: false,
      error: 'Locale cannot be empty',
    };
  }

  const trimmed = locale.trim().toLowerCase();

  // Basic locale: two lowercase letters (e.g., en, es, fr)
  if (/^[a-z]{2}$/.test(trimmed)) {
    return { isValid: true };
  }

  // Locale with region: two lowercase + -r + two uppercase (e.g., pt-rBR)
  if (/^[a-z]{2}-r[A-Z]{2}$/i.test(locale.trim())) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: 'Locale must be in format "xx" (e.g., "es") or "xx-rYY" (e.g., "pt-rBR")',
  };
}

/**
 * Suggest a valid resource name from invalid input
 */
export function suggestResourceName(input: string): string {
  // Convert to lowercase
  let suggestion = input.toLowerCase();

  // Replace spaces and hyphens with underscores
  suggestion = suggestion.replace(/[\s-]+/g, '_');

  // Remove invalid characters
  suggestion = suggestion.replace(/[^a-z0-9_]/g, '');

  // Ensure it starts with a letter
  if (!/^[a-z]/.test(suggestion)) {
    suggestion = 'res_' + suggestion;
  }

  // Remove leading/trailing underscores
  suggestion = suggestion.replace(/^_+|_+$/g, '');

  // Replace multiple underscores with single
  suggestion = suggestion.replace(/_+/g, '_');

  return suggestion || 'resource';
}

/**
 * Check if a path already exists
 */
export async function checkPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for duplicate resource in target directory
 */
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
