import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastVariant,
  ToastMessage
} from "../components/ui/toast"
import QueueCommands from "../components/Queue/QueueCommands"
import ModelSelector from "../components/ui/ModelSelector"

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}

const Queue: React.FC<QueueProps> = ({ setView }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{role: "user"|"gemini", text: string}[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const chatInputRef = useRef<HTMLInputElement>(null)
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string }>({ provider: "gemini", model: "gemini-2.0-flash" })

  // Capture context state
  const [latestCapture, setLatestCapture] = useState<any>(null)
  const [isCaptureVisible, setIsCaptureVisible] = useState(false)

  const barRef = useRef<HTMLDivElement>(null)

  const { data: screenshots = [], refetch } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["screenshots"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: true,
      refetchOnMount: true
    }
  )

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  const handleChatSend = async () => {
    if (!chatInput.trim()) return
    setChatMessages((msgs) => [...msgs, { role: "user", text: chatInput }])
    setChatLoading(true)
    setChatInput("")
    try {
      const response = await window.electronAPI.invoke("gemini-chat", chatInput)
      setChatMessages((msgs) => [...msgs, { role: "gemini", text: response }])
    } catch (err) {
      setChatMessages((msgs) => [...msgs, { role: "gemini", text: "Error: " + String(err) }])
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }

  // Load current model configuration on mount
  useEffect(() => {
    const loadCurrentModel = async () => {
      try {
        const config = await window.electronAPI.getCurrentLlmConfig();
        setCurrentModel({ provider: config.provider, model: config.model });
      } catch (error) {
        console.error('Error loading current model config:', error);
      }
    };
    loadCurrentModel();
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue")
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      })
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  // Listen for context captured events
  useEffect(() => {
    // @ts-ignore - Type will be available at runtime
    const unsubscribe = window.electronAPI.onContextCaptured?.((data: any) => {
      console.log('Context captured:', data)
      setLatestCapture(data.context)
      setIsCaptureVisible(true)
      showToast("Context Captured", "Successfully captured context!", "neutral")
    })
    return () => unsubscribe?.()
  }, [])

  // Seamless screenshot-to-LLM flow
  useEffect(() => {
    // Listen for screenshot taken event
    const unsubscribe = window.electronAPI.onScreenshotTaken(async (data) => {
      // Refetch screenshots to update the queue
      await refetch();
      // Show loading in chat
      setChatLoading(true);
      try {
        // Get the latest screenshot path
        const latest = data?.path || (Array.isArray(data) && data.length > 0 && data[data.length - 1]?.path);
        if (latest) {
          // Call the LLM to process the screenshot
          const response = await window.electronAPI.invoke("analyze-image-file", latest);
          setChatMessages((msgs) => [...msgs, { role: "gemini", text: response.text }]);
        }
      } catch (err) {
        setChatMessages((msgs) => [...msgs, { role: "gemini", text: "Error: " + String(err) }]);
      } finally {
        setChatLoading(false);
      }
    });
    return () => {
      unsubscribe && unsubscribe();
    };
  }, [refetch]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleChatToggle = () => {
    setIsChatOpen(!isChatOpen)
  }

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  const handleModelChange = (provider: "ollama" | "gemini", model: string) => {
    setCurrentModel({ provider, model })
    // Update chat messages to reflect the model change
    const modelName = provider === "ollama" ? model : "Gemini 2.0 Flash"
    setChatMessages((msgs) => [...msgs, {
      role: "gemini",
      text: `🔄 Switched to ${provider === "ollama" ? "🏠" : "☁️"} ${modelName}. Ready for your questions!`
    }])
  }

  const handleCaptureContext = async () => {
    try {
      showToast("Capturing...", "Capturing context data...", "neutral")
      // @ts-ignore - Type will be available at runtime
      await window.electronAPI.captureStart?.()
    } catch (error) {
      console.error("Error capturing context:", error)
      showToast("Error", "Failed to capture context", "error")
    }
  }

  return (
    <div
      ref={barRef}
      style={{
        position: "relative",
        width: "100%",
        pointerEvents: "auto"
      }}
      className="select-none"
    >
      <div className="bg-transparent w-full">
        <div className="px-2 py-1">
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>
          <div className="w-fit">
            <QueueCommands
              screenshots={screenshots}
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              onChatToggle={handleChatToggle}
              onSettingsToggle={handleSettingsToggle}
            />
          </div>
          {/* Conditional Settings Interface */}
          {isSettingsOpen && (
            <div className="mt-4 w-full mx-auto">
              <ModelSelector onModelChange={handleModelChange} onChatOpen={() => setIsChatOpen(true)} />
            </div>
          )}
          
          {/* Conditional Chat Interface */}
          {isChatOpen && (
            <div className="mt-4 w-full mx-auto liquid-glass chat-container p-4 flex flex-col">
            <div className="flex-1 overflow-y-auto mb-3 p-3 rounded-lg bg-white/10 backdrop-blur-md max-h-64 min-h-[120px] glass-content border border-white/20 shadow-lg">
              {chatMessages.length === 0 ? (
                <div className="text-sm text-gray-600 text-center mt-8">
                  💬 Chat with {currentModel.provider === "ollama" ? "🏠" : "☁️"} {currentModel.model}
                  <br />
                  <span className="text-xs text-gray-500">Take a screenshot (Cmd+H) for automatic analysis</span>
                  <br />
                  <span className="text-xs text-gray-500">Click ⚙️ Models to switch AI providers</span>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`w-full flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-3`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs shadow-md backdrop-blur-sm border ${
                        msg.role === "user" 
                          ? "bg-gray-700/80 text-gray-100 ml-12 border-gray-600/40" 
                          : "bg-white/85 text-gray-700 mr-12 border-gray-200/50"
                      }`}
                      style={{ wordBreak: "break-word", lineHeight: "1.4" }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start mb-3">
                  <div className="bg-white/85 text-gray-600 px-3 py-1.5 rounded-xl text-xs backdrop-blur-sm border border-gray-200/50 shadow-md mr-12">
                    <span className="inline-flex items-center">
                      <span className="animate-pulse text-gray-400">●</span>
                      <span className="animate-pulse animation-delay-200 text-gray-400">●</span>
                      <span className="animate-pulse animation-delay-400 text-gray-400">●</span>
                      <span className="ml-2">{currentModel.model} is replying...</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
            <form
              className="flex gap-2 items-center glass-content"
              onSubmit={e => {
                e.preventDefault();
                handleChatSend();
              }}
            >
              <input
                ref={chatInputRef}
                className="flex-1 rounded-lg px-3 py-2 bg-white/25 backdrop-blur-md text-gray-800 placeholder-gray-500 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400/60 border border-white/40 shadow-lg transition-all duration-200"
                placeholder="Type your message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button
                type="submit"
                className="p-2 rounded-lg bg-gray-600/80 hover:bg-gray-700/80 border border-gray-500/60 flex items-center justify-center transition-all duration-200 backdrop-blur-sm shadow-lg disabled:opacity-50"
                disabled={chatLoading || !chatInput.trim()}
                tabIndex={-1}
                aria-label="Send"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-7.5-15-7.5v6l10 1.5-10 1.5v6z" />
                </svg>
              </button>
            </form>
          </div>
          )}

          {/* Context Capture Button */}
          <div className="mt-4 w-full mx-auto">
            <button
              onClick={handleCaptureContext}
              className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500/80 to-purple-500/80 hover:from-blue-600/80 hover:to-purple-600/80 text-white text-sm font-medium transition-all duration-200 backdrop-blur-sm shadow-lg border border-white/20"
            >
              📸 Capture Context (Cmd+Shift+C)
            </button>
          </div>

          {/* Display Latest Capture */}
          {isCaptureVisible && latestCapture && (
            <div className="mt-4 w-full mx-auto liquid-glass p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Latest Capture</h3>
                <button
                  onClick={() => setIsCaptureVisible(false)}
                  className="text-gray-500 hover:text-gray-700 text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                <div>
                  <span className="font-medium">App:</span> {latestCapture.activeWindow.app}
                </div>
                <div>
                  <span className="font-medium">Window:</span> {latestCapture.activeWindow.title}
                </div>
                <div>
                  <span className="font-medium">Browser Tabs:</span> {latestCapture.browserTabs.length}
                </div>
                <div>
                  <span className="font-medium">Clipboard:</span> {latestCapture.clipboard ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-medium">Time:</span> {new Date(latestCapture.timestamp).toLocaleTimeString()}
                </div>

                {latestCapture.browserTabs.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium text-blue-600 hover:text-blue-800">
                      View Browser Tabs ({latestCapture.browserTabs.length})
                    </summary>
                    <div className="mt-2 pl-4 space-y-1 max-h-32 overflow-y-auto">
                      {latestCapture.browserTabs.map((tab: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-medium truncate">{tab.title}</div>
                          <div className="text-gray-500 truncate">{tab.url}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {latestCapture.clipboard && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium text-blue-600 hover:text-blue-800">
                      View Clipboard
                    </summary>
                    <div className="mt-2 pl-4 text-xs bg-white/50 p-2 rounded max-h-24 overflow-y-auto">
                      {latestCapture.clipboard.text.substring(0, 500)}
                      {latestCapture.clipboard.text.length > 500 && '...'}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Queue
