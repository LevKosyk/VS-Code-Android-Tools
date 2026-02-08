import * as vscode from 'vscode';
export type ProjectNodeType = 
  | 'root'           
  | 'category'       
  | 'folder'         
  | 'package'        
  | 'file';          
export type CategoryId = 
  | 'manifests'
  | 'java'
  | 'res'
  | 'assets'
  | 'gradle';
export interface CategoryConfig {
  id: CategoryId;
  label: string;
  icon: string;
  patterns: string[];  
  rootPaths: string[]; 
}
export interface ProjectNodeData {
  type: ProjectNodeType;
  categoryId?: CategoryId;
  resourceUri?: vscode.Uri;
  label: string;
  description?: string;
}
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
