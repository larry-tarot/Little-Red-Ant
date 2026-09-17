import db from '../../db.js';

export interface BrandKit {
    accountId: number;
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: 'sans' | 'serif' | 'mono';
    watermarkText?: string;
    coverLayout: 'BOLD_MINIMAL' | 'MAGAZINE' | 'SPLIT_HEADER' | 'CARD_BADGE';
    isApproved: boolean;
    approvedSampleUrl?: string;
    approvedAt?: string;
    updatedAt?: string;
}

export interface CardSlidePreview {
    type: 'COVER' | 'POINT' | 'CTA';
    headline: string;
    subheadline?: string;
    body?: string;
    watermark?: string;
    style: {
        primaryColor: string;
        accentColor: string;
        backgroundColor: string;
        textColor: string;
        fontFamily: string;
        coverLayout: string;
    };
}

export const DEFAULT_BRAND_KIT: Omit<BrandKit, 'accountId'> = {
    primaryColor: '#FF2442',      // 小红书红
    accentColor: '#F59E0B',       // 温暖琥珀黄
    backgroundColor: '#FFFFFF',   // 简约白
    textColor: '#1E293B',         // 深板岩灰
    fontFamily: 'sans',
    watermarkText: undefined,
    coverLayout: 'BOLD_MINIMAL',
    isApproved: false
};

export class BrandKitService {
    /**
     * 获取指定账号的品牌视觉资产规范
     */
    static getBrandKit(accountId: number): BrandKit {
        const row = db.prepare(`
            SELECT brand_kit FROM account_profiles WHERE account_id = ?
        `).get(accountId) as any;

        if (!row || !row.brand_kit) {
            return {
                accountId,
                ...DEFAULT_BRAND_KIT
            };
        }

        try {
            const parsed = JSON.parse(row.brand_kit);
            return {
                accountId,
                primaryColor: parsed.primaryColor || DEFAULT_BRAND_KIT.primaryColor,
                accentColor: parsed.accentColor || DEFAULT_BRAND_KIT.accentColor,
                backgroundColor: parsed.backgroundColor || DEFAULT_BRAND_KIT.backgroundColor,
                textColor: parsed.textColor || DEFAULT_BRAND_KIT.textColor,
                fontFamily: parsed.fontFamily || DEFAULT_BRAND_KIT.fontFamily,
                watermarkText: parsed.watermarkText,
                coverLayout: parsed.coverLayout || DEFAULT_BRAND_KIT.coverLayout,
                isApproved: Boolean(parsed.isApproved),
                approvedSampleUrl: parsed.approvedSampleUrl,
                approvedAt: parsed.approvedAt,
                updatedAt: parsed.updatedAt
            };
        } catch (_) {
            return {
                accountId,
                ...DEFAULT_BRAND_KIT
            };
        }
    }

    /**
     * 更新品牌视觉资产（一旦改动核心属性，自动重置 isApproved 为 false）
     */
    static updateBrandKit(accountId: number, data: Partial<Omit<BrandKit, 'accountId'>>): BrandKit {
        const current = this.getBrandKit(accountId);

        const updated: BrandKit = {
            ...current,
            ...data,
            accountId,
            isApproved: false, // 改动后需重新核准
            updatedAt: new Date().toISOString()
        };

        this.persistBrandKit(accountId, updated);
        return updated;
    }

    /**
     * 创作者人工确认样图，正式固化为官方批准标准 (APPROVED)
     */
    static approveBrandKit(accountId: number, sampleSnapshotUrl?: string): BrandKit {
        const current = this.getBrandKit(accountId);

        const approved: BrandKit = {
            ...current,
            isApproved: true,
            approvedSampleUrl: sampleSnapshotUrl || current.approvedSampleUrl,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.persistBrandKit(accountId, approved);
        return approved;
    }

    /**
     * 基于当前视觉规范渲染 3:4 样图预览
     */
    static renderSamplePreviews(kit: BrandKit, sample?: { title?: string; keyPoint?: string }): CardSlidePreview[] {
        const title = sample?.title || '视觉规范标准封面样图';
        const point = sample?.keyPoint || '核心避坑与重点知识展示样张';

        const style = {
            primaryColor: kit.primaryColor,
            accentColor: kit.accentColor,
            backgroundColor: kit.backgroundColor,
            textColor: kit.textColor,
            fontFamily: kit.fontFamily,
            coverLayout: kit.coverLayout
        };

        return [
            {
                type: 'COVER',
                headline: title,
                subheadline: '3步带你吃透核心原理，建立专业视觉心智',
                watermark: kit.watermarkText,
                style
            },
            {
                type: 'POINT',
                headline: point,
                body: '通过对比实测示波器波形与温升曲线，清晰标注重点排查区域，提升图文信息密度与专业可信度。',
                watermark: kit.watermarkText,
                style
            },
            {
                type: 'CTA',
                headline: '总结与收藏',
                subheadline: '如果对你有启发，欢迎点赞收藏并在评论区交流探讨',
                watermark: kit.watermarkText,
                style
            }
        ];
    }

    private static persistBrandKit(accountId: number, kit: BrandKit): void {
        const row = db.prepare('SELECT account_id FROM account_profiles WHERE account_id = ?').get(accountId);

        if (!row) {
            // 不存在档案时先初始化插入
            db.prepare(`
                INSERT INTO account_profiles (account_id, brand_kit, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `).run(accountId, JSON.stringify(kit));
        } else {
            db.prepare(`
                UPDATE account_profiles
                SET brand_kit = ?, updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ?
            `).run(JSON.stringify(kit), accountId);
        }
    }
}
