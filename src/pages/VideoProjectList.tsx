import React, { useState } from 'react';
import axios from '@/lib/axios';
import { Link } from 'react-router-dom';
import { 
    Film, Calendar, ArrowRight, PlayCircle, Trash2, Clock, Play, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import PageLoading from '../components/PageLoading';
import EmptyState from '../components/EmptyState';
import { useListData } from '../hooks/useListData';

interface VideoProject {
    id: string;
    title: string;
    status: 'DRAFT' | 'GENERATING' | 'COMPLETED';
    final_video_url?: string;
    created_at: string;
    updated_at: string;
    scenes?: any[]; // Simplified
    publish_status?: 'UNPUBLISHED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
}

const VideoProjectList: React.FC = () => {
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { data: projects, loading, removeItem } = useListData<VideoProject, Record<string, never>>({
        fetcher: async () => {
            const res = await axios.get('/api/video-projects');
            return { data: res.data.data, total: res.data.data.length };
        },
        errorMessage: '无法加载工程列表',
    });

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            await axios.delete(`/api/video-projects/${deleteId}`);
            toast.success('工程已删除');
            removeItem(p => p.id === deleteId);
            setIsDeleteModalOpen(false);
            setDeleteId(null);
        } catch (_error) {
            toast.error('删除失败');
        }
    };

    if (loading) {
        return <PageLoading message="正在加载工程列表..." />;
    }

    return (
        <div className="min-h-screen bg-surface-muted p-6">
            <div className="max-w-7xl mx-auto">
                <PageHeader 
                    title="视频工程" 
                    icon={Film}
                    description="管理您的视频创作项目与草稿"
                    action={
                        <Link 
                            to="/generate" 
                            state={{ activeTab: 'video_script' }}
                            className="bg-primary hover:bg-primary-hover text-primary-text px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm"
                        >
                            <PlayCircle size={16} className="mr-2" />
                            新建工程
                        </Link>
                    }
                />

                {projects.length === 0 ? (
                    <EmptyState 
                        title="暂无工程" 
                        description="从编写脚本开始，创建您的第一个视频工程。" 
                        icon={Film}
                        action={
                            <Link 
                                to="/generate"
                                className="text-primary hover:text-primary-hover font-medium inline-flex items-center mt-4"
                            >
                                创建您的第一个视频 <ArrowRight size={16} className="ml-1" />
                            </Link>
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
                            <Link 
                                key={project.id} 
                                to={`/video-studio/${project.id}`}
                                className="group bg-surface rounded-xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-all hover:border-primary-subtle block"
                            >
                                <div className="aspect-video bg-surface-muted relative overflow-hidden group-hover:bg-surface-hover transition-colors">
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <button 
                                            onClick={(e) => handleDelete(e, project.id)}
                                            className="p-1.5 bg-white/90 hover:bg-danger hover:text-primary-text rounded-full text-text-tertiary shadow-sm backdrop-blur-sm transition-colors"
                                            title="删除工程"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {project.final_video_url ? (
                                        <div className="w-full h-full relative">
                                            <video 
                                                src={project.final_video_url} 
                                                className="w-full h-full object-cover"
                                                muted
                                                onMouseOver={e => e.currentTarget.play().catch(() => { /* ignore */ })}
                                                onMouseOut={e => {
                                                    try {
                                                        e.currentTarget.pause();
                                                        e.currentTarget.currentTime = 0;
                                                    } catch (_e) { /* ignore */ }
                                                }}
                                            />
                                            <div className="absolute top-2 right-2 bg-black/50 text-primary-text text-xs px-2 py-1 rounded flex items-center">
                                                <Play size={10} className="mr-1" /> 成品
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary">
                                            <Film size={32} className="mb-2 opacity-50" />
                                            <span className="text-xs">
                                                {project.scenes?.length || 0} 个分镜
                                            </span>
                                        </div>
                                    )}
                                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase
                                            ${project.status === 'COMPLETED' ? 'bg-success-subtle text-success' : 
                                              project.status === 'GENERATING' ? 'bg-primary-subtle text-primary' : 
                                              'bg-surface-muted text-text-secondary'}
                                        `}>
                                            {project.status === 'COMPLETED' ? '已完成' :
                                             project.status === 'GENERATING' ? '生成中' :
                                             '草稿'}
                                        </span>
                                        {project.publish_status && project.publish_status !== 'UNPUBLISHED' && (
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase
                                                ${project.publish_status === 'PUBLISHED' ? 'bg-danger-subtle text-danger' : 
                                                  project.publish_status === 'PUBLISHING' ? 'bg-warning-subtle text-warning' : 
                                                  'bg-warning-subtle text-warning'}
                                            `}>
                                                {project.publish_status === 'PUBLISHED' ? '已发布' :
                                                 project.publish_status === 'PUBLISHING' ? '发布中' :
                                                 '发布失败'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-text mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                                        {project.title}
                                    </h3>
                                    <div className="flex justify-between items-center text-xs text-text-tertiary mt-3">
                                        <span className="flex items-center">
                                            <Calendar size={12} className="mr-1" />
                                            {new Date(project.updated_at).toLocaleDateString()}
                                        </span>
                                        <span className="flex items-center">
                                            <Clock size={12} className="mr-1" />
                                            {new Date(project.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="确认删除工程"
                footer={
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="px-4 py-2 text-text-secondary bg-surface-muted hover:bg-surface-hover rounded-md text-sm font-medium"
                        >
                            取消
                        </button>
                        <button
                            onClick={confirmDelete}
                            className="px-4 py-2 text-primary-text bg-danger hover:bg-danger rounded-md text-sm font-medium"
                        >
                            确认删除
                        </button>
                    </div>
                }
            >
                <div className="flex items-start p-2">
                    <AlertCircle className="text-danger mr-3 flex-shrink-0" size={24} />
                    <div>
                        <p className="text-text-secondary font-medium mb-1">您确定要删除这个视频工程吗？</p>
                        <p className="text-text-tertiary text-sm">
                            删除后，该工程及其所有分镜数据将无法恢复。
                        </p>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default VideoProjectList;
