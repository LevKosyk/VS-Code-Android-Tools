import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findApplicationId, findApplicationModules } from '../core/androidProject';
import { showError, showInfo, showWarning } from '../ui/notifications';

type BlueprintTemplate = 'mvvm' | 'clean' | 'multi-module';
type BlueprintLanguage = 'kotlin' | 'java';

interface BlueprintContext {
  workspaceRoot: string;
  moduleName: string;
  basePackage: string;
  featureName: string;
  featureClassName: string;
  srcRoot: string;
  language: BlueprintLanguage;
}

function toClassName(raw: string): string {
  return raw
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function toPackagePath(basePackage: string): string[] {
  return basePackage.split('.').map(part => part.trim()).filter(Boolean);
}

function detectLanguage(moduleRoot: string): BlueprintLanguage {
  if (fs.existsSync(path.join(moduleRoot, 'src', 'main', 'kotlin'))) {
    return 'kotlin';
  }
  if (fs.existsSync(path.join(moduleRoot, 'src', 'main', 'java'))) {
    return 'java';
  }
  return 'kotlin';
}

function resolveSrcRoot(moduleRoot: string, language: BlueprintLanguage): string {
  return path.join(moduleRoot, 'src', 'main', language === 'kotlin' ? 'kotlin' : 'java');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeIfMissing(filePath: string, content: string): 'created' | 'skipped' {
  if (fs.existsSync(filePath)) {
    return 'skipped';
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return 'created';
}

function buildKotlinPath(ctx: BlueprintContext, ...segments: string[]): string {
  return path.join(ctx.srcRoot, ...toPackagePath(ctx.basePackage), ...segments);
}

function buildJavaPath(ctx: BlueprintContext, ...segments: string[]): string {
  return path.join(ctx.srcRoot, ...toPackagePath(ctx.basePackage), ...segments);
}

function mvvmFiles(ctx: BlueprintContext): Array<{ filePath: string; content: string }> {
  const feature = ctx.featureClassName;
  if (ctx.language === 'java') {
    const pkgBase = `${ctx.basePackage}.${ctx.featureName}`;
    return [
      {
        filePath: path.join(buildJavaPath(ctx, ctx.featureName, 'data'), `${feature}Repository.java`),
        content: `package ${pkgBase}.data;

public class ${feature}Repository {
    public String load() {
        return "${feature} data";
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, ctx.featureName, 'domain'), `Get${feature}UseCase.java`),
        content: `package ${pkgBase}.domain;

import ${pkgBase}.data.${feature}Repository;

public class Get${feature}UseCase {
    private final ${feature}Repository repository;

    public Get${feature}UseCase(${feature}Repository repository) {
        this.repository = repository;
    }

    public String execute() {
        return repository.load();
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, ctx.featureName, 'presentation'), `${feature}ViewModel.java`),
        content: `package ${pkgBase}.presentation;

import androidx.lifecycle.ViewModel;
import ${pkgBase}.domain.Get${feature}UseCase;

public class ${feature}ViewModel extends ViewModel {
    private final Get${feature}UseCase useCase;

    public ${feature}ViewModel(Get${feature}UseCase useCase) {
        this.useCase = useCase;
    }

    public String state() {
        return useCase.execute();
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, ctx.featureName, 'ui'), `${feature}Fragment.java`),
        content: `package ${pkgBase}.ui;

import androidx.fragment.app.Fragment;

public class ${feature}Fragment extends Fragment {
}
`,
      },
    ];
  }
  const pkgBase = `${ctx.basePackage}.${ctx.featureName}`;
  return [
    {
      filePath: path.join(buildKotlinPath(ctx, ctx.featureName, 'data'), `${feature}Repository.kt`),
      content: `package ${pkgBase}.data

class ${feature}Repository {
    fun load(): String = "${feature} data"
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, ctx.featureName, 'domain'), `Get${feature}UseCase.kt`),
      content: `package ${pkgBase}.domain

import ${pkgBase}.data.${feature}Repository

class Get${feature}UseCase(
    private val repository: ${feature}Repository,
) {
    operator fun invoke(): String = repository.load()
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, ctx.featureName, 'presentation'), `${feature}ViewModel.kt`),
      content: `package ${pkgBase}.presentation

import androidx.lifecycle.ViewModel
import ${pkgBase}.domain.Get${feature}UseCase

class ${feature}ViewModel(
    private val get${feature}UseCase: Get${feature}UseCase,
) : ViewModel() {
    fun state(): String = get${feature}UseCase()
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, ctx.featureName, 'ui'), `${feature}Fragment.kt`),
      content: `package ${pkgBase}.ui

import androidx.fragment.app.Fragment

class ${feature}Fragment : Fragment()
`,
    },
  ];
}

function cleanFiles(ctx: BlueprintContext): Array<{ filePath: string; content: string }> {
  const feature = ctx.featureClassName;
  if (ctx.language === 'java') {
    const pkg = ctx.basePackage;
    return [
      {
        filePath: path.join(buildJavaPath(ctx, 'domain', 'model'), `${feature}.java`),
        content: `package ${pkg}.domain.model;

public class ${feature} {
    public final String title;

    public ${feature}(String title) {
        this.title = title;
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'domain', 'repository'), `${feature}Repository.java`),
        content: `package ${pkg}.domain.repository;

import ${pkg}.domain.model.${feature};
import java.util.List;

public interface ${feature}Repository {
    List<${feature}> list();
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'domain', 'usecase'), `Get${feature}ListUseCase.java`),
        content: `package ${pkg}.domain.usecase;

import ${pkg}.domain.model.${feature};
import ${pkg}.domain.repository.${feature}Repository;
import java.util.List;

public class Get${feature}ListUseCase {
    private final ${feature}Repository repository;

    public Get${feature}ListUseCase(${feature}Repository repository) {
        this.repository = repository;
    }

    public List<${feature}> execute() {
        return repository.list();
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'data', 'repository'), `${feature}RepositoryImpl.java`),
        content: `package ${pkg}.data.repository;

import ${pkg}.domain.model.${feature};
import ${pkg}.domain.repository.${feature}Repository;
import java.util.Collections;
import java.util.List;

public class ${feature}RepositoryImpl implements ${feature}Repository {
    @Override
    public List<${feature}> list() {
        return Collections.singletonList(new ${feature}("${feature}"));
    }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'presentation'), `${feature}ViewModel.java`),
        content: `package ${pkg}.presentation;

import androidx.lifecycle.ViewModel;
import ${pkg}.domain.model.${feature};
import ${pkg}.domain.usecase.Get${feature}ListUseCase;
import java.util.List;

public class ${feature}ViewModel extends ViewModel {
    private final Get${feature}ListUseCase useCase;

    public ${feature}ViewModel(Get${feature}ListUseCase useCase) {
        this.useCase = useCase;
    }

    public List<${feature}> items() {
        return useCase.execute();
    }
}
`,
      },
    ];
  }
  const pkg = ctx.basePackage;
  return [
    {
      filePath: path.join(buildKotlinPath(ctx, 'domain', 'model'), `${feature}.kt`),
      content: `package ${pkg}.domain.model

data class ${feature}(val title: String)
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'domain', 'repository'), `${feature}Repository.kt`),
      content: `package ${pkg}.domain.repository

import ${pkg}.domain.model.${feature}

interface ${feature}Repository {
    fun list(): List<${feature}>
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'domain', 'usecase'), `Get${feature}ListUseCase.kt`),
      content: `package ${pkg}.domain.usecase

import ${pkg}.domain.model.${feature}
import ${pkg}.domain.repository.${feature}Repository

class Get${feature}ListUseCase(
    private val repository: ${feature}Repository,
) {
    operator fun invoke(): List<${feature}> = repository.list()
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'data', 'repository'), `${feature}RepositoryImpl.kt`),
      content: `package ${pkg}.data.repository

import ${pkg}.domain.model.${feature}
import ${pkg}.domain.repository.${feature}Repository

class ${feature}RepositoryImpl : ${feature}Repository {
    override fun list(): List<${feature}> = listOf(${feature}(title = "${feature}"))
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'presentation'), `${feature}ViewModel.kt`),
      content: `package ${pkg}.presentation

import androidx.lifecycle.ViewModel
import ${pkg}.domain.model.${feature}
import ${pkg}.domain.usecase.Get${feature}ListUseCase

class ${feature}ViewModel(
    private val get${feature}ListUseCase: Get${feature}ListUseCase,
) : ViewModel() {
    fun items(): List<${feature}> = get${feature}ListUseCase()
}
`,
    },
  ];
}

