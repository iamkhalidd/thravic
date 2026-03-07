import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { redirectGuard } from './middleware/redirectGuard';
import { validateSecurityConfig } from './config/security';
import { createLogger } from './config/logger';

const log = createLogger('Server');

// Load environment variables
dotenv.config();

import RedisStore from 'rate-limit-redis';
import redisClient from './db/redis';

// Import database and cache
import { initDatabase, closeDatabase } from './db';
import { initRedis, closeRedis } from './services/cacheService';
import { initJobs } from './jobs';
import { startEventWorker, stopEventWorker } from './jobs/eventWorker';


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
import adminRoutes from './routes/admin';
import announcementRoutes from './routes/announcements';
import { maintenanceModeGate, registrationGate, trackingGate } from './middleware/settingsGate';



const app = express();
const PORT = process.env.PORT || 3001;

// Trust the reverse proxy (Render/Vercel/Cloudflare) so rate limiters see the real client IP.
// Setting to `true` trusts the entire proxy chain and uses the first IP (actual client).
app.set('trust proxy', true);

// ── CORS Origin Whitelist ─────────────────────
// Parsed once at startup, shared by Helmet CSP & CORS middleware
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

// Validate origins at startup in production
if (isProd) {
    for (const o of allowedOrigins) {
        if (o === '*') throw new Error('CORS wildcard "*" is forbidden in production.');
        if (!o.startsWith('https://')) {
            log.warn(`CORS origin "${o}" is not HTTPS — strongly recommended for production.`);
        }
    }
}

// Security middleware — hardened helmet CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", ...allowedOrigins],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProd ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false, // needed for tracking script
}));

app.use(cors((req, callback) => {
    const requestOrigin = (req as any).headers?.origin as string | undefined;

    // ── Collect endpoint: open to any origin ────────────────────────────────
    // Customer websites send tracking events from their own domains.
    // The route itself applies Access-Control-Allow-Origin: * headers,
    // so we bypass the whitelist check here.
    if (req.url?.startsWith('/api/collect')) {
        return callback(null, {
            origin: '*',
            methods: ['POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type'],
            maxAge: 600,
            optionsSuccessStatus: 204,
        });
    }

    // ── All other routes: strict whitelist ──────────────────────────────────
    if (!requestOrigin) return callback(null, { origin: true }); // server-to-server
    if (allowedOrigins.includes(requestOrigin)) {
        return callback(null, {
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
            maxAge: 600,
            optionsSuccessStatus: 200,
            preflightContinue: false,
        });
    }
    callback(new Error(`CORS: origin "${requestOrigin}" is not allowed`));
}));

// Ensure Vary: Origin is always set to prevent CDN cache poisoning
app.use((_req, res, next) => {
    res.setHeader('Vary', 'Origin');
    next();
});

// Redirect guard — validates all res.redirect() calls against CORS_ORIGIN allowlist
app.use(redirectGuard());

// ── Rate Limiters ─────────────────────────────────────────────────────────────
// NOTE: counters are in-memory. Add REDIS_URL (Upstash) to make them
// persistent across Render restarts and scale to multiple instances.

// Helper to reliably extract the client's real IP behind proxies
const getIp = (req: express.Request) => {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || req.ip || 'unknown';
};

// 1. Global API — 300 req / 15 min per IP
// Dashboard pages each trigger 4-8 parallel API calls, so 50 was way too tight.
// Auth and collect have their own dedicated stricter limiters below.
const apiLimiter = rateLimit({
    store: new RedisStore({
        // @ts-expect-error - ioredis types don't exactly match what rate-limit-redis expects
        sendCommand: (...args: string[]) => redisClient.call(...args) as any,
        prefix: 'rl:global:',
    }),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
    max: parseInt(process.env.RATE_LIMIT_MAX || '300'),
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getIp,
    skip: (req) => req.path.startsWith('/api/collect'), // collect has its own limiter
});
app.use('/api/', apiLimiter);

