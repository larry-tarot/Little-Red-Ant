import crypto from 'node:crypto';
import db from '../../db.js';
import { AccountBusinessProfileService } from './AccountBusinessProfileService.js';

export interface ContentSeries {
    id: string;
    accountId: number;
    title: string;
    description?: string;
    targetPillar?: string;
    plannedCount: number;
    completedCount: number;
    progressPercentage: number;
    status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
    createdAt?: string;
    updatedAt?: string;
}

export interface PillarHealth {
    name: string;
    targetRatio: number;
    currentCount: number;
    currentRatio: number;
    status: 'BALANCED' | 'UNDER' | 'OVER';
}

export interface PillarBalanceReport {
    accountId: number;
    totalContents: number;
    pillars: PillarHealth[];
    recommendation: string;
}

export interface AccountMatrixItem {
    accountId: number;
    nickname: string;
    isActive: boolean;
    opportunitiesCount: number;
    packagesCount: number;
    seriesCount: number;
    publishedNotesCount: number;
}

export class ContentSeriesService {
    /**
     * 创建系列专栏
     */
    static createSeries(data: {
        accountId: number;
        title: string;
        description?: string;
        targetPillar?: string;
        plannedCount?: number;
    }): ContentSeries {
        const id = 'ser_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const plannedCount = data.plannedCount || 5;

        db.prepare(`
            INSERT INTO content_series (
                id, account_id, title, description, target_pillar, planned_count, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(
            id,
            data.accountId,
            data.title.trim(),
            data.description || null,
            data.targetPillar || null,
            plannedCount
        );

        return this.getSeries(id)!;
    }

    /**
     * 获取单个系列详情（含完成篇数与百分比进度）
     */
    static getSeries(id: string): ContentSeries | null {
        const row = db.prepare('SELECT * FROM content_series WHERE id = ?').get(id) as any;
        if (!row) return null;

        const countRow = db.prepare(`
            SELECT COUNT(*) as count FROM series_packages WHERE series_id = ?
        `).get(id) as { count: number };

        const completedCount = countRow?.count || 0;
        const plannedCount = row.planned_count || 1;
        const progressPercentage = Math.min(100, Math.round((completedCount / plannedCount) * 100));

        return {
            id: row.id,
            accountId: row.account_id,
            title: row.title,
            description: row.description || undefined,
            targetPillar: row.target_pillar || undefined,
            plannedCount,
            completedCount,
            progressPercentage,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * 查询账号的所有系列专栏
     */
    static listSeries(accountId: number): ContentSeries[] {
        const rows = db.prepare(`
            SELECT id FROM content_series
            WHERE account_id = ?
            ORDER BY created_at DESC
        `).all(accountId) as any[];

        return rows.map(r => this.getSeries(r.id)!).filter(Boolean);
    }

    /**
     * 将内容包归入指定系列
     */
    static attachPackageToSeries(seriesId: string, packageId: string): void {
        const series = this.getSeries(seriesId);
        if (!series) throw new Error(`系列不存在: ${seriesId}`);

        db.prepare(`
            INSERT OR IGNORE INTO series_packages (series_id, package_id)
            VALUES (?, ?)
        `).run(seriesId, packageId);

        // 如果达到规划篇数，更新状态
        const updated = this.getSeries(seriesId);
        if (updated && updated.completedCount >= updated.plannedCount) {
            db.prepare("UPDATE content_series SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(seriesId);
        }
    }

    /**
     * 栏目健康均衡度评估 (Pillar Balance Check)
     * 根据 P1.1 设定的栏目与目标配比，对比实际产出内容包，防止某一类过度扎堆
     */
    static checkPillarBalance(accountId: number): PillarBalanceReport {
        const profile = AccountBusinessProfileService.getProfile(accountId);
        const pillars = profile.contentPillars || [];

        // 统计该账号下所有内容包关联的栏目/标签
        const pkgs = db.prepare(`
            SELECT title, tags FROM content_packages WHERE account_id = ?
        `).all(accountId) as any[];

        const totalContents = pkgs.length;

        const healthList: PillarHealth[] = pillars.map(p => {
            const currentCount = pkgs.filter(pkg => {
                const tagsStr = pkg.tags || '[]';
                return tagsStr.includes(p.name) || pkg.title.includes(p.name);
            }).length;

            const currentRatio = totalContents > 0 ? Math.round((currentCount / totalContents) * 100) : 0;
            const targetRatio = p.targetRatio || 33;

            let status: 'BALANCED' | 'UNDER' | 'OVER' = 'BALANCED';
            if (totalContents > 0) {
                if (currentRatio > targetRatio + 15) {
                    status = 'OVER';
                } else if (currentRatio < targetRatio - 15) {
                    status = 'UNDER';
                }
            } else if (targetRatio > 0) {
                status = 'UNDER';
            }

            return {
                name: p.name,
                targetRatio,
                currentCount,
                currentRatio,
                status
            };
        });

        const underPillar = healthList.find(h => h.status === 'UNDER');
        const recommendation = underPillar
            ? `栏目【${underPillar.name}】当前产出占比低于预期目标（${underPillar.currentRatio}% vs 目标 ${underPillar.targetRatio}%），建议下期优先规划该栏目选题。`
            : '当前内容栏目配比均衡健康，请保持发文节奏。';

        return {
            accountId,
            totalContents,
            pillars: healthList,
            recommendation
        };
    }

    /**
     * 跨账号协同矩阵总览 (Multi-Account Matrix Overview)
     */
    static getMultiAccountMatrix(): AccountMatrixItem[] {
        const accounts = db.prepare('SELECT id, nickname, is_active FROM accounts ORDER BY id ASC').all() as any[];

        return accounts.map(a => {
            const oppCount = db.prepare('SELECT COUNT(*) as count FROM content_opportunities WHERE account_id = ?').get(a.id) as any;
            const pkgCount = db.prepare('SELECT COUNT(*) as count FROM content_packages WHERE account_id = ?').get(a.id) as any;
            const serCount = db.prepare('SELECT COUNT(*) as count FROM content_series WHERE account_id = ?').get(a.id) as any;
            const noteCount = db.prepare('SELECT COUNT(*) as count FROM note_stats WHERE account_id = ?').get(a.id) as any;

            return {
                accountId: a.id,
                nickname: a.nickname || `账号#${a.id}`,
                isActive: Boolean(a.is_active),
                opportunitiesCount: oppCount?.count || 0,
                packagesCount: pkgCount?.count || 0,
                seriesCount: serCount?.count || 0,
                publishedNotesCount: noteCount?.count || 0
            };
        });
    }
}
