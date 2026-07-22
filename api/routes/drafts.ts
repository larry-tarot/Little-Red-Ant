import { Router } from 'express';
import { AssetService } from '../services/asset/AssetService.js';
import { DraftService } from '../services/core/DraftService.js';
import { FileCleanupService } from '../services/core/FileCleanupService.js';

const router = Router();

/**
 * 功能描述：将图片数组本地化（外部 URL 下载到本地）
 *
 * 参数说明：
 * - images: [any[]] 图片数组，元素可为 string 或 {url, prompt} 对象
 *
 * 返回说明：
 * - any[] 本地化后的图片数组（保持原格式）
 *
 * NOTE: 异步并行处理，提升下载效率
 */
const localizeImages = async (images: any[]) => {
    if (!images || !Array.isArray(images)) return [];

    // 并行下载所有图片
    const localized = await Promise.all(images.map(async (img) => {
        // 兼容 string 和 {url, prompt} 两种格式
        const url = typeof img === 'string' ? img : img.url;
        const prompt = typeof img === 'string' ? '' : img.prompt;

        if (!url) return img;

        let localUrl = url;
        // 仅对外部 http 链接做本地化（localhost 跳过）
        if (url.startsWith('http') && !url.includes('localhost')) {
            localUrl = await AssetService.downloadAndLocalize(url, 'image');
        }

        // 返回与输入相同的格式
        if (typeof img === 'string') return localUrl;
        return { ...img, url: localUrl };
    }));
    return localized;
};

// Get all drafts
router.get('/', (req, res) => {
    try {
        const drafts = DraftService.getAllDrafts();
        res.json(drafts);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to fetch drafts' });
    }
});

// Create draft
router.post('/', async (req, res) => {
    const { title, content, tags, images, contentType, meta_data } = req.body;
    try {
        // 保存前先本地化图片
        const localImages = await localizeImages(images || []);

        const id = DraftService.createDraft({
            title,
            content,
            tags,
            images: localImages,
            contentType,
            meta_data
        });
        res.json({ id, success: true, images: localImages });
    } catch (error) {
        console.error('Create draft failed:', error);
        res.status(500).json({ error: 'Failed to create draft' });
    }
});

// Update draft
router.put('/:id', async (req, res) => {
    const { title, content, tags, images, contentType, meta_data } = req.body;
    try {
        // 更新前先本地化图片
        const localImages = await localizeImages(images || []);

        DraftService.updateDraft(req.params.id, {
            title,
            content,
            tags,
            images: localImages,
            contentType,
            meta_data
        });
        res.json({ success: true, images: localImages });
    } catch (error) {
        console.error('Update draft failed:', error);
        res.status(500).json({ error: 'Failed to update draft' });
    }
});

// Delete draft
router.delete('/:id', async (req, res) => {
    try {
        const draftId = req.params.id;

        // 1. 获取草稿关联的图片列表
        const images = DraftService.getDraftImages(draftId);

        // 2. 清理本地图片文件
        if (images.length > 0) {
            await FileCleanupService.deleteFiles(images);
        }

        // 3. 删除数据库记录
        DraftService.deleteDraft(draftId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete draft failed:', error);
        res.status(500).json({ error: 'Failed to delete draft' });
    }
});

export default router;
