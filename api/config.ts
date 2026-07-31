import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load env vars — 按优先级:
//  1. 桌面版: %APPDATA%/xiaohongyi/.env  (主进程初始化时复制 .env.example 过去)
//  2. Web 版:  项目根 .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = process.env.XIAOHONGYI_USER_DATA
  || process.cwd();

// 优先用 userData/.env(桌面版),其次项目根 .env(开发)
const userEnvPath = path.join(USER_DATA_DIR, '.env');
const projectEnvPath = path.join(PROJECT_ROOT, '.env');

if (fs.existsSync(userEnvPath)) {
  dotenv.config({ path: userEnvPath });
} else if (fs.existsSync(projectEnvPath)) {
  dotenv.config({ path: projectEnvPath });
} else {
  // fallback:不指定 path,dotenv 自己从 cwd 找
  dotenv.config();
}

// 在用户数据目录下的子目录
const DATA_DIR = path.join(USER_DATA_DIR, 'data');
const LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
const UPLOADS_DIR = path.join(USER_DATA_DIR, 'uploads');
const TEMP_DIR = path.join(USER_DATA_DIR, 'temp');
const PUBLIC_DIR = path.join(USER_DATA_DIR, 'public');
const AUDIO_DIR = path.join(PUBLIC_DIR, 'audio');
const OUTPUTS_DIR = path.join(PUBLIC_DIR, 'outputs');
const SCREENSHOTS_DIR = path.join(LOGS_DIR, 'screenshots');

// 确保所有目录存在
[DATA_DIR, LOGS_DIR, UPLOADS_DIR, TEMP_DIR, PUBLIC_DIR, AUDIO_DIR, OUTPUTS_DIR, SCREENSHOTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            console.error(`[Config] Failed to create directory: ${dir}`, e);
        }
    }
});

export const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '14753', 10),

    paths: {
        root: PROJECT_ROOT,
        userData: USER_DATA_DIR,
        data: DATA_DIR,
        logs: LOGS_DIR,
        public: PUBLIC_DIR,
        uploads: UPLOADS_DIR,
        temp: TEMP_DIR,
        audio: AUDIO_DIR,
        outputs: OUTPUTS_DIR,
        screenshots: SCREENSHOTS_DIR,
        db: path.join(DATA_DIR, 'app.db'),
    },

    rpa: {
        // 'playwright' (default) | 'camoufox' (experimental, requires camoufox-js)
        driver: process.env.RPA_DRIVER || 'playwright',
    },

    security: {
        jwtSecret: process.env.JWT_SECRET || (() => {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('JWT_SECRET is required in production environment');
            }
            console.warn('[Security] Using default JWT secret. This is unsafe for production.');
            return 'little-red-ant-secret-key-2026-dev-only';
        })(),
        // 默认 30 天并支持环境变量覆盖：解决用户反馈“登录态很快过期”的问题。
        // 仍保留密码版本校验，改密后旧 token 会立即失效。
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    },

    ai: {
        deepseek: {
            apiKey: process.env.DEEPSEEK_API_KEY,
            baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        },
        aliyun: {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
            ossBucket: process.env.ALIYUN_OSS_BUCKET,
            ossRegion: process.env.ALIYUN_OSS_REGION,
            dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
        }
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
        dir: LOGS_DIR,
    }
};

export default config;
