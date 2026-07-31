import { ArrowLeft, Download, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { VideoProject } from './types';

interface VideoProjectHeaderProps {
    project: VideoProject;
    progress: number;
    navigate: (path: string) => void;
    handleExport: () => void;
    setShowPublishModal: (show: boolean) => void;
    setPublishData: React.Dispatch<React.SetStateAction<any>>;
}

const VideoProjectHeader: React.FC<VideoProjectHeaderProps> = ({
    project,
    progress,
    navigate,
    handleExport,
    setShowPublishModal,
    setPublishData
}) => {
    const completedCount = project.scenes.filter(s => s.status === 'COMPLETED').length;

    return (
        <header className="bg-surface border-b border-border px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
            <div className="flex items-center">
                <button onClick={() => navigate('/video-projects')} className="mr-4 text-text-tertiary hover:text-text-secondary" title="返回项目列表">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-text flex items-center">
                        {project.title}
                        <span className="ml-3 text-xs font-normal px-2 py-0.5 bg-primary-subtle text-primary rounded-full border border-primary-subtle">
                            视频工作台 V4.2
                        </span>
                    </h1>
                    <p className="text-xs text-text-tertiary mt-1">上次保存: {new Date(project.updated_at).toLocaleString()}</p>
                </div>
            </div>
            <div className="flex items-center space-x-4">
                <div className="flex flex-col items-end mr-4">
                    <span className="text-xs text-text-tertiary mb-1">项目进度</span>
                    <div className="w-32 h-2 bg-surface-muted rounded-full overflow-hidden">
                        <div className="h-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
                <button 
                    onClick={handleExport}
                    disabled={completedCount < 2 || project.status === 'GENERATING'}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors
                        ${completedCount < 2 || project.status === 'GENERATING'
                            ? 'bg-surface-muted text-text-tertiary cursor-not-allowed' 
                            : 'bg-primary hover:bg-primary-hover text-primary-text shadow-sm'
                        }`}
                >
                    {project.status === 'GENERATING' ? (
                        <>
                            <Loader2 size={18} className="mr-2 animate-spin" />
                            合成中...
                        </>
                    ) : (
                        <>
                            <Download size={18} className="mr-2" />
                            合成最终视频
                        </>
                    )}
                </button>
                
                <button 
                    onClick={() => {
                        if (!project.final_video_url || project.publish_status === 'PUBLISHING') return;
                        setPublishData((prev: any) => ({ ...prev, title: project.title }));
                        setShowPublishModal(true);
                    }}
                    disabled={!project.final_video_url || project.publish_status === 'PUBLISHING'}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ml-2
                        ${!project.final_video_url || project.publish_status === 'PUBLISHING'
                            ? 'bg-surface-muted text-text-tertiary cursor-not-allowed' 
                            : project.publish_status === 'PUBLISHED'
                                ? 'bg-success hover:bg-success text-primary-text shadow-sm'
                                : 'bg-danger hover:bg-danger text-primary-text shadow-sm'
                        }`}
                >
                    {project.publish_status === 'PUBLISHING' ? (
                        <>
                            <Loader2 size={18} className="mr-2 animate-spin" />
                            发布中...
                        </>
                    ) : project.publish_status === 'PUBLISHED' ? (
                        <>
                            <CheckCircle size={18} className="mr-2" />
                            已发布
                        </>
                    ) : project.publish_status === 'FAILED' ? (
                        <>
                            <AlertCircle size={18} className="mr-2" />
                            发布失败 (重试)
                        </>
                    ) : (
                        <>
                            <ExternalLink size={18} className="mr-2" />
                            发布到小红书
                        </>
                    )}
                </button>
            </div>
        </header>
    );
};

export default VideoProjectHeader;
