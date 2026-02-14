import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { validateSecurityConfig } from './config/security';

// Load environment variables
dotenv.config();

// Import database and cache
import { initDatabase, closeDatabase } from './db';
import { initRedis, closeRedis } from './services/cacheService';
import { initJobs } from './jobs';


// Import routes
import authRoutes from './routes/auth';
import domainRoutes from './routes/domains';
import collectRoutes from './routes/collect';
import analyticsRoutes from './routes/analytics';
import funnelRoutes from './routes/funnels';
import heatmapRoutes from './routes/heatmaps';
import recordingRoutes from './routes/recordings';
import insightRoutes from './routes/insights';
import sourcesRoutes from './routes/sources';
import demoRoutes from './routes/demo';
import paymentRoutes from './routes/payments';
import exportRoutes from './routes/export';
import teamRoutes from './routes/team';
import webhookRoutes from './routes/webhooks';
import experimentRoutes from './routes/experiments';



const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware — hardened helmet CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", process.env.CORS_ORIGIN || 'http://localhost:3000'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false, // needed for tracking script
}));
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — API general (100 req / 15 min)
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Rate limiting — Collect endpoint (5000 req / 15 min — looser for event ingestion)
const collectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { error: 'Event rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/collect', collectLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check — enhanced with connectivity status
app.get('/health', async (req, res) => {
    const health: Record<string, unknown> = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    };
    res.json(health);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/collect', collectRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/funnels', funnelRoutes);
app.use('/api/heatmaps', heatmapRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/export', exportRoutes);


// ...
app.use('/api/teams', teamRoutes);


// ...
app.use('/api/webhooks', webhookRoutes);
app.use('/api/experiments', experimentRoutes);






// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Centralized error handler (must be AFTER all routes)
app.use(errorHandler);



// ... other imports ...

// Start server with database initialization
async function start() {
    try {
        // Validate security configuration (warns in dev, throws in prod)
        validateSecurityConfig();

        // Initialize scheduled jobs
        initJobs();



        // Initialize database (required — all routes use PostgreSQL)
        if (process.env.DATABASE_URL) {
            await initDatabase();
            console.log('✅ Database connected');
        } else {
            console.warn('⚠️  DATABASE_URL not set — API routes will fail without a PostgreSQL connection.');
            console.warn('   Set DATABASE_URL=postgresql://user:pass@localhost:5432/trackflow');
        }

        // Initialize Redis cache (optional — graceful degradation)
        await initRedis();

        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📊 TrackFlow API ready`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await closeRedis();
    await closeDatabase();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await closeRedis();
    await closeDatabase();
    process.exit(0);
});

start();



export default app;
