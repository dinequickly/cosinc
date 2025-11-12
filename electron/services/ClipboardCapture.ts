import { clipboard } from 'electron';

export interface ClipboardContent {
  text: string;
  type: 'plain' | 'html';
}

export class ClipboardCapture {
  private readonly maxLength = 10000; // 10,000 characters max

  /**
   * Capture current clipboard content
   */
  captureClipboard(): ClipboardContent | null {
    console.log('[ClipboardCapture] Capturing clipboard content...');

    try {
      // Try to read HTML first
      const htmlText = clipboard.readHTML();
      if (htmlText && htmlText.trim().length > 0) {
        const sanitized = this.sanitizeText(htmlText);
        if (sanitized) {
          console.log('[ClipboardCapture] Captured HTML content:', sanitized.length, 'chars');
          return {
            text: sanitized,
            type: 'html'
          };
        }
      }

      // Fall back to plain text
      const plainText = clipboard.readText();
      if (plainText && plainText.trim().length > 0) {
        const sanitized = this.sanitizeText(plainText);
        if (sanitized) {
          console.log('[ClipboardCapture] Captured plain text:', sanitized.length, 'chars');
          return {
            text: sanitized,
            type: 'plain'
          };
        }
      }

      console.log('[ClipboardCapture] Clipboard is empty or contains non-text content');
      return null;
    } catch (error) {
      console.error('[ClipboardCapture] Error reading clipboard:', error);
      return null;
    }
  }

  /**
   * Sanitize text content
   * - Remove null characters
   * - Remove control characters (except newlines and tabs)
   * - Limit length
   */
  private sanitizeText(text: string): string | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    // Remove null characters
    let sanitized = text.replace(/\0/g, '');

    // Remove control characters except newlines (\n), carriage returns (\r), and tabs (\t)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > this.maxLength) {
      sanitized = sanitized.substring(0, this.maxLength) + '... [truncated]';
    }

    return sanitized.length > 0 ? sanitized : null;
  }

  /**
   * Check if clipboard contains text
   */
  hasTextContent(): boolean {
    try {
      const text = clipboard.readText();
      return text && text.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get clipboard content preview (first 100 characters)
   */
  getPreview(): string | null {
    const content = this.captureClipboard();
    if (!content) {
      return null;
    }

    if (content.text.length <= 100) {
      return content.text;
    }

    return content.text.substring(0, 100) + '...';
  }
}
