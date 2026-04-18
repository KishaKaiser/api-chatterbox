import express from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import authRoutes from "./routes/auth"
import userRoutes from "./routes/user"

const app = express()
const PORT = Number(process.env.PORT) || 4000

// CORS – allow configured frontend origin(s)
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., curl, health checks)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true)
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`))
      }
    },
    credentials: true,
  })
)

app.use(express.json())

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
})
app.use(globalLimiter)

// Stricter rate limit for auth endpoints: 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
})

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// Routes
app.use("/auth", authLimiter, authRoutes)
app.use("/", userRoutes)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" })
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`)
})
