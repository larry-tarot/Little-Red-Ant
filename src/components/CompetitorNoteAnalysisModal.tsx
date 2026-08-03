import React from 'react';
import { X, Sparkles, Image, Layers, Target, Lightbulb, Copy, BookOpen, Wand2, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

/**
 * 竞品笔记 AI 拆解模态框组件
 *
 * 功能说明：
 * - 展示 AI 对竞品笔记的多维度分析结果
 * - 支持复制关键句子到剪贴板
 * - 支持加入素材库（toast 提示）
 * - 支持以此为模板跳转到创作页面
 */

interface CompetitorNoteAnalysisModalProps {
    note: any;
    analysis: {
        title_technique: string;
        cover_analysis: string;
        structure_analysis: string;
        hook_technique: string;
        writing_tips: string[];
        key_sentences: string[];
        copy_options: string[];
    };
    onClose: () => void;
}

const CompetitorNoteAnalysisModal: React.FC<CompetitorNoteAnalysisModalProps> = ({ note, analysis, onClose }) => {
    const navigate = useNavigate();

    // 复制关键句子到剪贴板
    const handleCopySentence = async (sentence: string) => {
        try {
            await navigator.clipboard.writeText(sentence);
            toast.success('已复制到剪贴板');
        } catch {
            toast.error('复制失败');
        }
    };

    // 加入素材库（简化版：toast 提示）
    const handleAddToAssets = () => {
        toast.success(`已将"${note.title}"的关键句子加入素材库（功能演示）`);
    };

    // 以此为模板创作
    const handleUseAsTemplate = () => {
        navigate('/generate', {
            state: {
                remixNote: {
                    title: note.title,
                    structure: {
                        title_technique: analysis.title_technique,
                        cover_analysis: analysis.cover_analysis,
                        structure_analysis: analysis.structure_analysis,
                        hook_technique: analysis.hook_technique,
                        writing_tips: analysis.writing_tips,
                        key_sentences: analysis.key_sentences,
                        copy_options: analysis.copy_options
                    },
                    type: note.type || 'note'
                }
            }
        });
        toast.success(`已引用结构：${note.title}`);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    {/* 头部 */}
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-text flex items-center">
                                <Sparkles className="inline-block mr-2 text-primary" size={24} />
                                AI 拆解分析
                            </h3>
                            <p className="text-sm text-text-tertiary mt-1 truncate max-w-md">
                                {note.title}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* 笔记数据 */}
                        <div className="flex items-center space-x-4 text-xs text-text-tertiary bg-surface-muted rounded-lg p-3">
                            <span>点赞 {note.likes?.toLocaleString() || 0}</span>
                            <span>收藏 {note.collects?.toLocaleString() || 0}</span>
                            <span>评论 {note.comments?.toLocaleString() || 0}</span>
                        </div>

                        {/* 标题技巧 */}
                        <div className="bg-surface-muted p-4 rounded-md">
                            <h4 className="font-medium text-text mb-2 flex items-center">
                                <Target size={16} className="mr-2 text-primary" />
                                标题技巧
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {analysis.title_technique}
                            </p>
                        </div>

                        {/* 封面分析 */}
                        <div className="bg-surface-muted p-4 rounded-md">
                            <h4 className="font-medium text-text mb-2 flex items-center">
                                <Image size={16} className="mr-2 text-primary" />
                                封面分析
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {analysis.cover_analysis}
                            </p>
                        </div>

                        {/* 结构分析 */}
                        <div className="bg-surface-muted p-4 rounded-md">
                            <h4 className="font-medium text-text mb-2 flex items-center">
                                <Layers size={16} className="mr-2 text-primary" />
                                结构分析
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {analysis.structure_analysis}
                            </p>
                        </div>

                        {/* 钩子手法 */}
                        <div className="bg-surface-muted p-4 rounded-md">
                            <h4 className="font-medium text-text mb-2 flex items-center">
                                <Target size={16} className="mr-2 text-primary" />
                                钩子手法
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {analysis.hook_technique}
                            </p>
                        </div>

                        {/* 学习要点 / 写作技巧 */}
                        <div className="bg-success-subtle p-4 rounded-md border border-success-subtle">
                            <h4 className="font-medium text-success mb-2 flex items-center">
                                <Lightbulb size={16} className="mr-2" />
                                学习要点
                            </h4>
                            <ul className="list-disc list-inside text-sm text-success space-y-1">
                                {analysis.writing_tips?.map((tip: string, i: number) => (
                                    <li key={i}>{tip}</li>
                                ))}
                            </ul>
                        </div>

                        {/* 关键句子（可复制） */}
                        <div className="bg-primary-subtle p-4 rounded-md border border-primary-subtle">
                            <h4 className="font-medium text-primary mb-2 flex items-center">
                                <BookOpen size={16} className="mr-2" />
                                关键句子（点击复制）
                            </h4>
                            <div className="space-y-2">
                                {analysis.key_sentences?.map((sentence: string, i: number) => (
                                    <div
                                        key={i}
                                        onClick={() => handleCopySentence(sentence)}
                                        className="flex items-center justify-between bg-white/50 rounded-md p-2.5 text-sm text-text-secondary cursor-pointer hover:bg-white/80 transition-colors group"
                                    >
                                        <span className="flex-1 mr-2">{sentence}</span>
                                        <Copy size={14} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 仿写选项 */}
                        {analysis.copy_options && analysis.copy_options.length > 0 && (
                            <div className="bg-surface-muted p-4 rounded-md">
                                <h4 className="font-medium text-text mb-2 flex items-center">
                                    <Wand2 size={16} className="mr-2 text-primary" />
                                    仿写选题建议
                                </h4>
                                <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                                    {analysis.copy_options.map((option: string, i: number) => (
                                        <li key={i}>{option}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* 底部操作栏 */}
                    <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-border">
                        <button
                            onClick={handleAddToAssets}
                            className="px-4 py-2 border border-strong rounded-md text-text-secondary hover:bg-surface-muted flex items-center text-sm font-medium"
                        >
                            <Check size={16} className="mr-2" />
                            加入素材库
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-strong rounded-md text-text-secondary hover:bg-surface-muted text-sm font-medium"
                        >
                            关闭
                        </button>
                        <button
                            onClick={handleUseAsTemplate}
                            className="px-4 py-2 bg-primary text-primary-text rounded-md hover:bg-primary-hover flex items-center text-sm font-medium"
                        >
                            <Wand2 size={16} className="mr-2" />
                            以此为模板创作
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CompetitorNoteAnalysisModal;