function multiModuleBlueprintFiles(ctx: BlueprintContext): Array<{ filePath: string; content: string }> {
  const feature = ctx.featureClassName;
  const pkg = ctx.basePackage;
  const docsPath = path.join(ctx.workspaceRoot, 'docs', 'blueprints');
  if (ctx.language === 'java') {
    return [
      {
        filePath: path.join(buildJavaPath(ctx, 'core', 'common'), 'DispatchersProvider.java'),
        content: `package ${pkg}.core.common;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

public class DispatchersProvider {
    public Executor io() { return Executors.newSingleThreadExecutor(); }
    public Executor main() { return Runnable::run; }
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'feature', ctx.featureName, 'api'), `${feature}Navigator.java`),
        content: `package ${pkg}.feature.${ctx.featureName}.api;

public interface ${feature}Navigator {
    void open${feature}();
}
`,
      },
      {
        filePath: path.join(buildJavaPath(ctx, 'feature', ctx.featureName, 'impl'), `${feature}Coordinator.java`),
        content: `package ${pkg}.feature.${ctx.featureName}.impl;

import ${pkg}.feature.${ctx.featureName}.api.${feature}Navigator;

public class ${feature}Coordinator implements ${feature}Navigator {
    @Override
    public void open${feature}() {
        // TODO: route to feature entry point
    }
}
`,
      },
      {
        filePath: path.join(docsPath, 'multi-module-blueprint.md'),
        content: `# Multi-module Blueprint (Generated)

This project uses a structure-first multi-module blueprint:

- core/common
- feature/${ctx.featureName}/api
- feature/${ctx.featureName}/impl

Suggested next step for real Gradle modules:

1. Create :core:common and :feature:${ctx.featureName} modules.
2. Move generated packages to matching module src roots.
3. Add module dependencies in app/build.gradle(.kts).
`,
      },
    ];
  }
  return [
    {
      filePath: path.join(buildKotlinPath(ctx, 'core', 'common'), 'DispatchersProvider.kt'),
      content: `package ${pkg}.core.common

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

class DispatchersProvider(
    val io: CoroutineDispatcher = Dispatchers.IO,
    val main: CoroutineDispatcher = Dispatchers.Main,
)
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'feature', ctx.featureName, 'api'), `${feature}Navigator.kt`),
      content: `package ${pkg}.feature.${ctx.featureName}.api

interface ${feature}Navigator {
    fun open${feature}()
}
`,
    },
    {
      filePath: path.join(buildKotlinPath(ctx, 'feature', ctx.featureName, 'impl'), `${feature}Coordinator.kt`),
      content: `package ${pkg}.feature.${ctx.featureName}.impl

import ${pkg}.feature.${ctx.featureName}.api.${feature}Navigator

class ${feature}Coordinator : ${feature}Navigator {
    override fun open${feature}() {
        // TODO: route to feature entry point
    }
}
`,
    },
    {
      filePath: path.join(ctx.workspaceRoot, 'docs', 'blueprints', 'multi-module-blueprint.md'),
      content: `# Multi-module Blueprint (Generated)

This project uses a structure-first multi-module blueprint:

- core/common
- feature/${ctx.featureName}/api
- feature/${ctx.featureName}/impl

Suggested next step for real Gradle modules:

1. Create :core:common and :feature:${ctx.featureName} modules.
2. Move generated packages to matching module src roots.
3. Add module dependencies in app/build.gradle(.kts).
`,
    },
  ];
}

