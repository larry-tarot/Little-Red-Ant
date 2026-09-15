import { z } from 'zod';

/**
 * 前后端共享的 Zod Schema 集合
 *
 * 设计目标：
 * - 统一接口请求/响应契约，避免前后端类型不同步
 * - 后端通过 express 中间件做运行时校验
 * - 前端可复用 schema 做表单校验或类型推导
 */

// --- 通用基元 ---

const AccountIdSchema = z.union([z.string(), z.number()]).optional();

// --- 分页/参数基类 ---

export const IdParamSchema = z.object({
    id: z.string().min(1, 'ID is required'),
});

export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const DateRangeQuerySchema = z.object({
    start_date: z.string().datetime({ offset: true }).optional(),
    end_date: z.string().datetime({ offset: true }).optional(),
});

// --- Generate Routes ---

export const GenerateContentSchema = z.object({
    topic: z.string().min(1, 'Topic is required').max(200, 'Topic too long'),
    keywords: z.array(z.string()).optional(),
    style: z.string().optional(),
    remix_structure: z.any().optional(),
    contentType: z.enum(['note', 'article', 'video_script']).optional().default('note'),
    accountId: AccountIdSchema,
    persona_desc: z.string().optional(),
    custom_instructions: z.string().optional(),
});

export const GenerateImageSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    ref_img: z.string().url('Reference image must be a valid URL').optional(),
    accountId: AccountIdSchema,
});

export const GenerateVideoSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    imageUrl: z.string().url('Image URL must be valid').optional(),
    duration: z.number().min(1).max(60).optional(),
    sceneId: z.string().optional(),
    model: z.string().optional(),
    accountId: AccountIdSchema,
});

export const OptimizePromptSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    type: z.enum(['video', 'article', 'note', 'text']).optional(),
});

// --- Publish Routes ---

export const PublishSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
    content: z.string().min(1, 'Content is required'),
    tags: z.array(z.string()).optional(),
    imageData: z.array(z.string()).optional(),
    videoPath: z.string().optional(),
    autoPublish: z.boolean().optional(),
    // A queue request must carry an explicit user confirmation; draft generation
    // and scheduling alone never authorize a real account write.
    confirmedByUser: z.literal(true, {
        error: 'Explicit user confirmation is required before publishing',
    }),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    accountId: AccountIdSchema,
    projectId: z.string().optional(),
    draftId: z.union([z.string(), z.number()]).optional(),
    contentType: z.enum(['note', 'video', 'article']).optional(),
}).refine(
    (data) => {
        const hasImages = data.imageData && data.imageData.length > 0;
        const hasVideo = !!data.videoPath;
        const isArticle = data.contentType === 'article';
        return hasImages || hasVideo || isArticle;
    },
    {
        message: 'Must provide either imageData or videoPath',
        path: ['imageData', 'videoPath'],
    }
);

export const LoginSchema = z.object({
    accountId: AccountIdSchema,
});

export const AccountLoginSchema = z.object({
    accountId: z.union([z.string(), z.number()]).optional(),
});

// --- Auth Routes ---

export const AuthCredentialsSchema = z.object({
    username: z.string().min(1, '用户名不能为空').max(32, '用户名过长'),
    password: z.string().min(6, '密码至少 6 位').max(128, '密码过长'),
});

export const ChangePasswordSchema = z.object({
    oldPassword: z.string().min(1, '原密码不能为空').max(128),
    newPassword: z
        .string()
        .min(8, '新密码至少 8 位')
        .max(128, '新密码过长')
        .regex(/[A-Za-z]/, '新密码必须包含字母')
        .regex(/\d/, '新密码必须包含数字'),
}).refine(
    (data) => data.oldPassword !== data.newPassword,
    {
        message: '新密码不能与原密码相同',
        path: ['newPassword'],
    }
);

export const UpdateOwnProfileSchema = z.object({
    alias: z.string().max(64, '别名过长').optional(),
});

