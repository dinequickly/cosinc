import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import screenshot from 'screenshot-desktop';
import { BrowserTabCapture, BrowserTab } from './BrowserTabCapture';
import { ActiveWindowCapture, ActiveWindowInfo } from './ActiveWindowCapture';
import { ClipboardCapture, ClipboardContent } from './ClipboardCapture';
import { WebhookService, WebhookPayload } from './WebhookService';
import { DatabaseHelper } from '../DatabaseHelper';

export interface CapturedContext {
  id: string;
  timestamp: Date;
  activeWindow: {
    app: string;
    title: string;
    bundleId?: string;
    screenshot?: string; // base64 encoded
  };
  browserTabs: BrowserTab[];
  clipboard: ClipboardContent | null;
  metadata: {
    os: string;
    captureMethod: 'hotkey' | 'manual';
    processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  };
}

export interface CaptureResult {
  success: boolean;
  captureId?: string;
  error?: string;
}

export class ContextAggregator {
  private browserTabCapture: BrowserTabCapture;
  private activeWindowCapture: ActiveWindowCapture;
  private clipboardCapture: ClipboardCapture;
  private webhookService: WebhookService;
  private database: DatabaseHelper;

  private capturesDir: string;
  private screenshotsDir: string;

  // Keep track of the most recent capture
  private latestCapture: CapturedContext | null = null;

  constructor(database: DatabaseHelper) {
    this.database = database;
    this.browserTabCapture = new BrowserTabCapture();
    this.activeWindowCapture = new ActiveWindowCapture();
    this.clipboardCapture = new ClipboardCapture();
    this.webhookService = new WebhookService();

    // Setup directories
    const userDataPath = app.getPath('userData');
    this.capturesDir = path.join(userDataPath, 'captures');
    this.screenshotsDir = path.join(userDataPath, 'capture_screenshots');

    // Create directories if they don't exist
    fs.mkdirSync(this.capturesDir, { recursive: true });
    fs.mkdirSync(this.screenshotsDir, { recursive: true });

    console.log('[ContextAggregator] Initialized');
    console.log('[ContextAggregator] Captures directory:', this.capturesDir);
    console.log('[ContextAggregator] Screenshots directory:', this.screenshotsDir);
  }

