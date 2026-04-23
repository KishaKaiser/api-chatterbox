import { Router, Response } from "express"
import bcrypt from "bcryptjs"
import jwt, { SignOptions } from "jsonwebtoken"
import { prisma } from "../lib/prisma"

const router = Router()

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET not set")
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
  }
  return jwt.sign({ sub: userId }, secret, options)
}

// POST /auth/register
router.post("/register", async (req, res: Response) => {
  try {
    const { email, password, username } = req.body as {
      email?: string
      password?: string
      username?: string
    }

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: "password must be at least 6 characters" })
      return
    }
    if (!email.includes("@")) {
      res.status(400).json({ error: "invalid email address" })
      return
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        username: (username ?? email.split("@")[0]).trim(),
        passwordHash,
      },
    })

    const token = signToken(user.id)
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt },
    })
  } catch (err) {
    console.error("register error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /auth/login
router.post("/login", async (req, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" })
      return
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    const token = signToken(user.id)
    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt },
    })
  } catch (err) {
    console.error("login error", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
