// ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState } from "./main"

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("gemini-chat", async (event, message: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message);
      return result;
    } catch (error: any) {
      console.error("Error in gemini-chat handler:", error);
      throw error;
    }
  });

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Window movement handlers
  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  ipcMain.handle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  ipcMain.handle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  // LLM Model Management Handlers
  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama()
      };
    } catch (error: any) {
      console.error("Error getting current LLM config:", error);
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = await llmHelper.getOllamaModels();
      return models;
    } catch (error: any) {
      console.error("Error getting Ollama models:", error);
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Ollama:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-gemini", async (_, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Gemini:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const result = await llmHelper.testConnection();
      return result;
    } catch (error: any) {
      console.error("Error testing LLM connection:", error);
      return { success: false, error: error.message };
    }
  });

  // Context Capture Handlers
  ipcMain.handle("capture:start", async () => {
    try {
      console.log("[IPC] Manual capture triggered");
      await appState.captureContext();
      return { success: true };
    } catch (error: any) {
      console.error("Error in capture:start handler:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("capture:list", async () => {
    try {
      const dbHelper = appState.getDatabaseHelper();
      const captures = dbHelper.getCaptures(100);

      // Convert to a more frontend-friendly format
      return captures.map(capture => ({
        id: capture.id,
        timestamp: new Date(capture.timestamp),
        appName: capture.app_name,
        windowTitle: capture.window_title,
        tabsCount: capture.tabs_count,
        hasClipboard: capture.has_clipboard === 1,
        webhookSent: capture.webhook_sent === 1,
        screenshotPath: capture.screenshot_path
      }));
    } catch (error: any) {
      console.error("Error in capture:list handler:", error);
      throw error;
    }
  });

  ipcMain.handle("capture:get", async (event, captureId: string) => {
    try {
      const aggregator = appState.getContextAggregator();
      const capture = await aggregator.loadCapture(captureId);
      return capture;
    } catch (error: any) {
      console.error("Error in capture:get handler:", error);
      throw error;
    }
  });

  ipcMain.handle("capture:delete", async (event, captureId: string) => {
    try {
      const aggregator = appState.getContextAggregator();
      const result = await aggregator.deleteCapture(captureId);
      return result;
    } catch (error: any) {
      console.error("Error in capture:delete handler:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("capture:retry-webhook", async (event, captureId: string) => {
    try {
      const aggregator = appState.getContextAggregator();
      const result = await aggregator.retryWebhook(captureId);
      return result;
    } catch (error: any) {
      console.error("Error in capture:retry-webhook handler:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("capture:cleanup-old", async (event, daysOld: number = 30) => {
    try {
      const aggregator = appState.getContextAggregator();
      const deletedCount = await aggregator.cleanupOldCaptures(daysOld);
      return { success: true, deletedCount };
    } catch (error: any) {
      console.error("Error in capture:cleanup-old handler:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("capture:get-stats", async () => {
    try {
      const dbHelper = appState.getDatabaseHelper();
      const stats = dbHelper.getStats();
      return stats;
    } catch (error: any) {
      console.error("Error in capture:get-stats handler:", error);
      throw error;
    }
  });
}
