import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ActiveWindowInfo {
  app: string;
  title: string;
  bundleId?: string;
}

export class ActiveWindowCapture {
  private readonly timeout = 500; // 500ms timeout

  /**
   * Capture information about the currently active window (macOS only)
   */
  async captureActiveWindow(): Promise<ActiveWindowInfo | null> {
    console.log('[ActiveWindowCapture] Capturing active window info...');

    try {
      // Run both captures in parallel
      const [appInfo, windowTitle] = await Promise.all([
        this.getFrontmostApp(),
        this.getWindowTitle()
      ]);

      if (!appInfo) {
        console.log('[ActiveWindowCapture] Could not determine frontmost app');
        return null;
      }

      const result: ActiveWindowInfo = {
        app: appInfo.name,
        title: windowTitle || 'Unknown',
        bundleId: appInfo.bundleId
      };

      console.log('[ActiveWindowCapture] Captured:', result);
      return result;
    } catch (error) {
      console.error('[ActiveWindowCapture] Error capturing active window:', error);
      return null;
    }
  }

  /**
   * Get the frontmost application using AppleScript
   */
  private async getFrontmostApp(): Promise<{ name: string; bundleId?: string } | null> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set bundleID to bundle identifier of frontApp
        return appName & "|" & bundleID
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      const parts = stdout.trim().split('|');

      return {
        name: parts[0] || 'Unknown',
        bundleId: parts[1] || undefined
      };
    } catch (error) {
      console.error('[ActiveWindowCapture] Error getting frontmost app:', error);
      return null;
    }
  }

  /**
   * Get the title of the active window using AppleScript
   */
  private async getWindowTitle(): Promise<string | null> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        try
          set windowTitle to name of front window of frontApp
          return windowTitle
        on error
          return ""
        end try
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      const title = stdout.trim();
      return title || null;
    } catch (error) {
      console.error('[ActiveWindowCapture] Error getting window title:', error);
      return null;
    }
  }

  /**
   * Execute command with timeout
   */
  private async execWithTimeout(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, this.timeout);

      exec(command, (error, stdout, stderr) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
