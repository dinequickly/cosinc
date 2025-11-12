import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BrowserTab {
  title: string;
  url: string;
  domain: string;
  browser?: string;
}

export class BrowserTabCapture {
  private readonly timeout = 1000; // 1 second timeout

  /**
   * Capture all browser tabs from supported browsers (macOS only)
   */
  async captureTabs(): Promise<BrowserTab[]> {
    console.log('[BrowserTabCapture] Starting browser tab capture...');

    const browsers = [
      { name: 'Chrome', method: () => this.captureChromeTabs() },
      { name: 'Safari', method: () => this.captureSafariTabs() },
      { name: 'Firefox', method: () => this.captureFirefoxTabs() },
      { name: 'Edge', method: () => this.captureEdgeTabs() }
    ];

    // Run all browser captures in parallel
    const results = await Promise.allSettled(
      browsers.map(browser => browser.method())
    );

    // Collect successful results
    const allTabs: BrowserTab[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        console.log(`[BrowserTabCapture] ${browsers[index].name}: ${result.value.length} tabs`);
        allTabs.push(...result.value);
      } else if (result.status === 'rejected') {
        console.log(`[BrowserTabCapture] ${browsers[index].name}: failed -`, result.reason);
      }
    });

    // Deduplicate by URL
    const uniqueTabs = this.deduplicateTabs(allTabs);

    console.log('[BrowserTabCapture] Total unique tabs captured:', uniqueTabs.length);
    return uniqueTabs.slice(0, 50); // Limit to 50 tabs
  }

  /**
   * Capture Chrome tabs
   */
  private async captureChromeTabs(): Promise<BrowserTab[]> {
    const script = `
      tell application "Google Chrome"
        if it is running then
          set tabList to {}
          repeat with w in windows
            repeat with t in tabs of w
              set end of tabList to {URL of t, title of t}
            end repeat
          end repeat
          return tabList
        end if
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      return this.parseAppleScriptTabOutput(stdout, 'Chrome');
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        console.log('[BrowserTabCapture] Chrome capture timed out');
      }
      return [];
    }
  }

  /**
   * Capture Safari tabs
   */
  private async captureSafariTabs(): Promise<BrowserTab[]> {
    const script = `
      tell application "Safari"
        if it is running then
          set tabList to {}
          repeat with w in windows
            repeat with t in tabs of w
              set end of tabList to {URL of t, name of t}
            end repeat
          end repeat
          return tabList
        end if
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      return this.parseAppleScriptTabOutput(stdout, 'Safari');
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        console.log('[BrowserTabCapture] Safari capture timed out');
      }
      return [];
    }
  }

  /**
   * Capture Firefox tabs
   */
  private async captureFirefoxTabs(): Promise<BrowserTab[]> {
    const script = `
      tell application "Firefox"
        if it is running then
          set tabList to {}
          -- Firefox AppleScript support is limited, may not work
          return tabList
        end if
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      return this.parseAppleScriptTabOutput(stdout, 'Firefox');
    } catch (error) {
      // Firefox has limited AppleScript support, expected to fail often
      return [];
    }
  }

  /**
   * Capture Edge tabs
   */
  private async captureEdgeTabs(): Promise<BrowserTab[]> {
    const script = `
      tell application "Microsoft Edge"
        if it is running then
          set tabList to {}
          repeat with w in windows
            repeat with t in tabs of w
              set end of tabList to {URL of t, title of t}
            end repeat
          end repeat
          return tabList
        end if
      end tell
    `;

    try {
      const { stdout } = await this.execWithTimeout(`osascript -e '${script}'`);
      return this.parseAppleScriptTabOutput(stdout, 'Edge');
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        console.log('[BrowserTabCapture] Edge capture timed out');
      }
      return [];
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

  /**
   * Parse AppleScript output into BrowserTab objects
   */
  private parseAppleScriptTabOutput(output: string, browser: string): BrowserTab[] {
    if (!output || output.trim() === '') {
      return [];
    }

    try {
      // AppleScript returns comma-separated pairs: url1, title1, url2, title2, ...
      const parts = output.split(',').map(s => s.trim());
      const tabs: BrowserTab[] = [];

      for (let i = 0; i < parts.length - 1; i += 2) {
        const url = parts[i];
        const title = parts[i + 1];

        if (url && title) {
          try {
            const urlObj = new URL(url);
            tabs.push({
              url,
              title,
              domain: urlObj.hostname,
              browser
            });
          } catch (error) {
            // Invalid URL, skip
            console.log(`[BrowserTabCapture] Invalid URL: ${url}`);
          }
        }
      }

      return tabs;
    } catch (error) {
      console.error('[BrowserTabCapture] Error parsing AppleScript output:', error);
      return [];
    }
  }

  /**
   * Deduplicate tabs by URL
   */
  private deduplicateTabs(tabs: BrowserTab[]): BrowserTab[] {
    const seen = new Set<string>();
    const unique: BrowserTab[] = [];

    for (const tab of tabs) {
      if (!seen.has(tab.url)) {
        seen.add(tab.url);
        unique.push(tab);
      }
    }

    return unique;
  }
}