// --- Account Matrix / Users Routes ---

export const OpenNoteSchema = z.object({
    noteId: z.string().min(1, 'noteId 不能为空').max(64, 'noteId 过长'),
});

export const UpdateAliasSchema = z.object({
    alias: z.string().min(0).max(64, '别名过长').optional(),
});

const RoleEnum = z.enum(['admin', 'editor', 'viewer'], {
    error: () => '角色必须是 admin / editor / viewer',
});

export const CreateUserSchema = z.object({
    username: z.string().min(1, '用户名不能为空').max(32, '用户名过长'),
    password: z.string().min(6, '密码至少 6 位').max(128, '密码过长'),
    alias: z.string().max(64, '别名过长').optional(),
    role: RoleEnum.default('editor'),
    permissions: z.array(z.string()).optional(),
});

export const UpdateUserSchema = z.object({
    alias: z.string().max(64, '别名过长').optional(),
    role: RoleEnum.optional(),
    permissions: z.array(z.string()).optional(),
}).refine(
    (data) => data.alias !== undefined || data.role !== undefined || data.permissions !== undefined,
    {
        message: '至少需要修改一个字段',
        path: ['alias'],
    }
);

export const AdminResetPasswordSchema = z.object({
    newPassword: z.string().min(6, '新密码至少 6 位').max(128, '密码过长'),
});

export const UpdateUserStatusSchema = z.object({
    isActive: z.boolean({ error: 'isActive 必须是布尔值' }),
});

export const UpdatePersonaSchema = z.object({
    niche: z.string().max(100, '领域过长').optional(),
    persona_desc: z.string().max(2000, '人设描述过长').optional(),
    tone: z.string().max(200, '语气描述过长').optional(),
    writing_sample: z.string().max(5000, '写作样例过长').optional(),
});

// --- Competitor Routes ---

export const CompetitorAnalyzeSchema = z.object({
    url: z.string().min(1, '小红书主页 URL 不能为空').max(500, 'URL 过长'),
});

// --- Task Routes ---

export const ListTasksQuerySchema = PaginationQuerySchema.merge(DateRangeQuerySchema);

export const UpdateTaskStatusSchema = z.object({
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
    result: z.any().optional(),
    error: z.string().optional(),
});

// --- Draft Routes ---

const DraftImageItemSchema = z.union([
    z.string(),
    z.object({
        url: z.string(),
        prompt: z.string().optional(),
    }),
]);

/**
 * 创建草稿请求体
 *
 * 说明：
 * - title / content 必填
 * - tags 默认空数组
 * - images 兼容 string 与 { url, prompt } 对象
 * - contentType 默认图文笔记 note
 */
export const CreateDraftSchema = z.object({
    title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
    content: z.string().min(1, '正文不能为空').max(50000, '正文过长'),
    tags: z.array(z.string()).default([]),
    images: z.array(DraftImageItemSchema).default([]),
    contentType: z.string().default('note'),
    meta_data: z.any().optional(),
});

/**
 * 更新草稿请求体
 *
 * 说明：与创建草稿字段一致，当前业务要求整篇更新，因此 title / content 仍为必填。
 */
export const UpdateDraftSchema = CreateDraftSchema;

/**
 * 草稿列表单项（响应/前端类型推导）
 */
export const DraftSchema = z.object({
    id: z.number(),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    images: z.array(z.string()).optional(),
    content_type: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string().optional(),
    meta_data: z.any().optional(),
});

export type Draft = z.infer<typeof DraftSchema>;

// --- Note Routes ---

/**
 * 笔记列表查询参数
 */
export const ListNotesQuerySchema = PaginationQuerySchema.extend({
    accountId: AccountIdSchema,
    keyword: z.string().max(200, '关键词过长').optional(),
});

/**
 * 删除笔记请求体
 */
export const DeleteNoteBodySchema = z.object({
    accountId: AccountIdSchema,
});

