// Capture system TypeScript interfaces

export interface BrowserTab {
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  lastAccessed?: Date;
}

export interface ActiveWindow {
  app: string;
  title: string;
  bundleId?: string;
  screenshot?: string; // base64 or file path
}

export interface ClipboardContent {
  text: string;
  type: 'plain' | 'html';
}

export interface CapturedContext {
  id: string; // UUID
  timestamp: Date;
  activeWindow: ActiveWindow;
  browserTabs: BrowserTab[];
  clipboard: ClipboardContent | null;
  metadata: {
    os: string;
    captureMethod: 'hotkey' | 'manual';
    processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  };
}

export interface CaptureRecord {
  id: string;
  timestamp: number; // Unix timestamp
  app_name: string;
  window_title: string;
  tabs_count: number;
  has_clipboard: number; // 0 or 1 (SQLite boolean)
  screenshot_path: string;
  json_path: string;
  webhook_sent: number; // 0 or 1
  webhook_sent_at: number | null;
}

export interface CaptureListItem {
  id: string;
  timestamp: Date;
  appName: string;
  windowTitle: string;
  tabsCount: number;
  hasClipboard: boolean;
  webhookSent: boolean;
  thumbnailPath?: string;
}
