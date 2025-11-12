import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface CaptureRecord {
  id: string;
  timestamp: number;
  app_name: string;
  window_title: string;
  tabs_count: number;
  has_clipboard: number; // 0 or 1
  screenshot_path: string;
  json_path: string;
  webhook_sent: number; // 0 or 1
  webhook_sent_at: number | null;
}

export interface CaptureInsertData {
  id: string;
  timestamp: number;
  appName: string;
  windowTitle: string;
  tabsCount: number;
  hasClipboard: boolean;
  screenshotPath: string;
  jsonPath: string;
}

export class DatabaseHelper {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'cosinc.db');

    console.log('[DatabaseHelper] Initializing database at:', this.dbPath);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Initialize schema
    this.initializeSchema();
  }

  private initializeSchema(): void {
    console.log('[DatabaseHelper] Initializing schema...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        tabs_count INTEGER DEFAULT 0,
        has_clipboard INTEGER DEFAULT 0,
        screenshot_path TEXT NOT NULL,
        json_path TEXT NOT NULL,
        webhook_sent INTEGER DEFAULT 0,
        webhook_sent_at INTEGER
      )
    `;

    this.db.exec(createTableSQL);

    // Create index for faster queries
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_timestamp ON captures(timestamp DESC)
    `;

    this.db.exec(createIndexSQL);

    console.log('[DatabaseHelper] Schema initialized successfully');
  }

  /**
   * Insert a new capture record
   */
  insertCapture(data: CaptureInsertData): void {
    console.log('[DatabaseHelper] Inserting capture:', data.id);

    const stmt = this.db.prepare(`
      INSERT INTO captures (
        id, timestamp, app_name, window_title, tabs_count,
        has_clipboard, screenshot_path, json_path, webhook_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      data.id,
      data.timestamp,
      data.appName,
      data.windowTitle,
      data.tabsCount,
      data.hasClipboard ? 1 : 0,
      data.screenshotPath,
      data.jsonPath
    );

    console.log('[DatabaseHelper] Capture inserted successfully');
  }

  /**
   * Get all captures, ordered by timestamp (newest first)
   */
  getCaptures(limit: number = 100): CaptureRecord[] {
    console.log('[DatabaseHelper] Fetching captures with limit:', limit);

    const stmt = this.db.prepare(`
      SELECT * FROM captures
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as CaptureRecord[];
    console.log('[DatabaseHelper] Found', rows.length, 'captures');

    return rows;
  }

  /**
   * Get a single capture by ID
   */
  getCapture(id: string): CaptureRecord | null {
    console.log('[DatabaseHelper] Fetching capture:', id);

    const stmt = this.db.prepare('SELECT * FROM captures WHERE id = ?');
    const row = stmt.get(id) as CaptureRecord | undefined;

    return row || null;
  }

  /**
   * Update webhook sent status
   */
  updateWebhookStatus(id: string, sent: boolean): void {
    console.log('[DatabaseHelper] Updating webhook status for:', id, 'sent:', sent);

    const stmt = this.db.prepare(`
      UPDATE captures
      SET webhook_sent = ?, webhook_sent_at = ?
      WHERE id = ?
    `);

    stmt.run(sent ? 1 : 0, sent ? Date.now() : null, id);
  }

  /**
   * Delete a capture by ID
   */
  deleteCapture(id: string): void {
    console.log('[DatabaseHelper] Deleting capture:', id);

    const stmt = this.db.prepare('DELETE FROM captures WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Delete captures older than specified days
   */
  deleteOldCaptures(daysOld: number = 30): number {
    console.log('[DatabaseHelper] Deleting captures older than', daysOld, 'days');

    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare('DELETE FROM captures WHERE timestamp < ?');
    const result = stmt.run(cutoffTime);

    console.log('[DatabaseHelper] Deleted', result.changes, 'old captures');

    return result.changes;
  }

  /**
   * Get captures that haven't been sent to webhook
   */
  getUnsentCaptures(): CaptureRecord[] {
    console.log('[DatabaseHelper] Fetching unsent captures');

    const stmt = this.db.prepare(`
      SELECT * FROM captures
      WHERE webhook_sent = 0
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all() as CaptureRecord[];
    console.log('[DatabaseHelper] Found', rows.length, 'unsent captures');

    return rows;
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum(): void {
    console.log('[DatabaseHelper] Running VACUUM...');
    this.db.exec('VACUUM');
    console.log('[DatabaseHelper] VACUUM completed');
  }

  /**
   * Close the database connection
   */
  close(): void {
    console.log('[DatabaseHelper] Closing database connection');
    this.db.close();
  }

  /**
   * Get database statistics
   */
  getStats(): { totalCaptures: number; unsentCaptures: number; dbSizeKB: number } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM captures');
    const unsentStmt = this.db.prepare('SELECT COUNT(*) as count FROM captures WHERE webhook_sent = 0');

    const totalResult = totalStmt.get() as { count: number };
    const unsentResult = unsentStmt.get() as { count: number };

    // Get file size
    let dbSizeKB = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      dbSizeKB = Math.round(stats.size / 1024);
    } catch (error) {
      console.error('[DatabaseHelper] Error getting DB file size:', error);
    }

    return {
      totalCaptures: totalResult.count,
      unsentCaptures: unsentResult.count,
      dbSizeKB
    };
  }
}
