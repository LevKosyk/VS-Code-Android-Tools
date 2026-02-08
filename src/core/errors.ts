export class AndroidToolsError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'AndroidToolsError';
  }
  toNotification(): string {
    return this.suggestion
      ? `${this.userMessage}\n\n${this.suggestion}`
      : this.userMessage;
  }
}
export class SdkNotFoundError extends AndroidToolsError {
  constructor(searchedPaths: string[]) {
    const paths = searchedPaths.join(', ');
    super(
      `Android SDK not found. Searched: ${paths}`,
      'Android SDK not found.',
      'Set ANDROID_SDK_ROOT or ANDROID_HOME environment variable, or install Android SDK to a default location.'
    );
    this.name = 'SdkNotFoundError';
  }
}
export class AdbError extends AndroidToolsError {
  constructor(
    command: string,
    public readonly stderr: string,
    public readonly exitCode: number | null
  ) {
    super(
      `ADB command failed: ${command} (exit: ${exitCode})`,
      `ADB command failed: ${command}`,
      stderr || 'Check that ADB is running and devices are properly connected.'
    );
    this.name = 'AdbError';
  }
}
export class EmulatorError extends AndroidToolsError {
  constructor(
    message: string,
    userMessage: string,
    suggestion?: string
  ) {
    super(message, userMessage, suggestion);
    this.name = 'EmulatorError';
  }
  static notFound(avdName: string): EmulatorError {
    return new EmulatorError(
      `AVD not found: ${avdName}`,
      `Emulator "${avdName}" not found.`,
      'Run "Android: Create Emulator" to create a new AVD.'
    );
  }
  static alreadyRunning(avdName: string): EmulatorError {
    return new EmulatorError(
      `AVD already running: ${avdName}`,
      `Emulator "${avdName}" is already running.`,
      'Use "Android: Stop Emulator" first if you want to restart it.'
    );
  }
  static bootTimeout(avdName: string): EmulatorError {
    return new EmulatorError(
      `Boot timeout for AVD: ${avdName}`,
      `Emulator "${avdName}" took too long to boot.`,
      'The emulator may still be starting. Check the emulator window.'
    );
  }
  static noSystemImages(): EmulatorError {
    return new EmulatorError(
      'No system images available',
      'No Android system images found.',
      'Install system images using Android SDK Manager:\nsdkmanager "system-images;android-34;google_apis;x86_64"'
    );
  }
  static creationFailed(name: string, stderr: string): EmulatorError {
    return new EmulatorError(
      `Failed to create AVD: ${name}`,
      `Failed to create emulator "${name}".`,
      stderr || 'Check that the selected system image is installed.'
    );
  }
}
export class AvdManagerError extends AndroidToolsError {
  constructor(
    command: string,
    public readonly stderr: string
  ) {
    super(
      `avdmanager command failed: ${command}`,
      'AVD Manager command failed.',
      stderr || 'Ensure Android SDK command-line tools are installed.'
    );
    this.name = 'AvdManagerError';
  }
}
