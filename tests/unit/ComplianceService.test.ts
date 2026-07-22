/**
 * ComplianceService unit tests — focused on rule matching and scoring.
 *
 * Note: ComplianceService also has a "sync remote rules" feature that hits
 * network GitHub URLs; we don't exercise that path here (would need MSW or
 * similar). We only test the local rule evaluation, which is the actual
 * gatekeeper for publishing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb, getTestDb, getTestDbSync } from '../setup.js';

describe('ComplianceService', () => {
    beforeEach(async () => {
        await resetTestDb();
        await getTestDb(); // cache the handle for sync access in tests
    });

    it('returns isCompliant=true with no rules configured', async () => {
        const { ComplianceService } = await import('../../api/services/core/ComplianceService.js');
        const result = ComplianceService.check('任何内容都可以');
        expect(result.isCompliant).toBe(true);
        expect(result.blockedWords).toHaveLength(0);
    });

    it('flags BLOCK keywords and sets isCompliant=false', async () => {
        const db = getTestDbSync();
        db.prepare(`INSERT INTO compliance_rules (category, keyword, level, suggestion) VALUES (?, ?, ?, ?)`)
            .run('forbidden', '脚本', 'BLOCK', '自动化/黑科技');

        const { ComplianceService } = await import('../../api/services/core/ComplianceService.js');
        const result = ComplianceService.check('这是一个脚本自动化的工具');
        expect(result.isCompliant).toBe(false);
        expect(result.blockedWords).toContain('脚本');
    });

    it('WARN keywords do not block but reduce the score', async () => {
        const db = getTestDbSync();
        db.prepare(`INSERT INTO compliance_rules (category, keyword, level, suggestion) VALUES (?, ?, ?, ?)`)
            .run('sensitive', '最', 'WARN', '超/非常/绝');

        const { ComplianceService } = await import('../../api/services/core/ComplianceService.js');
        const result = ComplianceService.check('这是最美的一款产品');
        expect(result.isCompliant).toBe(true); // WARN doesn't block
        expect(result.warningWords).toContain('最');
        expect(result.score).toBeLessThan(100);
    });

    it('disabling a rule removes it from detection', async () => {
        const db = getTestDbSync();
        db.prepare(`INSERT INTO compliance_rules (category, keyword, level, suggestion, is_enabled) VALUES (?, ?, ?, ?, 0)`)
            .run('forbidden', '脚本', 'BLOCK', 'x');

        const { ComplianceService } = await import('../../api/services/core/ComplianceService.js');
        const result = ComplianceService.check('脚本脚本脚本');
        // Disabled rule should not match
        expect(result.isCompliant).toBe(true);
    });
});
