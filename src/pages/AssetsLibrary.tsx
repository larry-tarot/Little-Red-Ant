import React, { useState } from 'react';
import axios from '@/lib/axios';
import { 
    Library, Music, Image as ImageIcon, Video, Upload, 
    Trash2, Loader2, Play, Pause, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Modal from '../components/Modal';
import { useListData } from '../hooks/useListData';

interface Asset {
    id: string;
    type: 'audio' | 'image' | 'video';
    filename: string;
    url: string;
    size: number;
    created_at: string;
}

const AssetsLibrary: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'audio' | 'image' | 'video'>('audio');
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { data: assets, loading, refresh, removeItem } = useListData<Asset, Record<string, never>>({
        fetcher: async () => {
            const res = await axios.get(`/api/assets?type=${activeTab}`);
            return { data: res.data.data, total: res.data.data.length };
        },
        deps: [activeTab],
        errorMessage: 'Failed to load assets',
    });

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const toastId = toast.loading('上传中...');
        try {
            // Determine endpoint based on tab
            const endpoint = `/api/assets/upload/${activeTab}`;

            const res = await axios.post(endpoint, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                toast.success('上传成功', { id: toastId });
                refresh();
            }
        } catch (_error) {
            toast.error('上传失败', { id: toastId });
        }
    };

    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        const toastId = toast.loading('删除中...');
        try {
            const res = await axios.delete(`/api/assets/${deleteId}`);
            if (res.data.success) {
                toast.success('素材已删除', { id: toastId });
                removeItem(a => a.id === deleteId);
                setIsDeleteModalOpen(false);
                setDeleteId(null);
            }
        } catch (_error) {
            toast.error('删除失败', { id: toastId });
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="min-h-screen bg-surface-muted p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-text flex items-center">
                            <Library className="mr-2 text-primary" />
                            素材库
                        </h1>
                        <p className="text-sm text-text-tertiary mt-1">管理您的创作素材 (音乐, 图片, 视频)</p>
                    </div>
                    
                    <label className="bg-primary hover:bg-primary-hover text-primary-text px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm cursor-pointer">
                        <Upload size={16} className="mr-2" />
                        上传 {activeTab === 'audio' ? '音乐' : activeTab === 'image' ? '图片' : '视频'}
                        <input type="file" className="hidden" accept={`${activeTab}/*`} onChange={handleUpload} />
                    </label>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 bg-surface p-1 rounded-xl shadow-sm border border-border mb-6 w-fit">
                    <button 
                        onClick={() => setActiveTab('audio')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all
                            ${activeTab === 'audio' ? 'bg-primary-subtle text-primary shadow-sm' : 'text-text-tertiary hover:bg-surface-muted'}`}
                    >
                        <Music size={16} className="mr-2" /> 音乐
                    </button>
                    <button 
                        onClick={() => setActiveTab('image')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all
                            ${activeTab === 'image' ? 'bg-primary-subtle text-primary shadow-sm' : 'text-text-tertiary hover:bg-surface-muted'}`}
                    >
                        <ImageIcon size={16} className="mr-2" /> 图片
                    </button>
                    <button 
                        onClick={() => setActiveTab('video')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-all
                            ${activeTab === 'video' ? 'bg-primary-subtle text-primary shadow-sm' : 'text-text-tertiary hover:bg-surface-muted'}`}
                    >
                        <Video size={16} className="mr-2" /> 视频
                    </button>
                </div>

                {/* Content */}
                <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : assets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
                            <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
                                <Upload size={24} className="opacity-50" />
                            </div>
                            <p>暂无{activeTab === 'audio' ? '音乐' : activeTab === 'image' ? '图片' : '视频'}素材</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-surface-muted border-b border-border">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">预览</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">文件名</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">大小</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">上传日期</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {assets.map((asset) => (
                                    <tr key={asset.id} className="hover:bg-surface-muted transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {asset.type === 'audio' && (
                                                <button 
                                                    onClick={() => {
                                                        const audio = document.getElementById(`audio-${asset.id}`) as HTMLAudioElement;
                                                        if (playingId === asset.id) {
                                                            audio.pause();
                                                            setPlayingId(null);
                                                        } else {
                                                            // Stop others
                                                            document.querySelectorAll('audio').forEach(a => a.pause());
                                                            audio.play();
                                                            setPlayingId(asset.id);
                                                        }
                                                    }}
                                                    className="w-10 h-10 rounded-full bg-primary-subtle text-primary flex items-center justify-center hover:bg-primary-subtle transition-colors"
                                                >
                                                    {playingId === asset.id ? <Pause size={18} /> : <Play size={18} />}
                                                    <audio id={`audio-${asset.id}`} src={asset.url} onEnded={() => setPlayingId(null)} className="hidden" />
                                                </button>
                                            )}
                                            {asset.type === 'image' && (
                                                <img src={asset.url} alt={asset.filename} className="w-10 h-10 rounded object-cover border border-border" />
                                            )}
                                            {asset.type === 'video' && (
                                                <div className="w-16 h-10 bg-black rounded overflow-hidden">
                                                    <video src={asset.url} className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">
                                            {asset.filename}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary font-mono">
                                            {formatSize(asset.size)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-tertiary">
                                            {new Date(asset.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleDeleteClick(asset.id)}
                                                className="text-danger hover:text-danger transition-colors p-2 rounded-full hover:bg-danger-subtle"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Delete Modal */}
                <Modal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="确认删除素材"
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
                            <p className="text-text-secondary font-medium mb-1">您确定要删除这个素材吗？</p>
                            <p className="text-text-tertiary text-sm">
                                删除后将无法恢复。如果该素材已被用于视频工程，相关工程可能会损坏。
                            </p>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    );
};

export default AssetsLibrary;
