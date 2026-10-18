import { Hono } from 'hono';
import { PERIOD_KEYS, type PeriodKey } from '@invest-insight/shared';
import { listCategories, computeHistory, computeRebalance, computeSummary } from '../../domain/portfolio.js';
import { computeExposure } from '../../domain/exposure.js';
import { runHealthCheck } from '../../domain/health.js';
import { computeIncome, computePerformance } from '../../domain/performance.js';
import { computePlanning } from '../../domain/planning.js';
import { getBaseCurrency } from '../../domain/prefs.js';
import type { AppEnv } from '../context.js';

/** 只读的分析类接口：总览、走势、再平衡、收益、穿透、体检、规划 */
export const insightRoutes = new Hono<AppEnv>()
  .get('/summary', (c) => c.json(computeSummary()))
  .get('/history', (c) => {
    const interval = c.req.query('interval') === 'week' ? 'week' : 'month';
    return c.json({ base_currency: getBaseCurrency(), interval, points: computeHistory(interval), categories: listCategories() });
  })
  .get('/rebalance', (c) => {
    const newMoney = Math.max(0, Number(c.req.query('newMoney') ?? 0) || 0);
    const mode = c.req.query('mode') === 'buy_only' ? 'buy_only' : 'full';
    return c.json(computeRebalance(newMoney, mode));
  })
  .get('/performance', (c) => {
    const p = c.req.query('period') as PeriodKey;
    return c.json(computePerformance(PERIOD_KEYS.includes(p) ? p : 'ALL'));
  })
  .get('/income', (c) => c.json(computeIncome()))
  .get('/exposure', (c) => c.json(computeExposure()))
  .get('/health', (c) => c.json(runHealthCheck(c.get('locale'))))
  .get('/planning', (c) => c.json(computePlanning(c.get('locale'))));
