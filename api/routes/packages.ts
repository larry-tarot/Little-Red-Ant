import { Router } from 'express';
import { ContentPackageService } from '../services/core/ContentPackageService.js';
import { CardPaginationService } from '../services/core/CardPaginationService.js';

const router = Router();

// 创建内容包 (自动固化 Version 1)
router.post('/', (req, res) => {
    try {
        const {
            accountId, opportunityId, title, targetAudience,
            coreValueProposition, keyPoints, bodyMarkdown,
            coverTitleOptions, tags
        } = req.body;

        if (!accountId || !title || !bodyMarkdown) {
            return res.status(400).json({ error: '缺少必要参数: accountId, title, bodyMarkdown' });
        }

        const pkg = ContentPackageService.createPackage({
            accountId: Number(accountId),
            opportunityId,
            title,
            targetAudience,
            coreValueProposition,
            keyPoints,
            bodyMarkdown,
            coverTitleOptions,
            tags
        });

        res.status(201).json({ success: true, package: pkg });
    } catch (error: any) {
        res.status(500).json({ error: `创建内容包失败: ${error.message}` });
    }
});

// 查询账号下的内容包列表
router.get('/', (req, res) => {
    try {
        const accountId = Number(req.query.accountId);
        if (!accountId) {
            return res.status(400).json({ error: '必须提供 accountId 参数' });
        }

        const list = ContentPackageService.listPackages(accountId);
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: `查询内容包失败: ${error.message}` });
    }
});

// 查询单个内容包详情（带全部版本历史）
router.get('/:id', (req, res) => {
    try {
        const pkg = ContentPackageService.getPackage(req.params.id);
        if (!pkg) return res.status(404).json({ error: '内容包未找到' });
        res.json(pkg);
    } catch (error: any) {
        res.status(500).json({ error: `获取内容包失败: ${error.message}` });
    }
});

// 提交新版本快照 (Version Commit)
router.post('/:id/versions', (req, res) => {
    try {
        const {
            title, targetAudience, coreValueProposition,
            keyPoints, bodyMarkdown, coverTitleOptions,
            tags, changeSummary
        } = req.body;

        if (!title || !bodyMarkdown) {
            return res.status(400).json({ error: '缺少提交版本的必要参数: title, bodyMarkdown' });
        }

        const pkg = ContentPackageService.commitVersion(req.params.id, {
            title,
            targetAudience,
            coreValueProposition,
            keyPoints,
            bodyMarkdown,
            coverTitleOptions,
            tags,
            changeSummary
        });

        res.json({ success: true, package: pkg });
    } catch (error: any) {
        res.status(500).json({ error: `提交新版本失败: ${error.message}` });
    }
});

// 查询指定历史版本
router.get('/:id/versions/:versionNumber', (req, res) => {
    try {
        const version = ContentPackageService.getPackageVersion(req.params.id, Number(req.params.versionNumber));
        if (!version) return res.status(404).json({ error: '指定版本未找到' });
        res.json(version);
    } catch (error: any) {
        res.status(500).json({ error: `获取历史版本失败: ${error.message}` });
    }
});

// 一键导出/同步至传统草稿箱 Drafts
router.post('/:id/export-draft', (req, res) => {
    try {
        const { draftId } = ContentPackageService.exportToDraft(req.params.id);
        res.json({ success: true, draftId });
    } catch (error: any) {
        res.status(500).json({ error: `同步草稿箱失败: ${error.message}` });
    }
});

// 计算并预览内容包的图文切页 (Slides)
router.post('/:id/slides', (req, res) => {
    try {
        const pkg = ContentPackageService.getPackage(req.params.id);
        if (!pkg) return res.status(404).json({ error: '内容包未找到' });

        const slides = CardPaginationService.splitIntoSlides({
            title: req.body.title || pkg.title,
            targetAudience: req.body.targetAudience || pkg.targetAudience,
            keyPoints: req.body.keyPoints || pkg.keyPoints,
            bodyMarkdown: req.body.bodyMarkdown || pkg.bodyMarkdown,
            tags: req.body.tags || pkg.tags,
            includeCta: req.body.includeCta
        });

        res.json({ success: true, slides });
    } catch (error: any) {
        res.status(500).json({ error: `计算分页失败: ${error.message}` });
    }
});

// 组装最终待发布包 (Release Bundle)
router.post('/:id/release-bundle', (req, res) => {
    try {
        const pkg = ContentPackageService.getPackage(req.params.id);
        if (!pkg) return res.status(404).json({ error: '内容包未找到' });

        const slides = CardPaginationService.splitIntoSlides({
            title: pkg.title,
            targetAudience: pkg.targetAudience,
            keyPoints: pkg.keyPoints,
            bodyMarkdown: pkg.bodyMarkdown,
            tags: pkg.tags
        });

        const bundle = CardPaginationService.buildReleaseBundle({
            accountId: pkg.accountId,
            packageId: pkg.id,
            versionNumber: pkg.currentVersion,
            title: pkg.title,
            bodyMarkdown: pkg.bodyMarkdown,
            tags: pkg.tags,
            slides,
            imageUrls: req.body.imageUrls || []
        });

        res.json({ success: true, bundle });
    } catch (error: any) {
        res.status(500).json({ error: `组装发布包失败: ${error.message}` });
    }
});

export default router;