// --- Asset Routes ---

export const AssetUploadParamsSchema = z.object({
    type: z.enum(['audio', 'image', 'video'], {
        error: '资源类型必须是 audio / image / video',
    }),
});

export const AssetProxyQuerySchema = z.object({
    url: z.string().min(1, 'URL 不能为空').max(2000, 'URL 过长'),
});

export const AssetListQuerySchema = z.object({
    type: z.string().max(50, '类型过长').optional(),
});

// --- Comment Routes ---

export const CommentListQuerySchema = PaginationQuerySchema.extend({
    status: z.string().max(50, '状态过长').optional(),
    accountId: AccountIdSchema,
});

export const CommentReplyBodySchema = z.object({
    commentId: z.string().min(1, '评论 ID 不能为空').max(64, '评论 ID 过长'),
    content: z.string().min(1, '回复内容不能为空').max(5000, '回复内容过长'),
});

// --- Compliance Routes ---

export const ComplianceAddRuleSchema = z.object({
    category: z.string().min(1, '分类不能为空').max(100, '分类过长'),
    keyword: z.string().min(1, '关键词不能为空').max(200, '关键词过长'),
    level: z.string().min(1, '等级不能为空').max(50, '等级过长'),
    suggestion: z.string().max(500, '建议过长').optional(),
});

export const ComplianceRuleIdParamSchema = z.object({
    id: z.coerce.number().int().positive('规则 ID 必须是正整数'),
});

export const ComplianceToggleSchema = z.object({
    is_enabled: z.boolean({ error: 'is_enabled 必须是布尔值' }),
});

export const ComplianceCheckSchema = z.object({
    content: z.string().min(1, '内容不能为空').max(50000, '内容过长'),
});

export const ComplianceFixSchema = z.object({
    content: z.string().min(1, '内容不能为空').max(50000, '内容过长'),
    blockedWords: z.array(z.string()).default([]),
    suggestions: z.array(z.string()).default([]),
});

// --- Config Routes ---

export const ConfigSelectorSchema = z.object({
    platform: z.string().max(50, '平台过长').default('xiaohongshu'),
    category: z.string().min(1, '分类不能为空').max(100, '分类过长'),
    key: z.string().min(1, '键名不能为空').max(100, '键名过长'),
    selector: z.string().min(1, '选择器不能为空').max(500, '选择器过长'),
    description: z.string().max(500, '描述过长').optional(),
});

// --- Niche Routes ---

export const NicheSearchSchema = z.object({
    keyword: z.string().min(1, '关键词不能为空').max(100, '关键词过长'),
    sort: z.enum(['general', 'latest', 'popular']).default('general'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    autoAnalyze: z.coerce.boolean().default(true),
});

export const NicheNotesQuerySchema = z.object({
    keyword: z.string().max(100, '关键词过长').optional(),
    sort: z.string().max(50, '排序字段过长').default('likes'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    hasAnalysis: z.coerce.boolean().default(false),
    topic: z.string().max(100, '主题过长').optional(),
});

export const NicheClassifySchema = z.object({
    keyword: z.string().max(100, '关键词过长').optional(),
    noteIds: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
});

export const NicheExportQuerySchema = z.object({
    keyword: z.string().max(100, '关键词过长').optional(),
    topic: z.string().max(100, '主题过长').optional(),
    format: z.enum(['markdown', 'excel']).default('markdown'),
});

// --- Notification Routes ---

export const NotificationListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export const NotificationIdParamSchema = z.object({
    id: z.coerce.number().int().positive('通知 ID 必须是正整数'),
});

// --- Optimization Routes ---

export const OptimizationListQuerySchema = z.object({
    status: z.string().max(50, '状态过长').optional(),
});

// --- Prompt Routes ---

export const PromptCreateSchema = z.object({
    name: z.string().min(1, '名称不能为空').max(100, '名称过长'),
    description: z.string().max(500, '描述过长').optional(),
    template: z.string().min(1, '模板内容不能为空').max(10000, '模板内容过长'),
});

// --- Settings Routes ---

export const SettingsUpdateSchema = z.record(z.string(), z.string(), {
    error: '设置项必须是 { key: string } 格式',
});

export const SettingsTestConnectionSchema = z.object({
    key: z.enum(['aliyun_api_key', 'deepseek_api_key'], {
        error: 'key 必须是 aliyun_api_key 或 deepseek_api_key',
    }),
});

// --- Trends Routes ---

export const TrendsQuerySchema = z.object({
    source: z.string().max(50, '来源过长').default('weibo'),
    refresh: z.coerce.boolean().default(false),
});

// --- Trending Notes Routes ---

export const TrendingNotesListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().max(50, '排序字段过长').default('scraped_at'),
    category: z.string().max(100, '分类过长').optional(),
    search: z.string().max(200, '搜索词过长').optional(),
    date: z.string().max(50, '日期格式过长').optional(),
    analyzed: z.coerce.boolean().default(false),
    type: z.string().max(50, '类型过长').optional(),
});