  /**
   * Capture all context data
   */
  async captureContext(
    captureMethod: 'hotkey' | 'manual' = 'hotkey',
    hideWindow?: () => void,
    showWindow?: () => void
  ): Promise<CaptureResult> {
    const captureId = uuidv4();
    const timestamp = new Date();

    console.log('[ContextAggregator] Starting capture:', captureId);
    console.log('[ContextAggregator] Method:', captureMethod);

    try {
      // Step 1: Capture active window info (before screenshot)
      console.log('[ContextAggregator] Capturing active window info...');
      const activeWindowPromise = this.activeWindowCapture.captureActiveWindow();

      // Step 2: Capture browser tabs
      console.log('[ContextAggregator] Capturing browser tabs...');
      const browserTabsPromise = this.browserTabCapture.captureTabs();

      // Step 3: Capture clipboard
      console.log('[ContextAggregator] Capturing clipboard...');
      const clipboardContent = this.clipboardCapture.captureClipboard();

      // Wait for active window and browser tabs (can run in parallel)
      const [activeWindow, browserTabs] = await Promise.all([
        activeWindowPromise,
        browserTabsPromise
      ]);

      // Step 4: Take screenshot (after getting window info, but needs to hide window)
      console.log('[ContextAggregator] Taking screenshot...');
      let screenshotBase64: string | undefined;
      let screenshotPath = '';

      try {
        if (hideWindow) hideWindow();
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for window to hide

        screenshotPath = path.join(this.screenshotsDir, `${captureId}.png`);
        await screenshot({ filename: screenshotPath });

        // Convert to base64
        const screenshotBuffer = await fs.promises.readFile(screenshotPath);
        screenshotBase64 = screenshotBuffer.toString('base64');

        console.log('[ContextAggregator] Screenshot captured:', screenshotPath);
      } catch (error) {
        console.error('[ContextAggregator] Error taking screenshot:', error);
        // Continue without screenshot
      } finally {
        if (showWindow) showWindow();
      }

      // Build captured context
      const capturedContext: CapturedContext = {
        id: captureId,
        timestamp,
        activeWindow: {
          app: activeWindow?.app || 'Unknown',
          title: activeWindow?.title || 'Unknown',
          bundleId: activeWindow?.bundleId,
          screenshot: screenshotBase64
        },
        browserTabs,
        clipboard: clipboardContent,
        metadata: {
          os: process.platform,
          captureMethod,
          processingStatus: 'pending'
        }
      };

      this.latestCapture = capturedContext;

      // Step 5: Save to JSON file
      console.log('[ContextAggregator] Saving to JSON...');
      const jsonPath = path.join(this.capturesDir, `${captureId}.json`);
      await fs.promises.writeFile(jsonPath, JSON.stringify(capturedContext, null, 2));

      // Step 6: Save to database
      console.log('[ContextAggregator] Saving to database...');
      this.database.insertCapture({
        id: captureId,
        timestamp: timestamp.getTime(),
        appName: activeWindow?.app || 'Unknown',
        windowTitle: activeWindow?.title || 'Unknown',
        tabsCount: browserTabs.length,
        hasClipboard: clipboardContent !== null,
        screenshotPath,
        jsonPath
      });

      // Step 7: Send to webhook (async, don't wait)
      console.log('[ContextAggregator] Sending to webhook...');
      this.sendToWebhook(captureId, capturedContext).catch(error => {
        console.error('[ContextAggregator] Webhook send error:', error);
      });

      console.log('[ContextAggregator] Capture complete!');
      console.log('[ContextAggregator] - Browser tabs:', browserTabs.length);
      console.log('[ContextAggregator] - Clipboard:', clipboardContent ? 'yes' : 'no');
      console.log('[ContextAggregator] - Screenshot:', screenshotBase64 ? 'yes' : 'no');

      return {
        success: true,
        captureId
      };
    } catch (error) {
      console.error('[ContextAggregator] Capture failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send captured context to webhook
   */
  private async sendToWebhook(captureId: string, context: CapturedContext): Promise<void> {
    const payload: WebhookPayload = {
      id: context.id,
      timestamp: context.timestamp,
      activeWindow: context.activeWindow,
      browserTabs: context.browserTabs,
      clipboard: context.clipboard
    };

    const result = await this.webhookService.send(payload);

    // Update database
    this.database.updateWebhookStatus(captureId, result.success);

    if (result.success) {
      console.log('[ContextAggregator] Webhook sent successfully');
    } else {
      console.error('[ContextAggregator] Webhook send failed:', result.error);
    }
  }

  /**
   * Get latest capture
   */
  getLatestCapture(): CapturedContext | null {
    return this.latestCapture;
  }

  /**
   * Load a capture from disk
   */
  async loadCapture(captureId: string): Promise<CapturedContext | null> {
    try {
      const jsonPath = path.join(this.capturesDir, `${captureId}.json`);
      const jsonContent = await fs.promises.readFile(jsonPath, 'utf-8');
      const capture = JSON.parse(jsonContent) as CapturedContext;

      // Convert timestamp string back to Date if needed
      if (typeof capture.timestamp === 'string') {
        capture.timestamp = new Date(capture.timestamp);
      }

      return capture;
    } catch (error) {
      console.error('[ContextAggregator] Error loading capture:', error);
      return null;
    }
  }

  /**
   * Delete a capture (JSON, screenshot, and database record)
   */
  async deleteCapture(captureId: string): Promise<{ success: boolean; error?: string }> {
    console.log('[ContextAggregator] Deleting capture:', captureId);

    try {
      // Get record from database first
      const record = this.database.getCapture(captureId);

      // Delete JSON file
      const jsonPath = path.join(this.capturesDir, `${captureId}.json`);
      try {
        await fs.promises.unlink(jsonPath);
      } catch (error) {
        console.log('[ContextAggregator] JSON file not found:', jsonPath);
      }

      // Delete screenshot file
      if (record?.screenshot_path) {
        try {
          await fs.promises.unlink(record.screenshot_path);
        } catch (error) {
          console.log('[ContextAggregator] Screenshot file not found:', record.screenshot_path);
        }
      }

      // Delete database record
      this.database.deleteCapture(captureId);

      console.log('[ContextAggregator] Capture deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('[ContextAggregator] Error deleting capture:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Retry sending a capture to webhook
   */
  async retryWebhook(captureId: string): Promise<{ success: boolean; error?: string }> {
    console.log('[ContextAggregator] Retrying webhook for:', captureId);

    try {
      const capture = await this.loadCapture(captureId);
      if (!capture) {
        return { success: false, error: 'Capture not found' };
      }

      await this.sendToWebhook(captureId, capture);
      return { success: true };
    } catch (error) {
      console.error('[ContextAggregator] Error retrying webhook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cleanup old captures (older than specified days)
   */
  async cleanupOldCaptures(daysOld: number = 30): Promise<number> {
    console.log('[ContextAggregator] Cleaning up captures older than', daysOld, 'days');

    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    // Get all captures from database
    const allCaptures = this.database.getCaptures(1000); // Get up to 1000
    let deletedCount = 0;

    for (const capture of allCaptures) {
      if (capture.timestamp < cutoffTime) {
        await this.deleteCapture(capture.id);
        deletedCount++;
      }
    }

    // Also vacuum the database to reclaim space
    if (deletedCount > 0) {
      this.database.vacuum();
    }

    console.log('[ContextAggregator] Cleaned up', deletedCount, 'old captures');
    return deletedCount;
  }
}
