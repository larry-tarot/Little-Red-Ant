import React, { useState, useEffect, useRef } from 'react';
import axios from '@/lib/axios';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, Key, Image, Cpu, Clock, MessageSquare, Users, Lock, Edit2, Shield, Heart, Download, RefreshCw, Monitor, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { isTauri } from '@/lib/tauri';
import toast from 'react-hot-toast';
import PageHeader from '@/components/PageHeader';
import PageLoading from '@/components/PageLoading';
import Modal from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function SettingsPage() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'profile' | 'desktop'>('profile');
  const [testing, setTesting] = useState<string | null>(null);
  
  // Profile State
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [profileForm, setProfileForm] = useState({ username: '', alias: '' });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isPasswordConfirmOpen, setIsPasswordConfirmOpen] = useState(false);
  const [isPasswordSuccessOpen, setIsPasswordSuccessOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessCountdown, setPasswordSuccessCountdown] = useState(3);
  const passwordSuccessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSettings();
    if (user) {
        setProfileForm({ 
            username: user.username, 
            alias: user.alias || '' 
        });
    }
  }, [user]);

  // 组件卸载时清理密码修改成功倒计时定时器，防止内存泄漏和重复跳转
  useEffect(() => {
    return () => {
      if (passwordSuccessTimerRef.current) {
        clearInterval(passwordSuccessTimerRef.current);
      }
    };
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data || {});
    } catch {
      toast.error('无法加载配置信息');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 功能描述：评估密码强度
   *
   * 返回说明：
   * - 0: 太短（<8 位）
   * - 1: 弱（仅包含单一字符类型）
   * - 2: 中（包含两种字符类型）
   * - 3: 强（包含三种及以上字符类型）
   */
  const getPasswordStrength = (password: string): { score: number; label: string; color: string } => {
      if (password.length < 8) return { score: 0, label: '太短', color: 'bg-danger' };
      let types = 0;
      if (/[a-z]/.test(password)) types++;
      if (/[A-Z]/.test(password)) types++;
      if (/[0-9]/.test(password)) types++;
      if (/[^a-zA-Z0-9]/.test(password)) types++;
      if (types >= 3) return { score: 3, label: '强', color: 'bg-success' };
      if (types === 2) return { score: 2, label: '中', color: 'bg-warning' };
      return { score: 1, label: '弱', color: 'bg-danger' };
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          await axios.put('/api/users/me', { 
              username: profileForm.username,
              alias: profileForm.alias
          });
          toast.success('个人资料更新成功');
          setIsEditingProfile(false);
      } catch (e: any) {
          toast.error(e.response?.data?.error || '更新失败');
      }
  };

  /**
   * 功能描述：校验密码修改表单并打开确认弹窗
   */
  const handlePasswordChange = (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          toast.error('两次输入的新密码不一致');
          return;
      }
      if (passwordForm.newPassword.length < 8) {
          toast.error('新密码长度至少 8 位');
          return;
      }
      if (passwordForm.newPassword === passwordForm.currentPassword) {
          toast.error('新密码不能与当前密码相同');
          return;
      }
      setIsPasswordConfirmOpen(true);
  };

  /**
   * 功能描述：确认并提交密码修改
   *
   * 设计思路：
   * 修改密码是敏感操作，确认后执行。成功后通过弹窗明确告知用户
   * 需要重新登录，并倒计时自动跳转到登录页，避免 toast 一闪而过。
   */
  const confirmPasswordChange = async () => {
      setIsPasswordConfirmOpen(false);
      setIsChangingPassword(true);
      try {
          await axios.put('/api/users/me/password', {
              oldPassword: passwordForm.currentPassword,
              newPassword: passwordForm.newPassword
          });
          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
          setIsPasswordSuccessOpen(true);
          setPasswordSuccessCountdown(3);

          // 清理可能存在的旧定时器
          if (passwordSuccessTimerRef.current) {
              clearInterval(passwordSuccessTimerRef.current);
          }

          // 倒计时结束后清除登录态并跳转
          passwordSuccessTimerRef.current = setInterval(() => {
              setPasswordSuccessCountdown(prev => {
                  if (prev <= 1) {
                      if (passwordSuccessTimerRef.current) {
                          clearInterval(passwordSuccessTimerRef.current);
                          passwordSuccessTimerRef.current = null;
                      }
                      logout();
                      navigate('/login');
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } catch (e: any) {
          toast.error(e.response?.data?.error || '修改失败');
      } finally {
          setIsChangingPassword(false);
      }
  };

  /**
   * 功能描述：清理密码修改成功倒计时定时器
   */
  const clearPasswordSuccessTimer = () => {
      if (passwordSuccessTimerRef.current) {
          clearInterval(passwordSuccessTimerRef.current);
          passwordSuccessTimerRef.current = null;
      }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const testConnection = async (key: string, payload?: { apiKey?: string; baseUrl?: string; model?: string }) => {
      setTesting(key);
      try {
        const res = await axios.post('/api/settings/test-connection', {
            key,
            apiKey: payload?.apiKey ?? settings[key],
            baseUrl: payload?.baseUrl ?? (key === 'custom_api_key' ? settings.custom_base_url : undefined),
            model: payload?.model ?? (key === 'custom_api_key' ? settings.custom_model : undefined),
        });
        if (res.data.success) {
          toast.success(`✅ ${res.data.message || `${key} 连接成功`}`);
        } else {
          toast.error(`❌ ${res.data.message || '连接失败'}`);
        }
      } catch (e: any) {
        toast.error(`❌ ${e.response?.data?.message || e.message || '无法连接到服务器'}`);
      } finally {
        setTesting(null);
      }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/api/settings', settings);
      toast.success('配置已保存成功');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoading message="正在加载系统配置..." />;
  }

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <PageHeader 
          title="系统设置" 
          icon={Settings}
        />

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-border">
            <button
                onClick={() => setActiveTab('profile')}
                className={`pb-2 px-4 font-medium text-sm transition-colors ${activeTab === 'profile' ? 'text-primary border-b-2 border-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
                个人资料
            </button>
            <button
                onClick={() => setActiveTab('system')}
                className={`pb-2 px-4 font-medium text-sm transition-colors ${activeTab === 'system' ? 'text-primary border-b-2 border-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
                系统配置
            </button>
            {isTauri && (
                <button
                    onClick={() => setActiveTab('desktop')}
                    className={`pb-2 px-4 font-medium text-sm transition-colors ${activeTab === 'desktop' ? 'text-primary border-b-2 border-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                    桌面版
                </button>
            )}
        </div>

        <div className="space-y-6">
          
          {/* Profile Tab */}
          {activeTab === 'profile' && (
              <>
                <div className="bg-surface shadow-sm rounded-lg border border-border p-6">
                    <h2 className="text-lg font-medium text-text mb-6 flex items-center">
                        <Users className="mr-2 text-text-tertiary" size={20}/> 基本信息
                    </h2>
                    
                    <div className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">用户名</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={profileForm.username}
                                    disabled={!isEditingProfile}
                                    onChange={e => setProfileForm({...profileForm, username: e.target.value})}
                                    className={`w-full p-2 border border-border-strong rounded-md focus:ring-primary focus:border-primary ${!isEditingProfile ? 'bg-surface-muted text-text-tertiary' : ''}`}
                                />
                                {!isEditingProfile ? (
                                    <button 
                                        onClick={() => setIsEditingProfile(true)}
                                        className="px-3 py-2 bg-surface-muted text-text-secondary rounded-md hover:bg-surface-hover text-sm"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleUpdateProfile}
                                            className="px-3 py-2 bg-primary text-primary-text rounded-md hover:bg-primary-hover text-sm"
                                        >
                                            保存
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setIsEditingProfile(false);
                                                setProfileForm({ username: user?.username || '', alias: user?.alias || '' });
                                            }}
                                            className="px-3 py-2 bg-surface-muted text-text-secondary rounded-md hover:bg-surface-hover text-sm"
                                        >
                                            取消
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">当前密码</label>
                            <input 
                                type="text" 
                                value="***********"
                                disabled
                                className="w-full p-2 border border-border-strong rounded-md bg-surface-muted text-text-tertiary"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-surface shadow-sm rounded-lg border border-border p-6">
                    <h2 className="text-lg font-medium text-text mb-6 flex items-center">
                        <Lock className="mr-2 text-text-tertiary" size={20}/> 修改密码
                    </h2>
                    <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">当前密码</label>
                            <div className="relative">
                                <Input
                                    type={showPassword.current ? 'text' : 'password'}
                                    value={passwordForm.currentPassword}
                                    onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => ({ ...prev, current: !prev.current }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                                    aria-label={showPassword.current ? '隐藏密码' : '显示密码'}
                                >
                                    {showPassword.current ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">新密码</label>
                            <div className="relative">
                                <Input
                                    type={showPassword.new ? 'text' : 'password'}
                                    value={passwordForm.newPassword}
                                    onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => ({ ...prev, new: !prev.new }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                                    aria-label={showPassword.new ? '隐藏密码' : '显示密码'}
                                >
                                    {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {passwordForm.newPassword && (
                                <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-text-tertiary">密码强度</span>
                                        <span className="text-text-secondary">{getPasswordStrength(passwordForm.newPassword).label}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${getPasswordStrength(passwordForm.newPassword).color}`}
                                            style={{ width: `${(getPasswordStrength(passwordForm.newPassword).score / 3) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-text-tertiary mt-1">
                                        建议 8 位以上，包含大小写字母、数字和特殊符号中的至少 3 种
                                    </p>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">确认新密码</label>
                            <div className="relative">
                                <Input
                                    type={showPassword.confirm ? 'text' : 'password'}
                                    value={passwordForm.confirmPassword}
                                    onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => ({ ...prev, confirm: !prev.confirm }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                                    aria-label={showPassword.confirm ? '隐藏密码' : '显示密码'}
                                >
                                    {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <Button
                            type="submit"
                            loading={isChangingPassword}
                        >
                            更新密码
                        </Button>
                    </form>
                </div>
              </>
          )}

          {/* System Settings Tab */}
          {activeTab === 'system' && (
            <>
          {/* Engagement Settings */}
          <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
              <MessageSquare className="text-primary mr-2" size={20} />
              <h2 className="text-lg font-medium text-text">互动与同步</h2>
            </div>
            <div className="p-6 space-y-4">
              
              {/* Sync Schedule */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  数据同步频率 (Cron 表达式)
                </label>
                <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                    <input
                      type="text"
                      value={settings.SYNC_SCHEDULE || '0 9,15,21,3 * * *'}
                      onChange={(e) => handleChange('SYNC_SCHEDULE', e.target.value)}
                      placeholder="0 9,15,21,3 * * *"
                      className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                   Cron 表达式。默认: <code>0 9,15,21,3 * * *</code> (每天 3点, 9点, 15点, 21点 同步)
                </p>
              </div>

              {/* Auto Reply Analysis Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border mb-4 pb-4">
                 <div>
                    <label className="text-sm font-medium text-text-secondary">启用 AI 自动意图分析</label>
                    <p className="text-xs text-text-tertiary">同步评论时，自动调用 AI 分析用户意图并生成回复建议</p>
                 </div>
                 <div className="flex items-center">
                    <button 
                        onClick={() => handleChange('AUTO_REPLY_ENABLED', settings.AUTO_REPLY_ENABLED === 'true' ? 'false' : 'true')}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.AUTO_REPLY_ENABLED === 'true' ? 'bg-primary' : 'bg-surface-hover'}`}
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out ${settings.AUTO_REPLY_ENABLED === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                 </div>
              </div>

              {/* AI Analysis Limit */}
              {settings.AUTO_REPLY_ENABLED === 'true' && (
                  <div className="animate-in fade-in slide-in-from-top-2 mb-6">
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      单次同步 AI 分析条数限制
                    </label>
                    <div className="relative">
                        <MessageSquare className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={settings.AI_ANALYSIS_LIMIT || '20'}
                          onChange={(e) => handleChange('AI_ANALYSIS_LIMIT', e.target.value)}
                          placeholder="20"
                          className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                        />
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                       限制每次同步后调用 AI 分析的评论数量，防止 Token 消耗过大。默认: 20 条
                    </p>
                  </div>
              )}

              {/* Auto Viral Analysis Settings */}
              <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-center justify-between py-2 border-b border-border mb-4 pb-4">
                     <div>
                        <label className="text-sm font-medium text-text-secondary">启用超级爆款自动拆解</label>
                        <p className="text-xs text-text-tertiary">爬取热点时，自动对高赞笔记进行 AI 深度分析</p>
                     </div>
                     <div className="flex items-center">
                        <button 
                            onClick={() => handleChange('AUTO_ANALYZE_ENABLED', settings.AUTO_ANALYZE_ENABLED === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.AUTO_ANALYZE_ENABLED === 'true' ? 'bg-primary' : 'bg-surface-hover'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out ${settings.AUTO_ANALYZE_ENABLED === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                     </div>
                  </div>

                  {settings.AUTO_ANALYZE_ENABLED === 'true' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                          <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                              爆款阈值 (点赞数)
                            </label>
                            <div className="relative">
                                <Heart className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                                <input
                                  type="number"
                                  min="1000"
                                  step="1000"
                                  value={settings.AUTO_ANALYZE_THRESHOLD || '100000'}
                                  onChange={(e) => handleChange('AUTO_ANALYZE_THRESHOLD', e.target.value)}
                                  placeholder="100000"
                                  className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                                />
                            </div>
                            <p className="mt-1 text-xs text-text-tertiary">
                               只有点赞数超过此数值的笔记才会自动分析。默认: 100000
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                              单次批次分析上限
                            </label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                                <input
                                  type="number"
                                  min="1"
                                  max="20"
                                  value={settings.AUTO_ANALYZE_LIMIT_PER_BATCH || '3'}
                                  onChange={(e) => handleChange('AUTO_ANALYZE_LIMIT_PER_BATCH', e.target.value)}
                                  placeholder="3"
                                  className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                                />
                            </div>
                            <p className="mt-1 text-xs text-text-tertiary">
                               每次抓取任务最多自动分析几篇，防止 Token 爆炸。默认: 3篇
                            </p>
                          </div>
                      </div>
                  )}
              </div>

            </div>
          </div>

          {/* Aliyun Configuration (Image & Video & Text) */}
          <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
              <Image className="text-primary mr-2" size={20} />
              <h2 className="text-lg font-medium text-text">阿里云通义千问</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  API Key (DASHSCOPE_API_KEY)
                </label>
                <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                    <input
                      type="password"
                      value={settings.aliyun_api_key || ''}
                      onChange={(e) => handleChange('aliyun_api_key', e.target.value)}
                      placeholder="sk-..."
                      className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <button
                      onClick={() => testConnection('aliyun_api_key')}
                      disabled={testing === 'aliyun_api_key'}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary hover:text-primary-hover disabled:text-text-tertiary px-2 py-1 rounded"
                    >
                      {testing === 'aliyun_api_key' ? '测试中...' : '测试连接'}
                    </button>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">如果不填，默认读取环境变量 .env 中的配置</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Text Model */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      文本生成模型
                    </label>
                    <input
                      type="text"
                      value={settings.aliyun_text_model || ''}
                      onChange={(e) => handleChange('aliyun_text_model', e.target.value)}
                      placeholder="qwen-plus"
                      className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {['qwen-turbo', 'qwen-plus', 'qwen-max'].map(m => (
                            <button
                                key={m}
                                onClick={() => handleChange('aliyun_text_model', m)}
                                className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                  </div>

                  {/* VL Model (Visual Analysis) */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      视觉理解模型
                    </label>
                    <input
                      type="text"
                      value={settings.aliyun_vl_model || ''}
                      onChange={(e) => handleChange('aliyun_vl_model', e.target.value)}
                      placeholder="qwen-vl-max"
                      className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {['qwen-vl-plus', 'qwen-vl-max', 'qwen-vl-max-2025-08-13'].map(m => (
                            <button
                                key={m}
                                onClick={() => handleChange('aliyun_vl_model', m)}
                                className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                  </div>

                  {/* Image Generation */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      图片生成模型
                    </label>
                    <input
                      type="text"
                      value={settings.aliyun_image_model || ''}
                      onChange={(e) => handleChange('aliyun_image_model', e.target.value)}
                      placeholder="wanx-v1"
                      className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {['wanx-v1', 'wanx-v2'].map(m => (
                            <button
                                key={m}
                                onClick={() => handleChange('aliyun_image_model', m)}
                                className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                  </div>

                  {/* Video Generation */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      视频生成模型
                    </label>
                    <input
                      type="text"
                      value={settings.aliyun_video_model || ''}
                      onChange={(e) => handleChange('aliyun_video_model', e.target.value)}
                      placeholder="wan2.1-t2v-plus"
                      className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {['wan2.1-t2v-plus', 'wan2.1-t2v-turbo', 'wan2.0-t2v-turbo', 'wanx-v1'].map(m => (
                            <button
                                key={m}
                                onClick={() => handleChange('aliyun_video_model', m)}
                                className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                  </div>

                  {/* Audio Transcription */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      语音转写模型 (ASR Model)
                    </label>
                    <input
                      type="text"
                      value={settings.aliyun_audio_model || ''}
                      onChange={(e) => handleChange('aliyun_audio_model', e.target.value)}
                      placeholder="paraformer-8k-v1"
                      className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <div className="mt-2 flex gap-2 flex-wrap">
                        {['paraformer-8k-v1', 'paraformer-v1', 'sensevoice-v1'].map(m => (
                            <button
                                key={m}
                                onClick={() => handleChange('aliyun_audio_model', m)}
                                className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                  </div>
              </div>
            </div>
          </div>

          {/* Custom OpenAI-Compatible Provider Configuration */}
          <div className="bg-surface shadow-sm rounded-lg border border-primary/40 overflow-hidden ring-1 ring-primary/20">
            <div className="px-6 py-4 border-b border-border bg-primary/5 flex items-center justify-between">
              <div className="flex items-center">
                <Cpu className="text-primary mr-2" size={20} />
                <div>
                  <h2 className="text-lg font-medium text-text flex items-center gap-2">
                    自定义 API 运营商接入 (OpenAI 兼容协议)
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">最高优先级主力</span>
                  </h2>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    支持硅基流动 (SiliconFlow)、MiniMax、Groq、Ollama、OneAPI/NewAPI 或任意兼容 OpenAI 格式的服务商。
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  API Key (CUSTOM_API_KEY)
                </label>
                <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                    <input
                      type="password"
                      value={settings.custom_api_key || ''}
                      onChange={(e) => handleChange('custom_api_key', e.target.value)}
                      placeholder="sk-..."
                      className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <button
                      onClick={() => testConnection('custom_api_key')}
                      disabled={testing === 'custom_api_key'}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary hover:text-primary-hover disabled:text-text-tertiary px-2 py-1 rounded"
                    >
                      {testing === 'custom_api_key' ? '测试中...' : '测试连接'}
                    </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  接口地址 Base URL (CUSTOM_BASE_URL)
                </label>
                <input
                  type="text"
                  value={settings.custom_base_url || ''}
                  onChange={(e) => handleChange('custom_base_url', e.target.value)}
                  placeholder="https://api.siliconflow.cn/v1"
                  className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                />
                <div className="mt-2 flex gap-2 flex-wrap">
                    {[
                        { label: '硅基流动', url: 'https://api.siliconflow.cn/v1' },
                        { label: 'MiniMax', url: 'https://api.minimax.chat/v1' },
                        { label: 'Groq', url: 'https://api.groq.com/openai/v1' },
                        { label: 'Ollama本地', url: 'http://localhost:11434/v1' },
                        { label: 'OpenAI官方', url: 'https://api.openai.com/v1' }
                    ].map(p => (
                        <button
                            key={p.label}
                            onClick={() => handleChange('custom_base_url', p.url)}
                            className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded transition-colors"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  模型名称 (CUSTOM_MODEL)
                </label>
                <input
                  type="text"
                  value={settings.custom_model || ''}
                  onChange={(e) => handleChange('custom_model', e.target.value)}
                  placeholder="deepseek-ai/DeepSeek-V3"
                  className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                />
                <div className="mt-2 flex gap-2 flex-wrap">
                    {[
                        'deepseek-ai/DeepSeek-V3',
                        'deepseek-ai/DeepSeek-R1',
                        'Qwen/Qwen2.5-72B-Instruct',
                        'gpt-4o',
                        'claude-3-5-sonnet'
                    ].map(m => (
                        <button
                            key={m}
                            onClick={() => handleChange('custom_model', m)}
                            className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded transition-colors"
                        >
                            {m}
                        </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* DeepSeek Configuration */}
          <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
              <Cpu className="text-primary mr-2" size={20} />
              <h2 className="text-lg font-medium text-text">DeepSeek (文案生成)</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  API Key (DEEPSEEK_API_KEY)
                </label>
                <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
                    <input
                      type="password"
                      value={settings.deepseek_api_key || ''}
                      onChange={(e) => handleChange('deepseek_api_key', e.target.value)}
                      placeholder="sk-..."
                      className="pl-10 block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                    />
                    <button
                      onClick={() => testConnection('deepseek_api_key')}
                      disabled={testing === 'deepseek_api_key'}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary hover:text-primary-hover disabled:text-text-tertiary px-2 py-1 rounded"
                    >
                      {testing === 'deepseek_api_key' ? '测试中...' : '测试连接'}
                    </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Base URL
                </label>
                <input
                  type="text"
                  value={settings.deepseek_base_url || ''}
                  onChange={(e) => handleChange('deepseek_base_url', e.target.value)}
                  placeholder="https://api.deepseek.com"
                  className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  模型名称 (Model Name)
                </label>
                <input
                  type="text"
                  value={settings.deepseek_model || ''}
                  onChange={(e) => handleChange('deepseek_model', e.target.value)}
                  placeholder="deepseek-chat"
                  className="block w-full rounded-md border-border-strong shadow-sm focus:border-primary focus:ring-primary sm:text-sm h-10 border px-3"
                />
                 <div className="mt-2 flex gap-2">
                    {['deepseek-chat', 'deepseek-reasoner'].map(m => (
                        <button
                            key={m}
                            onClick={() => handleChange('deepseek_model', m)}
                            className="text-xs bg-surface-muted hover:bg-surface-hover text-text-secondary px-2 py-1 rounded"
                        >
                            {m}
                        </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-primary-text transition-colors
                    ${saving ? 'bg-primary/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}
                  `}
                >
                  <Save className="mr-2" size={20} />
                  {saving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </>
          )}

          {/* Desktop Tab (仅桌面版) */}
          {activeTab === 'desktop' && isTauri && (
            <>
              {/* 版本信息 */}
              <DesktopAppInfoSection />

              {/* 数据库备份 */}
              <DesktopBackupSection />

              {/* 自动启动与快捷键 */}
              <DesktopSystemSection />
            </>
          )}
        </div>

        {/* 修改密码确认弹窗 */}
        <Modal
          isOpen={isPasswordConfirmOpen}
          onClose={() => setIsPasswordConfirmOpen(false)}
          title="确认修改密码"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setIsPasswordConfirmOpen(false)}>
                取消
              </Button>
              <Button variant="primary" size="sm" loading={isChangingPassword} onClick={confirmPasswordChange}>
                确认修改
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="text-warning flex-shrink-0" size={24} />
            <div>
              <p className="text-text font-medium mb-1">确定要修改密码吗？</p>
              <p className="text-text-secondary text-sm">
                修改成功后，当前登录态将失效，您需要使用新密码重新登录。
              </p>
            </div>
          </div>
        </Modal>

        {/* 修改密码成功弹窗 */}
        <Modal
          isOpen={isPasswordSuccessOpen}
          onClose={() => {
            clearPasswordSuccessTimer();
            setIsPasswordSuccessOpen(false);
            logout();
            navigate('/login');
          }}
          title="密码修改成功"
          size="sm"
          footer={
            <Button
              onClick={() => {
                clearPasswordSuccessTimer();
                setIsPasswordSuccessOpen(false);
                logout();
                navigate('/login');
              }}
            >
              立即重新登录 ({passwordSuccessCountdown}s)
            </Button>
          }
        >
          <div className="flex items-start gap-3">
            <Shield className="text-success flex-shrink-0" size={24} />
            <div>
              <p className="text-text font-medium mb-1">您的密码已更新</p>
              <p className="text-text-secondary text-sm">
                为了账号安全，系统已使当前会话失效。请在 {passwordSuccessCountdown} 秒后使用新密码重新登录，或点击按钮立即跳转。
              </p>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

// ==================== Desktop Tab 子组件 ====================

/** 版本与更新信息 */
function DesktopAppInfoSection() {
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string; arch: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<{ version: string; platform: string; arch: string }>('get_app_info');
        setAppInfo(info);
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
        <Download className="text-primary mr-2" size={20} />
        <h2 className="text-lg font-medium text-text">版本与更新</h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-secondary">当前版本</p>
            <p className="text-sm text-text-tertiary">
              v{appInfo?.version || '1.0.0'}
              {appInfo && <span className="text-xs text-text-tertiary ml-2">({appInfo.platform} {appInfo.arch})</span>}
            </p>
          </div>
          <button
            onClick={() => toast.success('检查更新功能需要配置更新服务器')}
            className="px-4 py-2 bg-primary text-primary-text rounded-md text-sm hover:bg-primary-hover transition-colors"
          >
            检查更新
          </button>
        </div>
      </div>
    </div>
  );
}

/** 数据库备份 */
function DesktopBackupSection() {
  const [backups, setBackups] = useState<any[]>([]);
  const [showBackups, setShowBackups] = useState(false);

  const loadBackups = async () => {
    if (!showBackups) {
      setShowBackups(true);
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list = await invoke<any[]>('list_backups');
      setBackups(list);
    } catch { /* ignore */ }
  };

  const handleBackup = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string>('backup_database');
      toast.success(`数据库已备份: ${path.split('\\').pop()}`);
      loadBackups();
    } catch (e: any) {
      toast.error(`备份失败: ${e}`);
    }
  };

  return (
    <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
        <RefreshCw className="text-success mr-2" size={20} />
        <h2 className="text-lg font-medium text-text">数据备份</h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-text-tertiary">
          数据库会自动每日备份到 %APPDATA%/小红蚁/backups/ 目录,保留最近 7 天。
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleBackup}
            className="px-4 py-2 bg-success text-primary-text rounded-md text-sm hover:bg-success transition-colors"
          >
            立即备份数据库
          </button>
          <button
            onClick={loadBackups}
            className="px-4 py-2 bg-surface-muted text-text-secondary rounded-md text-sm hover:bg-surface-hover transition-colors"
          >
            {showBackups ? '刷新备份列表' : '查看备份'}
          </button>
        </div>
        {showBackups && backups.length > 0 && (
          <div className="mt-2 border border-border rounded-md divide-y divide-border max-h-40 overflow-y-auto">
            {backups.map((b, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-text-secondary truncate max-w-[200px]">{b.name}</span>
                <span className="text-text-tertiary">
                  {(b.size / 1024).toFixed(0)} KB · {b.modified}
                </span>
              </div>
            ))}
          </div>
        )}
        {showBackups && backups.length === 0 && (
          <p className="text-xs text-text-tertiary">暂无备份文件</p>
        )}
      </div>
    </div>
  );
}

/** 启动与快捷键 */
function DesktopSystemSection() {
  return (
    <>
      <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
          <Monitor className="text-primary mr-2" size={20} />
          <h2 className="text-lg font-medium text-text">启动与快捷键</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-text-secondary">开机自启</p>
              <p className="text-xs text-text-tertiary">登录 Windows 后自动启动小红蚁</p>
            </div>
            <button
              id="autostart-toggle"
              onClick={async () => {
                try {
                  const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart');
                  const enabled = await isEnabled();
                  if (enabled) {
                    await disable();
                    toast.success('已关闭开机自启');
                  } else {
                    await enable();
                    toast.success('已开启开机自启');
                  }
                } catch (e: any) {
                  toast.error(`操作失败: ${e}`);
                }
              }}
              className="px-3 py-1.5 bg-primary text-primary-text rounded-md text-xs hover:bg-primary-hover transition-colors"
            >
              切换
            </button>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium text-text-secondary">全局快捷键</p>
              <p className="text-xs text-text-tertiary">Ctrl+Shift+X 显示/隐藏窗口</p>
            </div>
            <span className="px-2 py-1 bg-surface-muted text-text-secondary rounded text-xs font-mono">Ctrl+Shift+X</span>
          </div>
        </div>
      </div>

      {/* 应用信息 */}
      <div className="bg-surface shadow-sm rounded-lg border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-surface-muted flex items-center">
          <Monitor className="text-text-secondary mr-2" size={20} />
          <h2 className="text-lg font-medium text-text">应用信息</h2>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-text-tertiary">应用名称</span>
            <span className="text-text-secondary">小红蚁</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-text-tertiary">运行环境</span>
            <span className="text-text-secondary">Tauri 2 + Node.js</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-text-tertiary">数据目录</span>
            <span className="text-text-tertiary text-xs truncate max-w-[200px]">%APPDATA%/小红蚁/</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-text-tertiary">后端端口</span>
            <span className="text-text-secondary">14753</span>
          </div>
        </div>
      </div>
    </>
  );
}