async function chooseTemplate(): Promise<BlueprintTemplate | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'MVVM Template', value: 'mvvm' as const, description: 'feature/data/domain/presentation structure + starter classes' },
      { label: 'Clean Architecture Template', value: 'clean' as const, description: 'domain/data/presentation layers + use cases' },
      { label: 'Multi-module Blueprint Template', value: 'multi-module' as const, description: 'core + feature structure and modularization guide' },
    ],
    { placeHolder: 'Select project blueprint template' }
  );
  return pick?.value;
}

async function buildContext(workspaceRoot: string): Promise<BlueprintContext | undefined> {
  const modules = findApplicationModules(workspaceRoot);
  if (modules.length === 0) {
    showWarning('No Android application modules found.');
    return undefined;
  }
  const modulePick = await vscode.window.showQuickPick(
    modules.map(moduleName => ({ label: moduleName, value: moduleName })),
    { placeHolder: 'Select target module for blueprint generation' }
  );
  if (!modulePick) {
    return undefined;
  }
  const moduleName = modulePick.value;
  const moduleRoot = path.join(workspaceRoot, moduleName);
  const languagePick = await vscode.window.showQuickPick(
    [
      { label: 'Kotlin', value: 'kotlin' as const },
      { label: 'Java', value: 'java' as const },
    ],
    {
      placeHolder: 'Select language for generated code',
      title: `Detected: ${detectLanguage(moduleRoot)}`,
    }
  );
  if (!languagePick) {
    return undefined;
  }
  const packageDefault = findApplicationId(workspaceRoot, moduleName) || 'com.example.app';
  const basePackage = await vscode.window.showInputBox({
    prompt: 'Base package for generated blueprint files',
    value: packageDefault,
    validateInput: (value) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value) ? undefined : 'Use lowercase package name (com.example.app)',
  });
  if (!basePackage) {
    return undefined;
  }
  const featureName = await vscode.window.showInputBox({
    prompt: 'Feature name',
    value: 'home',
    validateInput: (value) => /^[a-z][a-z0-9_]*$/.test(value) ? undefined : 'Use lowercase letters, digits, underscore',
  });
  if (!featureName) {
    return undefined;
  }
  const srcRoot = resolveSrcRoot(moduleRoot, languagePick.value);
  return {
    workspaceRoot,
    moduleName,
    basePackage: basePackage.trim(),
    featureName: featureName.trim(),
    featureClassName: toClassName(featureName.trim()),
    srcRoot,
    language: languagePick.value,
  };
}

