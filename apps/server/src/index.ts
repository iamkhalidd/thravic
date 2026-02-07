import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import database
import { initDatabase, closeDatabase } from './db';

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

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server with database initialization
async function start() {
    try {
        // Initialize database (skip if DATABASE_URL not set for local dev without DB)
        if (process.env.DATABASE_URL) {
            await initDatabase();
            console.log('✅ Database connected');
        } else {
            console.log('⚠️  DATABASE_URL not set - using in-memory storage');
        }

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
    await closeDatabase();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await closeDatabase();
    process.exit(0);
});

start();

export default app;