export const TrendingNoteImportSchema = z.object({
    note_id: z.string().min(1, '笔记 ID 不能为空').max(64, '笔记 ID 过长'),
    title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
    cover_url: z.string().max(2000, '封面 URL 过长').optional(),
    author_name: z.string().max(100, '作者名过长').optional(),
    likes_count: z.coerce.number().int().min(0).optional(),
    note_url: z.string().max(2000, '笔记 URL 过长').optional(),
    type: z.string().max(50, '类型过长').optional(),
    video_url: z.string().max(2000, '视频 URL 过长').optional(),
});

export const TrendingNoteScrapeSchema = z.object({
    category: z.string().max(100, '分类过长').default('recommend'),
});

export const TrendingNoteBatchDeleteSchema = z.object({
    ids: z.array(z.string().min(1)).min(1, '至少选择一个 ID'),
});

// --- User (Persona) Routes ---

export const PersonaCreateSchema = z.object({
    name: z.string().min(1, '名称不能为空').max(100, '名称过长'),
    niche: z.string().max(200, '领域过长').optional(),
    identity_tags: z.array(z.string()).optional(),
    style: z.string().max(500, '风格描述过长').optional(),
    benchmark_accounts: z.array(z.string()).optional(),
    writing_samples: z.array(z.string()).optional(),
});

export const PersonaUpdateSchema = PersonaCreateSchema.partial();

export const PersonaIdParamSchema = z.object({
    id: z.coerce.number().int().positive('人设 ID 必须是正整数'),
});

// --- Video Project Routes ---

export const VideoProjectCreateSchema = z.object({
    title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
    script: z.string().min(1, '脚本不能为空').max(50000, '脚本过长'),
    character_desc: z.string().max(2000, '角色描述过长').optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().max(2000, '描述过长').optional(),
});

export const VideoProjectUpdateCharacterSchema = z.object({
    character_desc: z.string().min(1, '角色描述不能为空').max(2000, '角色描述过长'),
});

export const VideoProjectUpdateBgmSchema = z.object({
    bgmUrl: z.string().min(1, 'BGM URL 不能为空').max(2000, 'BGM URL 过长'),
});

export const VideoProjectSceneAudioSchema = z.object({
    text: z.string().min(1, '文本不能为空').max(5000, '文本过长'),
    voice: z.string().max(100, '音色过长').optional(),
});

export const VideoProjectUpdateSceneSchema = z.object({
    status: z.string().min(1, '状态不能为空').max(50, '状态过长'),
    videoUrl: z.string().max(2000, '视频 URL 过长').optional(),
    taskId: z.string().max(100, '任务 ID 过长').optional(),
});

export const VideoProjectSceneIdParamSchema = z.object({
    sceneId: z.string().min(1, '场景 ID 不能为空').max(100, '场景 ID 过长'),
});
