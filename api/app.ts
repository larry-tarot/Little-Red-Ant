/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js' // Admin User Management
import personaRoutes from './routes/user.js' // Persona (Legacy named user.js, should rename but keep for now)
import generateRoutes from './routes/generate.js'
import trendsRoutes from './routes/trends.js'
import publishRoutes from './routes/publish.js'
import draftsRoutes from './routes/drafts.js'
import accountRoutes from './routes/accounts.js'
import analyticsRoutes from './routes/analytics.js'
import tasksRoutes from './routes/tasks.js'
import settingsRoutes from './routes/settings.js'
import commentsRoutes from './routes/comments.js'
import competitorRoutes from './routes/competitor.js'
import promptRoutes from './routes/prompts.js'
import notificationRoutes from './routes/notifications.js'
import trendingNotesRoutes from './routes/trending_notes.js'
import videoProjectRoutes from './routes/video_projects.js'
import assetRoutes from './routes/assets.js'
import noteRoutes from './routes/notes.js'
import complianceRoutes from './routes/compliance.js'
import optimizationRoutes from './routes/optimizations.js'
import configRoutes from './routes/config.js'
import nicheRoutes from './routes/niche.js'
import db, { initDB } from './db.js'
import { authenticateToken } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
 
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

// init db
initDB()

// Reset zombie tasks (PROCESSING -> PENDING) on startup
try {
  const result = db.prepare("UPDATE tasks SET status = 'PENDING' WHERE status = 'PROCESSING'").run();
  if (result.changes > 0) {
    console.log(`[Startup] Recovered ${result.changes} zombie tasks (PROCESSING -> PENDING)`);
  }
} catch (error) {
  console.error('[Startup] Failed to recover zombie tasks:', error);
}

const app: express.Application = express()

// CORS Configuration - Whitelist
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001', // 桌面版 Electron 加载地址
    process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        // Sprint 8: Security fix — do NOT allow no-origin requests when credentials=true.
        // The old code had `if (!origin) return callback(null, true)` which allowed
        // CSRF attacks via curl/Postman that carry cookies. Now we require an explicit
        // origin header for credentialed requests.
        // Allow requests with no origin (like server-to-server calls) only if they
        // don't carry credentials (cookies, auth headers).
        if (!origin) {
            return callback(null, false);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true // Allow cookies and authorization headers
}))
app.use(cookieParser())

// Rate Limiting Configuration
// General API limit: 1000 requests per 15 minutes (increased from 100 to prevent
// frontend polling from blocking the app). The Tasks page polls every 5s alone
// consumes ~12 req/min, and analytics/trends/notifications add more. 1000/15min
// (~67 req/min) gives headroom for normal usage while still preventing abuse.
// Can be overridden via RATE_LIMIT_MAX env var.
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '1000', 10);
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: RATE_LIMIT_MAX,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { success: false, error: 'Too many requests, please try again later.' },
    skip: (req) => {
        // Skip health check
        if (req.path === '/api/health') return true;
        // Skip polling endpoints that the frontend calls frequently
        // so they don't exhaust the rate budget for write operations.
        const path = req.path;
        if (path === '/api/tasks' ||
            path === '/api/tasks/active' ||
            path === '/api/notifications/count' ||
            path.startsWith('/api/tasks/') && req.method === 'GET' && !path.endsWith('/cancel')) {
            return true;
        }
        return false;
    }
});

// Strict limit for auth routes: 20 requests per 15 minutes (was 10, too low for
// development; still safe for production since auth is only called on login).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts, please try again later.' }
});

// Apply general rate limit to all API routes
app.use('/api', generalLimiter);

app.use(express.json({ limit: '50mb' })) // Increase limit for image uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files from public directory (e.g., uploads, audio)
app.use(express.static(path.join(process.cwd(), 'public')));
// 生产模式: 同时提供前端构建产物
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
}

/**
 * API Routes
 */
// Public Routes
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'ok' })
})

// Protected Routes
app.use('/api/user', authenticateToken, personaRoutes)
app.use('/api/users', authenticateToken, userRoutes)
app.use('/api/generate', authenticateToken, generateRoutes)
app.use('/api/trends', authenticateToken, trendsRoutes)
app.use('/api/publish', authenticateToken, publishRoutes)
app.use('/api/drafts', authenticateToken, draftsRoutes)
app.use('/api/accounts', authenticateToken, accountRoutes)
app.use('/api/analytics', authenticateToken, analyticsRoutes)
app.use('/api/tasks', authenticateToken, tasksRoutes)
app.use('/api/settings', authenticateToken, settingsRoutes)
app.use('/api/comments', authenticateToken, commentsRoutes)
app.use('/api/competitors', authenticateToken, competitorRoutes)
app.use('/api/prompts', authenticateToken, promptRoutes)
app.use('/api/notifications', authenticateToken, notificationRoutes)
app.use('/api/trending-notes', authenticateToken, trendingNotesRoutes)
app.use('/api/notes', authenticateToken, noteRoutes)
app.use('/api/compliance', authenticateToken, complianceRoutes)
app.use('/api/optimizations', authenticateToken, optimizationRoutes)
app.use('/api/config', authenticateToken, configRoutes)
app.use('/api/niche', authenticateToken, nicheRoutes)

// Temporarily expose these for debugging/stability (or maybe user token is missing in frontend request?)
// Actually, let's keep auth but ensure the routes are mounted correctly.
// They seem correct.
// Let's try to move them UP to see if something shadows them, OR remove auth to test.
// Given the user is "admin" in screenshot, auth should be fine.
// But 404 means "Not Found" by Express.
// Wait, if `video_projects.ts` had a syntax error, the import `import videoProjectRoutes` might have failed silently 
// or returned undefined/empty object if error handling was weird in `tsx` loader? 
// No, we saw crash.
// Now crash is gone.
// Let's explicitly log when these routes are hit to debug.

app.use('/api/video-projects', authenticateToken, videoProjectRoutes)
app.use('/api/assets', authenticateToken, assetRoutes)

/**
 * error handler middleware (unified)
 */
app.use(errorHandler)

/**
 * SPA fallback: 非 API 路由返回 index.html(支持前端路由刷新)
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'), (err) => {
        if (err) next();
    });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