export async function runProjectBlueprintTemplatesWizard(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    showError('No workspace folder open.');
    return;
  }
  const template = await chooseTemplate();
  if (!template) {
    return;
  }
  const ctx = await buildContext(workspaceRoot);
  if (!ctx) {
    return;
  }
  let files: Array<{ filePath: string; content: string }> = [];
  if (template === 'mvvm') {
    files = mvvmFiles(ctx);
  } else if (template === 'clean') {
    files = cleanFiles(ctx);
  } else {
    files = multiModuleBlueprintFiles(ctx);
  }
  let created = 0;
  let skipped = 0;
  const createdFiles: string[] = [];
  for (const file of files) {
    const status = writeIfMissing(file.filePath, file.content);
    if (status === 'created') {
      created += 1;
      createdFiles.push(file.filePath);
    } else {
      skipped += 1;
    }
  }
  if (created === 0) {
    showWarning('Blueprint generation finished: nothing new created (all files already exist).');
    return;
  }
  showInfo(`Blueprint generated: ${created} file(s) created, ${skipped} skipped.`);
  if (createdFiles.length > 0) {
    const openPick = await vscode.window.showQuickPick(
      createdFiles.map(filePath => ({ label: path.basename(filePath), description: path.relative(workspaceRoot, filePath), filePath })),
      { placeHolder: 'Open generated file (optional)' }
    );
    if (openPick) {
      const document = await vscode.workspace.openTextDocument(openPick.filePath);
      await vscode.window.showTextDocument(document, { preview: false });
    }
  }
}
