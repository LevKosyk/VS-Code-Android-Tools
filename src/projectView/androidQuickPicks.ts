import * as vscode from 'vscode';
import {
  validateResourceName,
  validateFolderName,
  validateLocaleSuffix,
  suggestResourceName,
  RESOURCE_FOLDER_TYPES,
  COMMON_LOCALES,
  ResourceFolderType,
} from './androidValidation';
interface ResourceTypeItem extends vscode.QuickPickItem {
  type: ResourceFolderType;
}
const RESOURCE_TYPE_CONFIGS: ResourceTypeItem[] = [
  {
    type: 'layout',
    label: '$(layout) Layout',
    description: 'XML layout files',
    detail: 'Activity, Fragment, and View layouts',
  },
  {
    type: 'drawable',
    label: '$(file-media) Drawable',
    description: 'Graphics and drawable resources',
    detail: 'Vector drawables, bitmaps, shapes, selectors',
  },
  {
    type: 'values',
    label: '$(symbol-string) Values',
    description: 'String, color, dimension resources',
    detail: 'strings.xml, colors.xml, dimens.xml, styles.xml',
  },
  {
    type: 'mipmap',
    label: '$(file-media) Mipmap',
    description: 'App launcher icons',
    detail: 'Launcher icons at various densities',
  },
  {
    type: 'raw',
    label: '$(file-binary) Raw',
    description: 'Raw asset files',
    detail: 'Audio, video, or other binary files',
  },
  {
    type: 'xml',
    label: '$(code) XML',
    description: 'Arbitrary XML files',
    detail: 'Configuration and data XML files',
  },
  {
    type: 'anim',
    label: '$(play) Anim',
    description: 'View animations',
    detail: 'Tween animations (translate, rotate, scale, alpha)',
  },
  {
    type: 'animator',
    label: '$(play-circle) Animator',
    description: 'Property animations',
    detail: 'ObjectAnimator and ValueAnimator definitions',
  },
  {
    type: 'menu',
    label: '$(list-unordered) Menu',
    description: 'Menu resources',
    detail: 'Options menu, context menu, popup menu',
  },
  {
    type: 'color',
    label: '$(symbol-color) Color',
    description: 'Color state lists',
    detail: 'Color selectors for different states',
  },
  {
    type: 'font',
    label: '$(text-size) Font',
    description: 'Font resources',
    detail: 'Custom font files and font families',
  },
  {
    type: 'navigation',
    label: '$(compass) Navigation',
    description: 'Navigation graphs',
    detail: 'Jetpack Navigation component graphs',
  },
];
export async function pickResourceType(): Promise<ResourceFolderType | undefined> {
  const selected = await vscode.window.showQuickPick(RESOURCE_TYPE_CONFIGS, {
    title: 'Select Resource Type',
    placeHolder: 'Choose the type of Android resource to create',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.type;
}
interface InputNameOptions {
  title?: string;
  prompt?: string;
  placeholder?: string;
  defaultValue?: string;
}
export async function inputResourceName(
  options: InputNameOptions = {}
): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title: options.title || 'Resource Name',
    prompt: options.prompt || 'Enter the resource name (without extension)',
    placeHolder: options.placeholder || 'e.g., activity_main, ic_launcher, strings',
    value: options.defaultValue,
    validateInput: (value) => {
      const result = validateResourceName(value);
      if (!result.isValid) {
        let message = result.error || 'Invalid name';
        if (result.suggestion) {
          message += `. Try: ${result.suggestion}`;
        }
        return message;
      }
      return undefined;
    },
  });
  return name?.trim();
}
export async function inputFolderName(
  options: InputNameOptions = {}
): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title: options.title || 'Folder Name',
    prompt: options.prompt || 'Enter the folder name (e.g., drawable-night, values-es)',
    placeHolder: options.placeholder || 'e.g., drawable-hdpi, layout-land, values-night',
    value: options.defaultValue,
    validateInput: (value) => {
      const result = validateFolderName(value);
      if (!result.isValid) {
        let message = result.error || 'Invalid folder name';
        if (result.suggestion) {
          message += `. Did you mean: ${result.suggestion}?`;
        }
        return message;
      }
      return undefined;
    },
  });
  return name?.trim().toLowerCase();
}
interface LocaleItem extends vscode.QuickPickItem {
  code: string;
}
export async function pickLocale(): Promise<string | undefined> {
  const items: LocaleItem[] = COMMON_LOCALES.map(locale => ({
    label: locale.name,
    description: locale.code,
    code: locale.code,
  }));
  const customOption: LocaleItem = {
    label: '$(edit) Custom Locale...',
    description: 'Enter a custom locale code',
    code: '__custom__',
  };
  const selected = await vscode.window.showQuickPick([customOption, ...items], {
    title: 'Select Language/Locale',
    placeHolder: 'Choose a language or enter custom locale',
    matchOnDescription: true,
  });
  if (!selected) {
    return undefined;
  }
  if (selected.code === '__custom__') {
    return inputCustomLocale();
  }
  return selected.code;
}
async function inputCustomLocale(): Promise<string | undefined> {
  const locale = await vscode.window.showInputBox({
    title: 'Custom Locale',
    prompt: 'Enter locale code (e.g., "es" or "pt-rBR")',
    placeHolder: 'e.g., es, uk, pt-rBR, zh-rTW',
    validateInput: (value) => {
      const result = validateLocaleSuffix(value);
      if (!result.isValid) {
        return result.error;
      }
      return undefined;
    },
  });
  return locale?.trim();
}
interface ValuesFileItem extends vscode.QuickPickItem {
  fileName: string;
  template: string;
}
const VALUES_FILE_TYPES: ValuesFileItem[] = [
  {
    label: '$(symbol-string) strings.xml',
    description: 'String resources',
    fileName: 'strings.xml',
    template: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Add your localized strings here -->
</resources>
`,
  },
  {
    label: '$(array) arrays.xml',
    description: 'Array resources',
    fileName: 'arrays.xml',
    template: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Add your localized arrays here -->
</resources>
`,
  },
  {
    label: '$(list-ordered) plurals.xml',
    description: 'Plural string resources',
    fileName: 'plurals.xml',
    template: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Add your localized plurals here -->
</resources>
`,
  },
];
export async function pickValuesFile(): Promise<ValuesFileItem | undefined> {
  return vscode.window.showQuickPick(VALUES_FILE_TYPES, {
    title: 'Select Values File',
    placeHolder: 'Choose which file to create for this locale',
  });
}
export function getResourceTemplate(type: ResourceFolderType, fileName: string): string {
  switch (type) {
    case 'layout':
      return `<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
</androidx.constraintlayout.widget.ConstraintLayout>
`;
    case 'drawable':
      if (fileName.endsWith('.xml')) {
        return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
</vector>
`;
      }
      return '';
    case 'values':
      if (fileName.includes('strings')) {
        return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">My App</string>
</resources>
`;
      }
      if (fileName.includes('colors')) {
        return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="primary">#6200EE</color>
    <color name="primary_variant">#3700B3</color>
    <color name="secondary">#03DAC6</color>
</resources>
`;
      }
      if (fileName.includes('dimens')) {
        return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="spacing_small">8dp</dimen>
    <dimen name="spacing_medium">16dp</dimen>
    <dimen name="spacing_large">24dp</dimen>
</resources>
`;
      }
      if (fileName.includes('styles') || fileName.includes('themes')) {
        return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.MaterialComponents.DayNight.DarkActionBar">
        <!-- Customize your theme here -->
    </style>
</resources>
`;
      }
      return `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>
`;
    case 'menu':
      return `<?xml version="1.0" encoding="utf-8"?>
<menu xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto">
</menu>
`;
    case 'anim':
      return `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android">
</set>
`;
    case 'animator':
      return `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android">
</set>
`;
    case 'color':
      return `<?xml version="1.0" encoding="utf-8"?>
<selector xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:color="#000000" android:state_enabled="true"/>
    <item android:color="#808080" android:state_enabled="false"/>
</selector>
`;
    case 'xml':
      return `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>
`;
    case 'navigation':
      return `<?xml version="1.0" encoding="utf-8"?>
<navigation xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:id="@+id/nav_graph">
</navigation>
`;
    default:
      return `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>
`;
  }
}
export async function confirmOverwrite(filePath: string): Promise<boolean> {
  const result = await vscode.window.showWarningMessage(
    `File already exists: ${filePath}`,
    { modal: true },
    'Overwrite',
    'Cancel'
  );
  return result === 'Overwrite';
}
export async function showCreationError(
  message: string,
  action?: { label: string; callback: () => void }
): Promise<void> {
  if (action) {
    const result = await vscode.window.showErrorMessage(message, action.label);
    if (result === action.label) {
      action.callback();
    }
  } else {
    vscode.window.showErrorMessage(message);
  }
}
