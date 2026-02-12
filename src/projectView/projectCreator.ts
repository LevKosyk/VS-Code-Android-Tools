import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execCommand } from '../core/cli';
import { showError, showWarning } from '../ui/notifications';

function validatePackageName(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Package name is required';
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)) {
    return 'Use lowercase dot-separated package name (e.g. com.example.app)';
  }
  return undefined;
}

function validateNumber(value: string, min: number, max: number): string | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 'Enter a valid number';
  }
  if (parsed < min || parsed > max) {
    return `Enter a value between ${min} and ${max}`;
  }
  return undefined;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

export async function createAndroidProjectWizard(): Promise<void> {
  const targetDirPick = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select parent folder for the new project',
  });
  if (!targetDirPick || !targetDirPick[0]) {
    return;
  }
  const parentDir = targetDirPick[0].fsPath;
  const projectName = await vscode.window.showInputBox({
    title: 'New Android Project (1/5)',
    prompt: 'Project name',
    placeHolder: 'MyApplication',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Project name is required';
      }
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
        return 'Use letters, numbers, hyphen or underscore';
      }
      return undefined;
    },
  });
  if (!projectName) {
    return;
  }
  const projectDir = path.join(parentDir, projectName);
  if (fs.existsSync(projectDir)) {
    showError('A folder with that project name already exists.');
    return;
  }
  const appName = await vscode.window.showInputBox({
    title: 'New Android Project (2/5)',
    prompt: 'App name (display name)',
    placeHolder: projectName,
  });
  if (!appName) {
    return;
  }
  const packageName = await vscode.window.showInputBox({
    title: 'New Android Project (3/5)',
    prompt: 'Package name',
    placeHolder: 'com.example.app',
    validateInput: validatePackageName,
  });
  if (!packageName) {
    return;
  }
  const languagePick = await vscode.window.showQuickPick(
    [
      { label: 'Kotlin', value: 'kotlin' },
      { label: 'Java', value: 'java' },
    ],
    { title: 'New Android Project (4/5)', placeHolder: 'Select language' }
  );
  if (!languagePick) {
    return;
  }
  const minSdkInput = await vscode.window.showInputBox({
    title: 'New Android Project (5/5)',
    prompt: 'Min SDK',
    value: '24',
    validateInput: (value) => validateNumber(value, 16, 35),
  });
  if (!minSdkInput) {
    return;
  }
  const targetSdkInput = await vscode.window.showInputBox({
    title: 'New Android Project (5/5)',
    prompt: 'Target SDK',
    value: '34',
    validateInput: (value) => validateNumber(value, 21, 35),
  });
  if (!targetSdkInput) {
    return;
  }
  const minSdk = parseInt(minSdkInput, 10);
  const targetSdk = parseInt(targetSdkInput, 10);
  const isKotlin = languagePick.value === 'kotlin';
  const srcRoot = path.join(
    projectDir,
    'app',
    'src',
    'main',
    isKotlin ? 'kotlin' : 'java',
    ...packageName.split('.')
  );
  const activityFile = isKotlin ? 'MainActivity.kt' : 'MainActivity.java';
  const activityContent = isKotlin
    ? `package ${packageName}

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
    }
}
`
    : `package ${packageName};

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }
}
`;
  const manifestContent = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="${appName}"
        android:theme="@style/Theme.App">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
  const layoutContent = `<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <TextView
        android:id="@+id/hello"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Hello Android Sidecar"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"/>

</androidx.constraintlayout.widget.ConstraintLayout>
`;
  const stringsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
</resources>
`;
  const themeContent = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="Theme.App" parent="Theme.Material3.DayNight.NoActionBar">
        <item name="android:statusBarColor" tools:targetApi="l">?attr/colorPrimaryVariant</item>
    </style>
</resources>
`;
  const settingsGradle = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${projectName}"
include(":app")
`;
  const rootGradle = `plugins {
    id "com.android.application" version "8.2.2" apply false
    id "org.jetbrains.kotlin.android" version "1.9.22" apply false
}
`;
  const appGradle = `plugins {
    id "com.android.application"
${isKotlin ? '    id "org.jetbrains.kotlin.android"' : ''}
}

android {
    namespace "${packageName}"
    compileSdk ${targetSdk}

    defaultConfig {
        applicationId "${packageName}"
        minSdk ${minSdk}
        targetSdk ${targetSdk}
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
${isKotlin ? '    kotlinOptions { jvmTarget = "17" }' : ''}
}

dependencies {
    implementation "androidx.core:core-ktx:1.12.0"
    implementation "androidx.appcompat:appcompat:1.6.1"
    implementation "com.google.android.material:material:1.11.0"
    implementation "androidx.constraintlayout:constraintlayout:2.1.4"
}
`;
  const gradleProperties = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;
  try {
    await writeFile(path.join(projectDir, 'settings.gradle'), settingsGradle);
    await writeFile(path.join(projectDir, 'build.gradle'), rootGradle);
    await writeFile(path.join(projectDir, 'gradle.properties'), gradleProperties);
    await writeFile(path.join(projectDir, 'app', 'build.gradle'), appGradle);
    await writeFile(path.join(projectDir, 'app', 'proguard-rules.pro'), '# Add your ProGuard rules here\n');
    await writeFile(path.join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml'), manifestContent);
    await writeFile(path.join(projectDir, 'app', 'src', 'main', 'res', 'layout', 'activity_main.xml'), layoutContent);
    await writeFile(path.join(projectDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'), stringsContent);
    await writeFile(path.join(projectDir, 'app', 'src', 'main', 'res', 'values', 'themes.xml'), themeContent);
    await writeFile(path.join(srcRoot, activityFile), activityContent);
    await ensureDir(path.join(projectDir, 'app', 'src', 'main', 'res', 'drawable'));
    await ensureDir(path.join(projectDir, 'app', 'src', 'main', 'assets'));

    const gradleCheck = await execCommand('gradle', ['-v'], { cwd: projectDir, timeout: 10_000 });
    if (gradleCheck.exitCode === 0) {
      await execCommand('gradle', ['wrapper', '--gradle-version', '8.5'], {
        cwd: projectDir,
        timeout: 60_000,
      });
    } else {
      showWarning('Gradle not found. Project created without Gradle wrapper.');
    }
    const open = await vscode.window.showInformationMessage(
      `Project "${projectName}" created. Open it now?`,
      'Open',
      'Later'
    );
    if (open === 'Open') {
      const uri = vscode.Uri.file(projectDir);
      vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    }
  } catch (error) {
    showError(
      `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
