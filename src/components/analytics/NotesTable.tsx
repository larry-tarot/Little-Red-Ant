import React from 'react';
import { Eye, ExternalLink, Loader2 } from 'lucide-react';
import type { NoteStat, PaginationState } from './types';

interface NotesTableProps {
    notes: NoteStat[];
    loading: boolean;
    pagination: PaginationState;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onOpenInBrowser: (noteId: string) => void;
}

/**
 * 功能描述：构建小红书笔记外部链接
 *
 * 参数说明：
 * - noteId: [string] 笔记 ID
 * - xsecToken: [string | undefined] 可选的 xsec_token
 *
 * 返回说明：
 * - string 完整的小红书笔记 URL
 */
function buildNoteUrl(noteId: string, xsecToken?: string): string {
    const base = `https://www.xiaohongshu.com/explore/${noteId}`;
    const params = new URLSearchParams({ xsec_source: 'pc_feed' });
    if (xsecToken) params.set('xsec_token', xsecToken);
    return `${base}?${params.toString()}`;
}

/**
 * 功能描述：笔记列表表格组件
 *
 * 设计思路：
 * 将表格、分页、每页条数选择封装为独立组件，减少主页面代码量。
 */
export function NotesTable({
    notes,
    loading,
    pagination,
    onPageChange,
    onPageSizeChange,
    onOpenInBrowser
}: NotesTableProps) {
    const totalPages = Math.ceil(pagination.total / pagination.pageSize);

    return (
        <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden relative">
            {loading && (
                <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary" size={24} />
                </div>
            )}

            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                <h3 className="text-lg font-medium text-text">近期笔记表现</h3>
                <div className="flex items-center text-sm text-text-tertiary">
                    <span className="mr-2">每页显示:</span>
                    <select
                        value={pagination.pageSize}
                        onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                        disabled={loading}
                        className="border-strong rounded-md text-sm focus:ring-primary focus:border-primary disabled:opacity-50"
                    >
                        <option value="10">10条</option>
                        <option value="20">20条</option>
                        <option value="50">50条</option>
                        <option value="100">100条</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-muted">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                                笔记
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                                阅读
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                                点赞
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                                收藏
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                                评论
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {notes.map((note) => {
                            const noteUrl = buildNoteUrl(note.note_id, note.xsec_token);
                            return (
                                <tr key={note.note_id} className="hover:bg-surface-muted">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 flex-shrink-0">
                                                {note.cover_image ? (
                                                    <a href={noteUrl} target="_blank" rel="noopener noreferrer">
                                                        <img
                                                            className="h-10 w-10 rounded object-cover hover:opacity-80 transition-opacity"
                                                            src={note.cover_image}
                                                            alt=""
                                                        />
                                                    </a>
                                                ) : (
                                                    <div className="h-10 w-10 rounded bg-surface-hover flex items-center justify-center">
                                                        <span className="text-xs text-text-tertiary">No Img</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-4 flex flex-col">
                                                <div className="flex items-center">
                                                    <a
                                                        href={noteUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm font-medium text-text truncate max-w-xs hover:text-primary hover:underline"
                                                        title={note.title}
                                                    >
                                                        {note.title}
                                                    </a>
                                                    <button
                                                        onClick={() => onOpenInBrowser(note.note_id)}
                                                        className="ml-2 text-text-tertiary hover:text-primary p-1 rounded-full hover:bg-primary-subtle transition-colors"
                                                        title="以当前身份查看 (RPA浏览器 - 自动登录)"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <a
                                                        href={noteUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="ml-1 text-text-tertiary hover:text-text-tertiary p-1"
                                                        title="普通浏览器打开 (需手动登录)"
                                                    >
                                                        <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                                <div
                                                    className="text-xs text-text-tertiary"
                                                    title={`发布时间: ${note.publish_date ? new Date(note.publish_date).toLocaleString() : '未知'}`}
                                                >
                                                    {note.publish_date
                                                        ? new Date(note.publish_date).toLocaleDateString()
                                                        : '发布时间未知'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {note.views}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {note.likes}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {note.collects}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                        {note.comments}
                                    </td>
                                </tr>
                            );
                        })}
                        {notes.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-text-tertiary">
                                    暂无数据，请点击右上角“同步最新数据”
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-surface px-4 py-3 flex items-center justify-between border-t border-border sm:px-6">
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-text-secondary">
                            显示 <span className="font-medium">{pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0}</span> 到{' '}
                            <span className="font-medium">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> 条，共{' '}
                            <span className="font-medium">{pagination.total}</span> 条
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => onPageChange(pagination.page - 1)}
                                disabled={pagination.page === 1 || loading}
                                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-strong bg-surface text-sm font-medium ${
                                    pagination.page === 1 || loading
                                        ? 'text-text-tertiary cursor-not-allowed'
                                        : 'text-text-tertiary hover:bg-surface-muted'
                                }`}
                            >
                                上一页
                            </button>

                            <span className="relative inline-flex items-center px-4 py-2 border border-strong bg-surface text-sm font-medium text-text-secondary">
                                第 {pagination.page} 页 / 共 {totalPages > 0 ? totalPages : 1} 页
                            </span>

                            <button
                                onClick={() => onPageChange(pagination.page + 1)}
                                disabled={pagination.page >= totalPages || loading}
                                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-strong bg-surface text-sm font-medium ${
                                    pagination.page >= totalPages || loading
                                        ? 'text-text-tertiary cursor-not-allowed'
                                        : 'text-text-tertiary hover:bg-surface-muted'
                                }`}
                            >
                                下一页
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
}
