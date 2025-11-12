import axios, { AxiosError } from 'axios';

export interface WebhookPayload {
  id: string;
  timestamp: Date;
  activeWindow: {
    app: string;
    title: string;
    bundleId?: string;
    screenshot?: string; // base64
  };
  browserTabs: Array<{
    title: string;
    url: string;
    domain: string;
    browser?: string;
  }>;
  clipboard: {
    text: string;
    type: 'plain' | 'html';
  } | null;
}

export interface WebhookResponse {
  success: boolean;
  error?: string;
  statusCode?: number;
}

export class WebhookService {
  private readonly webhookUrl = 'https://maxipad.app.n8n.cloud/webhook/00711e4a-b8ec-4cf0-901f-a8ac328a4d73';
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000; // Start with 1 second

  /**
   * Send captured context to webhook
   */
  async send(payload: WebhookPayload): Promise<WebhookResponse> {
    console.log('[WebhookService] Sending capture to webhook:', payload.id);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[WebhookService] Attempt ${attempt}/${this.maxRetries}`);

        const response = await axios.post(this.webhookUrl, payload, {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Cosinc/1.0'
          }
        });

        console.log('[WebhookService] Success! Status:', response.status);

        return {
          success: true,
          statusCode: response.status
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`[WebhookService] Attempt ${attempt} failed:`, error);

        if (error instanceof AxiosError) {
          // Don't retry on 4xx errors (client errors)
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            console.log('[WebhookService] Client error, not retrying');
            return {
              success: false,
              error: `Client error: ${error.response.status}`,
              statusCode: error.response.status
            };
          }
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`[WebhookService] Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    console.error('[WebhookService] All retries failed');
    return {
      success: false,
      error: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Test webhook connectivity
   */
  async testConnection(): Promise<boolean> {
    console.log('[WebhookService] Testing webhook connection...');

    try {
      const testPayload = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Cosinc webhook connection test'
      };

      const response = await axios.post(this.webhookUrl, testPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Cosinc/1.0'
        }
      });

      console.log('[WebhookService] Connection test successful:', response.status);
      return true;
    } catch (error) {
      console.error('[WebhookService] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get webhook URL (for display/debugging)
   */
  getWebhookUrl(): string {
    return this.webhookUrl;
  }
}
