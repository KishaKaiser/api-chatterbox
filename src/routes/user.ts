import { Router, Response } from "express"
import { requireAuth, AuthRequest } from "../middleware/auth"
import { prisma } from "../lib/prisma"

const router = Router()

// All routes require authentication
router.use(requireAuth)

// GET /me  – return current user profile
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      preferredName: user.preferredName,
      chatbotName: user.chatbotName,
      personalityPreset: user.personalityPreset,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  } catch (err) {
    console.error("GET /me error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /settings  – return user settings JSON
router.get("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const record = await prisma.userSettings.findUnique({
      where: { userId: req.userId },
    })
    res.json(record ? record.settings : {})
  } catch (err) {
    console.error("GET /settings error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /settings  – upsert user settings JSON
router.put("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const incoming = req.body as Record<string, unknown>
    if (typeof incoming !== "object" || incoming === null) {
      res.status(400).json({ error: "Request body must be a JSON object" })
      return
    }

    // Merge with existing settings
    const existing = await prisma.userSettings.findUnique({
      where: { userId: req.userId },
    })
    const merged: Record<string, unknown> = {
      ...(existing?.settings as Record<string, unknown> ?? {}),
      ...incoming,
    }

    const record = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { settings: merged as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { userId: req.userId as string, settings: merged as any },
    })
    res.json(record.settings)
  } catch (err) {
    console.error("PUT /settings error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /me  – update user profile fields
router.put("/me", async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, preferredName, chatbotName, personalityPreset, avatarUrl } =
      req.body as {
        displayName?: string
        preferredName?: string
        chatbotName?: string
        personalityPreset?: string
        avatarUrl?: string
      }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(preferredName !== undefined && { preferredName }),
        ...(chatbotName !== undefined && { chatbotName }),
        ...(personalityPreset !== undefined && { personalityPreset }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
    })
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      preferredName: user.preferredName,
      chatbotName: user.chatbotName,
      personalityPreset: user.personalityPreset,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  } catch (err) {
    console.error("PUT /me error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
