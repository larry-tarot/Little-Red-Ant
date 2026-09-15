import crypto from 'node:crypto';
import db from '../../db.js';
import { DraftService } from './DraftService.js';

export interface ContentPackageVersion {
    id?: number;
    packageId: string;
    versionNumber: number;
    title: string;
    targetAudience?: string;
    coreValueProposition?: string;
    keyPoints: string[];
    bodyMarkdown: string;
    coverTitleOptions: string[];
    tags: string[];
    changeSummary?: string;
    createdAt?: string;
}

export interface ContentPackage {
    id: string;
    accountId: number;
    opportunityId?: string;
    title: string;
    targetAudience?: string;
    coreValueProposition?: string;
    keyPoints: string[];
    bodyMarkdown: string;
    coverTitleOptions: string[];
    tags: string[];
    currentVersion: number;
    linkedDraftId?: number;
    versions: ContentPackageVersion[];
    createdAt?: string;
    updatedAt?: string;
}

export class ContentPackageService {
    /**
     * 创建结构化内容包，并自动固化第 1 个不可变快照版本
     */
    static createPackage(data: {
        accountId: number;
        opportunityId?: string;
        title: string;
        targetAudience?: string;
        coreValueProposition?: string;
        keyPoints?: string[];
        bodyMarkdown: string;
        coverTitleOptions?: string[];
        tags?: string[];
    }): ContentPackage {
        const id = 'pkg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const keyPoints = data.keyPoints || [];
        const coverTitleOptions = data.coverTitleOptions || [];
        const tags = data.tags || [];

        // 插入主记录
        db.prepare(`
            INSERT INTO content_packages (
                id, account_id, opportunity_id, title, target_audience,
                core_value_proposition, key_points, body_markdown, cover_title_options,
                tags, current_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
            id,
            data.accountId,
            data.opportunityId || null,
            data.title,
            data.targetAudience || null,
            data.coreValueProposition || null,
            JSON.stringify(keyPoints),
            data.bodyMarkdown,
            JSON.stringify(coverTitleOptions),
            JSON.stringify(tags)
        );

        // 固化 Version 1 快照
        db.prepare(`
            INSERT INTO content_package_versions (
                package_id, version_number, title, target_audience,
                core_value_proposition, key_points, body_markdown, cover_title_options,
                tags, change_summary
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, '初始创建版本')
        `).run(
            id,
            data.title,
            data.targetAudience || null,
            data.coreValueProposition || null,
            JSON.stringify(keyPoints),
            data.bodyMarkdown,
            JSON.stringify(coverTitleOptions),
            JSON.stringify(tags)
        );

        return this.getPackage(id)!;
    }

    /**
     * 提交新版本快照（自动递增版本号并更新当前主记录）
     */
    static commitVersion(packageId: string, data: {
        title: string;
        targetAudience?: string;
        coreValueProposition?: string;
        keyPoints?: string[];
        bodyMarkdown: string;
        coverTitleOptions?: string[];
        tags?: string[];
        changeSummary?: string;
    }): ContentPackage {
        const pkg = this.getPackage(packageId);
        if (!pkg) {
            throw new Error(`内容包不存在: ${packageId}`);
        }

        const newVersionNumber = pkg.currentVersion + 1;
        const keyPoints = data.keyPoints || pkg.keyPoints || [];
        const coverTitleOptions = data.coverTitleOptions || pkg.coverTitleOptions || [];
        const tags = data.tags || pkg.tags || [];
        const targetAudience = data.targetAudience !== undefined ? data.targetAudience : pkg.targetAudience;
        const coreValueProposition = data.coreValueProposition !== undefined ? data.coreValueProposition : pkg.coreValueProposition;
        const changeSummary = data.changeSummary || `版本 v${newVersionNumber}`;

        // 插入版本快照
        db.prepare(`
            INSERT INTO content_package_versions (
                package_id, version_number, title, target_audience,
                core_value_proposition, key_points, body_markdown, cover_title_options,
                tags, change_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            packageId,
            newVersionNumber,
            data.title,
            targetAudience || null,
            coreValueProposition || null,
            JSON.stringify(keyPoints),
            data.bodyMarkdown,
            JSON.stringify(coverTitleOptions),
            JSON.stringify(tags),
            changeSummary
        );

        // 更新主表当前状态
        db.prepare(`
            UPDATE content_packages
            SET title = ?,
                target_audience = ?,
                core_value_proposition = ?,
                key_points = ?,
                body_markdown = ?,
                cover_title_options = ?,
                tags = ?,
                current_version = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            data.title,
            targetAudience || null,
            coreValueProposition || null,
            JSON.stringify(keyPoints),
            data.bodyMarkdown,
            JSON.stringify(coverTitleOptions),
            JSON.stringify(tags),
            newVersionNumber,
            packageId
        );

        return this.getPackage(packageId)!;
    }

    /**
     * 查询单个内容包（带版本历史）
     */
    static getPackage(id: string): ContentPackage | null {
        const row = db.prepare('SELECT * FROM content_packages WHERE id = ?').get(id) as any;
        if (!row) return null;

        const versionRows = db.prepare(`
            SELECT * FROM content_package_versions
            WHERE package_id = ?
            ORDER BY version_number ASC
        `).all(id) as any[];

        const versions: ContentPackageVersion[] = versionRows.map(v => ({
            id: v.id,
            packageId: v.package_id,
            versionNumber: v.version_number,
            title: v.title,
            targetAudience: v.target_audience || undefined,
            coreValueProposition: v.core_value_proposition || undefined,
            keyPoints: JSON.parse(v.key_points || '[]'),
            bodyMarkdown: v.body_markdown,
            coverTitleOptions: JSON.parse(v.cover_title_options || '[]'),
            tags: JSON.parse(v.tags || '[]'),
            changeSummary: v.change_summary || undefined,
            createdAt: v.created_at
        }));

        return {
            id: row.id,
            accountId: row.account_id,
            opportunityId: row.opportunity_id || undefined,
            title: row.title,
            targetAudience: row.target_audience || undefined,
            coreValueProposition: row.core_value_proposition || undefined,
            keyPoints: JSON.parse(row.key_points || '[]'),
            bodyMarkdown: row.body_markdown,
            coverTitleOptions: JSON.parse(row.cover_title_options || '[]'),
            tags: JSON.parse(row.tags || '[]'),
            currentVersion: row.current_version,
            linkedDraftId: row.linked_draft_id || undefined,
            versions,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * 查询指定版本
     */
    static getPackageVersion(packageId: string, versionNumber: number): ContentPackageVersion | null {
        const v = db.prepare(`
            SELECT * FROM content_package_versions
            WHERE package_id = ? AND version_number = ?
        `).get(packageId, versionNumber) as any;
        if (!v) return null;

        return {
            id: v.id,
            packageId: v.package_id,
            versionNumber: v.version_number,
            title: v.title,
            targetAudience: v.target_audience || undefined,
            coreValueProposition: v.core_value_proposition || undefined,
            keyPoints: JSON.parse(v.key_points || '[]'),
            bodyMarkdown: v.body_markdown,
            coverTitleOptions: JSON.parse(v.cover_title_options || '[]'),
            tags: JSON.parse(v.tags || '[]'),
            changeSummary: v.change_summary || undefined,
            createdAt: v.created_at
        };
    }

    /**
     * 获取账号的所有内容包
     */
    static listPackages(accountId: number): ContentPackage[] {
        const rows = db.prepare(`
            SELECT id FROM content_packages
            WHERE account_id = ?
            ORDER BY updated_at DESC
        `).all(accountId) as any[];

        return rows.map(r => this.getPackage(r.id)!).filter(Boolean);
    }

    /**
     * 同步/导出至传统草稿箱 Drafts
     */
    static exportToDraft(packageId: string): { draftId: number } {
        const pkg = this.getPackage(packageId);
        if (!pkg) throw new Error(`内容包不存在: ${packageId}`);

        let draftId: number;

        if (pkg.linkedDraftId) {
            // 已有草稿则更新
            DraftService.updateDraft(String(pkg.linkedDraftId), {
                title: pkg.title,
                content: pkg.bodyMarkdown,
                tags: pkg.tags,
                contentType: 'note',
                meta_data: JSON.stringify({
                    fromPackageId: pkg.id,
                    versionNumber: pkg.currentVersion,
                    keyPoints: pkg.keyPoints,
                    coverTitleOptions: pkg.coverTitleOptions
                })
            });
            draftId = pkg.linkedDraftId;
        } else {
            // 新建草稿
            draftId = Number(DraftService.createDraft({
                title: pkg.title,
                content: pkg.bodyMarkdown,
                tags: pkg.tags,
                images: [],
                contentType: 'note',
                meta_data: JSON.stringify({
                    fromPackageId: pkg.id,
                    versionNumber: pkg.currentVersion,
                    keyPoints: pkg.keyPoints,
                    coverTitleOptions: pkg.coverTitleOptions
                })
            }));

            // 回填关联 draft_id
            db.prepare('UPDATE content_packages SET linked_draft_id = ? WHERE id = ?').run(draftId, packageId);
        }

        return { draftId };
    }
}