// 2. Auth routes — 10 req / 15 min per IP (stops brute-force login & register spam)
// Applies BEFORE the global limiter counts against auth headers.
const authLimiter = rateLimit({
    store: new RedisStore({
        // @ts-expect-error - ioredis types don't exactly match what rate-limit-redis expects
        sendCommand: (...args: string[]) => redisClient.call(...args) as any,
        prefix: 'rl:auth:',
    }),
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many auth attempts, please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getIp,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// 3. Event collection — 60 events / min per IP
// A real browser page fires ~3-5 events/min. 60 is generous but stops scrapers.
// This replaces the conflicting 5000/15min limiter that was previously here.
const collectRateLimiter = rateLimit({
    store: new RedisStore({
        // @ts-expect-error - ioredis types don't exactly match what rate-limit-redis expects
        sendCommand: (...args: string[]) => redisClient.call(...args) as any,
        prefix: 'rl:collect:',
    }),
    windowMs: 60 * 1000,  // 1 min
    max: 60,
    message: { error: 'Event rate limit exceeded, slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getIp,
});
app.use('/api/collect', collectRateLimiter);

const adminLimiter = rateLimit({
    store: new RedisStore({
        // @ts-expect-error - ioredis types don't exactly match what rate-limit-redis expects
        sendCommand: (...args: string[]) => redisClient.call(...args) as any,
        prefix: 'rl:admin:',
    }),
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many admin requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getIp,
});
app.use('/api/admin', adminLimiter);

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

// ── Runtime Settings Gates ─────────────────────────────────────
// Maintenance mode: all non-admin routes return 503 when enabled
app.use(maintenanceModeGate);

// API Routes
app.use('/api/auth/register', registrationGate);
app.use('/api/collect', trackingGate);
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
app.use('/api/teams', teamRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/experiments', experimentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);

// ── Thravic Client Tracker Script ────────────────────────────────────────
// Serves the analytics tracking script. Customer sites load this via <script>.
// Uses a function wrapper + IIFE pattern, no external dependencies.
// v2.0 — Strong UUIDs, replaceState tracking, debounce, session exit, bot filter
app.get(['/tf.js', '/v.js'], (req, res) => {
    const apiUrl = process.env.SERVER_URL || process.env.API_URL || '';
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`
/* Thravic Analytics Tracker v2.0 */
(function(){
  'use strict';

  // ── Bot / crawler filter ─────────────────────────────────────────────────
  if(navigator.webdriver) return;

  var API='${apiUrl}/api/collect';

  // Resolve tracking ID: prefer window.TF.id, else data attribute
  function getId(){
    if(window.TF&&window.TF.id) return window.TF.id;
    var s=document.currentScript||document.querySelector('script[data-tracking-id]');
    return s?s.getAttribute('data-tracking-id'):null;
  }
  var tid=getId();
  if(!tid){console.warn('[Thravic] No tracking ID found.');return;}

  // ── Strong unique ID generator ───────────────────────────────────────────
  function uid(){
    if(typeof crypto!=='undefined'&&crypto.randomUUID) return crypto.randomUUID();
    return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);
    });
  }

  var vid=localStorage.getItem('_tf_vid');
  if(!vid){vid=uid();localStorage.setItem('_tf_vid',vid);}
  var sid=sessionStorage.getItem('_tf_sid');
  if(!sid){sid=uid();sessionStorage.setItem('_tf_sid',sid);}

  // ── Internal referrer tracking ───────────────────────────────────────────
  var lastUrl=location.href;
  var pageStart=Date.now();

  // ── Send event ───────────────────────────────────────────────────────────
  function send(type,extra){
    var ref=(type==='pageview'&&lastUrl!==location.href)?lastUrl:(document.referrer||null);
    var payload={
      type:type,
      url:location.href,
      referrer:ref,
      visitorId:vid,
      sessionId:sid,
      screenWidth:screen.width,
      screenHeight:screen.height,
      language:navigator.language||null,
      utmSource:(new URLSearchParams(location.search)).get('utm_source')||null,
      utmMedium:(new URLSearchParams(location.search)).get('utm_medium')||null,
      utmCampaign:(new URLSearchParams(location.search)).get('utm_campaign')||null,
      utmTerm:(new URLSearchParams(location.search)).get('utm_term')||null,
      utmContent:(new URLSearchParams(location.search)).get('utm_content')||null,
      data:extra||{}
    };
    var url=API+'/'+tid;
    if(navigator.sendBeacon){navigator.sendBeacon(url,JSON.stringify(payload));}
    else{fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(function(){});}
  }

  // ── SPA navigation (pushState + replaceState) ────────────────────────────
  var debounce;
  function onNav(){
    clearTimeout(debounce);
    debounce=setTimeout(function(){
      if(location.href!==lastUrl){
        send('pageview');
        lastUrl=location.href;
        pageStart=Date.now();
      }
    },100);
  }
  var origPush=history.pushState.bind(history);
  var origReplace=history.replaceState.bind(history);
  history.pushState=function(){origPush.apply(this,arguments);onNav();};
  history.replaceState=function(){origReplace.apply(this,arguments);onNav();};
  window.addEventListener('popstate',function(){onNav();});

  // ── Initial pageview ─────────────────────────────────────────────────────
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){send('pageview');});}
  else{send('pageview');}

  // ── Session exit / duration tracking ─────────────────────────────────────
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      var duration=Math.round((Date.now()-pageStart)/1000);
      send('session_end',{duration:duration,lastPage:location.href});
    } else {
      pageStart=Date.now();
    }
  });

  // ── Expose TF.track() for custom events ──────────────────────────────────
  window.TF=window.TF||{};
  window.TF.track=function(name,data){send('custom',Object.assign({name:name},data||{}));};
})();
`.trim());
});

// ── Email diagnostic endpoint ───────────────────────────────────────────────
app.get('/api/test-email', async (req, res) => {
    const { sendEmail } = await import('./services/emailService');
    const to = (req.query.to as string) || process.env.SMTP_USER || '';
    if (!to) return res.status(400).json({ error: 'No recipient — set ?to=email or SMTP_USER env' });

    try {
        await sendEmail({
            to,
            subject: '🧪 Thravic Test Email',
            text: `This is a test email from Thravic at ${new Date().toISOString()}. If you see this, SMTP is working!`,
            html: `<div style="font-family:sans-serif;padding:20px;"><h2>✅ SMTP is working!</h2><p>Sent at: ${new Date().toISOString()}</p><p>Server: ${process.env.SERVER_URL || 'localhost'}</p></div>`,
        });
        res.json({ ok: true, message: `Test email sent to ${to}` });
    } catch (err) {
        const error = err as Error;
        res.status(500).json({ ok: false, error: error.message, stack: error.stack });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});


// Centralized error handler (must be AFTER all routes)
app.use(errorHandler);

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
            log.info('Database connected');
        } else {
            log.warn('DATABASE_URL not set — API routes will fail without a PostgreSQL connection. Set DATABASE_URL=postgresql://user:pass@localhost:5432/thravic');
        }
        
        // Start background queue processors
        startEventWorker();

        // Initialize Redis cache (optional — graceful degradation)
        await initRedis();

        app.listen(PORT, () => {
            log.info(`Server running on port ${PORT}`);
            log.info('Thravic API ready');
        });
    } catch (error) {
        log.error('Failed to start server', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down gracefully');
    stopEventWorker();
    await closeRedis();
    await closeDatabase();
    process.exit(0);
});

process.on('SIGINT', async () => {
    log.info('SIGINT received, shutting down gracefully');
    await closeRedis();
    await closeDatabase();
    process.exit(0);
});

start();

export default app;
