/**
 * Android Project View Types
 * Type definitions for the TreeView structure
 */

import * as vscode from 'vscode';

/**
 * Type of tree item
 */
export type ProjectNodeType = 
  | 'root'           // Project root
  | 'category'       // Virtual folder (Manifests, Java, Res, etc.)
  | 'folder'         // Real folder
  | 'file';          // Real file

/**
 * Category identifiers for virtual folders
 */
export type CategoryId = 
  | 'manifests'
  | 'java'
  | 'res'
  | 'assets'
  | 'gradle';

/**
 * Configuration for a category
 */
export interface CategoryConfig {
  id: CategoryId;
  label: string;
  icon: string;
  patterns: string[];  // Glob patterns to match files
  rootPaths: string[]; // Relative paths to scan from workspace root
}

/**
 * Data associated with each tree node
 */
export interface ProjectNodeData {
  type: ProjectNodeType;
  categoryId?: CategoryId;
  resourceUri?: vscode.Uri;
  label: string;
  description?: string;
}

/**
 * Category configurations
 */
export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'manifests',
    label: 'Manifests',
    icon: 'file-code',
    patterns: ['**/AndroidManifest.xml'],
    rootPaths: ['app/src/main', 'src/main'],
  },
  {
    id: 'java',
    label: 'Java / Kotlin',
    icon: 'file-code',
    patterns: ['**/*.java', '**/*.kt'],
    rootPaths: ['app/src/main/java', 'app/src/main/kotlin', 'src/main/java', 'src/main/kotlin'],
  },
  {
    id: 'res',
    label: 'Res',
    icon: 'file-media',
    patterns: ['**/*'],
    rootPaths: ['app/src/main/res', 'src/main/res'],
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: 'file-binary',
    patterns: ['**/*'],
    rootPaths: ['app/src/main/assets', 'src/main/assets'],
  },
  {
    id: 'gradle',
    label: 'Gradle Scripts',
    icon: 'file-code',
    patterns: ['*.gradle', '*.gradle.kts', 'gradle.properties', 'settings.gradle*', 'local.properties'],
    rootPaths: ['.', 'app'],
  },
];
