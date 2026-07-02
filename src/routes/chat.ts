import { Router, Response } from "express"
import { requireAuth, AuthRequest } from "../middleware/auth"

const router = Router()

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b"

interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

router.post("/chat", requireAuth, async (req: AuthRequest, res: Response) => {
  const { messages, systemPrompt } = req.body as {
    messages: ChatMessage[]
    systemPrompt?: string
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" })
    return
  }

  const ollamaMessages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt ?? "You are a helpful, friendly AI assistant.",
    },
    ...messages,
  ]

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
      }),
    })

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text()
      console.error("Ollama error:", ollamaRes.status, text)
      res.status(502).json({ error: "AI service unavailable" })
      return
    }

    const data = (await ollamaRes.json()) as {
      message: { content: string }
    }

    res.json({ content: data.message.content })
  } catch (err) {
    console.error("Chat error:", err)
    res.status(502).json({ error: "Could not reach AI service" })
  }
})

export default router
