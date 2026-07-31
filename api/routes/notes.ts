import express from 'express';
import { NoteService } from '../services/core/NoteService.js';
import { FileCleanupService } from '../services/core/FileCleanupService.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { DeleteNoteBodySchema, IdParamSchema, ListNotesQuerySchema } from '../schemas/index.js';

const router = express.Router();

// Get list of managed notes
router.get('/', validateQuery(ListNotesQuerySchema), (req, res) => {
    try {
        const { page, pageSize, accountId, keyword } = req.query as any;

        console.log(`[API] Get Notes - Page: ${page}, AccountId: ${accountId}, Keyword: ${keyword}`);

        const result = NoteService.listNotes(page, pageSize, accountId, keyword);
        console.log(`[API] Get Notes - Found ${result.data.length} records`);

        res.json({
            success: true,
            data: result.data,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize
        });
    } catch (error) {
        console.error('Get notes failed:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete a note (Create Task)
router.delete('/:id', validateParams(IdParamSchema), validateBody(DeleteNoteBodySchema), async (req, res) => {
    try {
        const noteId = req.params.id;
        const { accountId } = req.body; // Need account ID to know which cookies to use

        // 未提供 accountId 时，从笔记记录中查找
        if (!accountId) {
            const note = NoteService.getNoteAccountId(noteId);
            if (!note) {
                return res.status(404).json({ success: false, error: 'Note not found' });
            }
        }

        // 1. 清理本地封面图片文件
        const noteRecord = NoteService.getNoteCoverImage(noteId);
        if (noteRecord && noteRecord.cover_image) {
            await FileCleanupService.deleteFiles([noteRecord.cover_image]);
        }

        // 2. 删除本地数据库记录
        // NOTE: 暂未实现 RPA 删除平台笔记，仅删除本地记录
        // TODO: 实现 RPA Delete
        NoteService.deleteNote(noteId);

        res.json({ success: true, message: 'Local record deleted' });
    } catch (error) {
        console.error('Delete note failed:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
