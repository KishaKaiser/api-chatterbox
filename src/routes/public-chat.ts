import { Router, Request, Response } from "express"

const router = Router()
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b"

interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

function authorized(req: Request, res: Response): boolean {
  const expectedKey = process.env.PUBLIC_API_KEY
  if (!expectedKey || req.headers["x-api-key"] !== expectedKey) {
    res.status(401).json({ error: "Invalid API key" })
    return false
  }
  return true
}

async function installedModels(): Promise<string[]> {
  const response = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error("Could not list Ollama models")
  const data = await response.json() as { models?: Array<{ name?: unknown }> }
  if (!Array.isArray(data.models)) throw new Error("Invalid Ollama model list")
  return [...new Set(data.models.map(model => model.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0))].sort()
}

router.get("/public/models", async (req: Request, res: Response) => {
  if (!authorized(req, res)) return
  res.setHeader("Cache-Control", "no-store")
  try {
    const models = await installedModels()
    res.json({ models: models.map(name => ({ name })), defaultModel: OLLAMA_MODEL })
  } catch (err) {
    console.error("List models error:", err)
    res.status(502).json({ error: "Could not load installed Ollama models" })
  }
})

router.post("/public/chat", async (req: Request, res: Response) => {
  if (!authorized(req, res)) return
  const { messages, systemPrompt, model } = (req.body ?? {}) as {
    messages: ChatMessage[]
    systemPrompt?: string
    model?: unknown
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" })
    return
  }
  if (model !== undefined && (typeof model !== "string" || !model.trim())) {
    res.status(400).json({ error: "model must be a non-empty model name" })
    return
  }
  const selectedModel = typeof model === "string" ? model.trim() : OLLAMA_MODEL
  const ollamaMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt ?? "You are a helpful, knowledgeable astrologer." },
    ...messages,
  ]

  try {
    if (model !== undefined && !(await installedModels()).includes(selectedModel)) {
      res.status(400).json({ error: "Selected model is not installed. Refresh the model list and choose an installed model." })
      return
    }
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        messages: ollamaMessages,
        stream: false,
        keep_alive: "30m",
        options: { num_predict: 512 },
      }),
    })
    if (!ollamaRes.ok) {
      console.error("Ollama error:", ollamaRes.status, await ollamaRes.text())
      res.status(502).json({ error: "AI service unavailable" })
      return
    }
    const data = await ollamaRes.json() as { model?: string; message: { content: string } }
    res.json({ content: data.message.content, model: data.model ?? selectedModel })
  } catch (err) {
    console.error("Public chat error:", err)
    res.status(502).json({ error: "Could not reach AI service" })
  }
})

export default router
