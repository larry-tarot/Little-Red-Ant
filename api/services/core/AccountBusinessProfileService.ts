import db from '../../db.js';

export interface TargetAudience {
    identity: string;
    painPoints: string[];
    misconceptions: string[];
}

export interface ContentPillar {
    name: string;
    description: string;
    targetRatio?: number; // 预期占比 0-100
}

export interface AccountBusinessProfile {
    accountId: number;
    goals: string[];
    targetAudience: TargetAudience;
    uniqueCapabilities: string[];
    contentPillars: ContentPillar[];
    expressionBoundaries: string[];
    toneStyle: string;
    brandKit?: Record<string, any>;
    isComplete?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export class AccountBusinessProfileService {
    /**
     * 获取指定账号的经营档案，若尚未配置则返回空档案默认结构
     */
    static getProfile(accountId: number): AccountBusinessProfile {
        const row = db.prepare(`
            SELECT * FROM account_profiles WHERE account_id = ?
        `).get(accountId) as any;

        if (!row) {
            return {
                accountId,
                goals: [],
                targetAudience: {
                    identity: '',
                    painPoints: [],
                    misconceptions: []
                },
                uniqueCapabilities: [],
                contentPillars: [],
                expressionBoundaries: [],
                toneStyle: '',
                isComplete: false
            };
        }

        return {
            accountId: row.account_id,
            goals: row.goals ? JSON.parse(row.goals) : [],
            targetAudience: row.target_audience ? JSON.parse(row.target_audience) : { identity: '', painPoints: [], misconceptions: [] },
            uniqueCapabilities: row.unique_capabilities ? JSON.parse(row.unique_capabilities) : [],
            contentPillars: row.content_pillars ? JSON.parse(row.content_pillars) : [],
            expressionBoundaries: row.expression_boundaries ? JSON.parse(row.expression_boundaries) : [],
            toneStyle: row.tone_style || '',
            brandKit: row.brand_kit ? JSON.parse(row.brand_kit) : undefined,
            isComplete: Boolean(row.is_complete),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * 保存/更新账号经营档案
     */
    static saveProfile(profile: AccountBusinessProfile): void {
        const isComplete = (
            (profile.goals && profile.goals.length > 0) &&
            Boolean(profile.targetAudience?.identity) &&
            (profile.uniqueCapabilities && profile.uniqueCapabilities.length > 0) &&
            (profile.contentPillars && profile.contentPillars.length > 0)
        );

        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO account_profiles (
                account_id, goals, target_audience, unique_capabilities,
                content_pillars, expression_boundaries, tone_style, brand_kit,
                is_complete, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
                goals = excluded.goals,
                target_audience = excluded.target_audience,
                unique_capabilities = excluded.unique_capabilities,
                content_pillars = excluded.content_pillars,
                expression_boundaries = excluded.expression_boundaries,
                tone_style = excluded.tone_style,
                brand_kit = excluded.brand_kit,
                is_complete = excluded.is_complete,
                updated_at = excluded.updated_at
        `).run(
            profile.accountId,
            JSON.stringify(profile.goals || []),
            JSON.stringify(profile.targetAudience || { identity: '', painPoints: [], misconceptions: [] }),
            JSON.stringify(profile.uniqueCapabilities || []),
            JSON.stringify(profile.contentPillars || []),
            JSON.stringify(profile.expressionBoundaries || []),
            profile.toneStyle || '',
            profile.brandKit ? JSON.stringify(profile.brandKit) : null,
            isComplete ? 1 : 0,
            now
        );
    }

    /**
     * 将账号档案导出为结构化 Prompt 注入上下文
     */
    static exportPromptContext(accountId: number): string {
        const p = this.getProfile(accountId);

        const sections: string[] = [
            '【账号经营定位与人设约束】',
            `- 经营目标: ${p.goals.length ? p.goals.join('、') : '暂未设定'}`,
            `- 目标受众: ${p.targetAudience.identity || '未定义受众'}`,
            p.targetAudience.painPoints.length ? `  * 受众高频痛点: ${p.targetAudience.painPoints.join('；')}` : '',
            p.targetAudience.misconceptions.length ? `  * 常见认知误区: ${p.targetAudience.misconceptions.join('；')}` : '',
            `- 独特能力与资产: ${p.uniqueCapabilities.length ? p.uniqueCapabilities.join('；') : '未声明'}`,
            `- 内容栏目: ${p.contentPillars.length ? p.contentPillars.map(c => `${c.name}(${c.description})`).join('；') : '未设定'}`,
            `- 表达红线与禁区: ${p.expressionBoundaries.length ? p.expressionBoundaries.join('；') : '无特殊限制'}`,
            `- 语言基调: ${p.toneStyle || '亲切真诚、客观实用'}`
        ];

        return sections.filter(Boolean).join('\n');
    }
}
