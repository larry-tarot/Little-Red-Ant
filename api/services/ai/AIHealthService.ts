import { AIFactory } from './AIFactory.js';
import { DeepSeekProvider } from './providers/DeepSeekProvider.js';
import { AliyunProvider } from './providers/AliyunProvider.js';
import { Logger } from '../LoggerService.js';

/**
 * 支持的 Provider 名称
 */
type ProviderName = 'deepseek' | 'aliyun';

/**
 * 单次健康检查结果
 */
interface HealthCheckResult {
    name: ProviderName;
    healthy: boolean;
    latency: number;
    error?: string;
    quota?: number | null;
}

/**
 * 内存中保存的 Provider 健康记录
 */
interface ProviderHealthEntry extends HealthCheckResult {
    lastCheckAt: string | null;
}

/**
 * 对外暴露的 Provider 状态项
 */
interface ProviderStatusEntry {
    name: string;
    healthy: boolean;
    latency: number;
    lastCheckAt: string | null;
    state: string;
    failureCount: number;
}

/**
 * getStatus 返回值
 */
interface StatusResult {
    providers: ProviderStatusEntry[];
    activeProvider: string;
}

/**
 * 健康检查超时时间（毫秒）
 */
const CHECK_TIMEOUT_MS = 15000;

/**
 * 用于健康检查的最小化提示语
 */
const TINY_PROMPT = '健康检查，请简短回复 OK';

/**
 * AI Provider 健康检查服务
 *
 * 功能描述：在内存中追踪 DeepSeek 与 Aliyun 两个 Provider 的健康状态，
 * 提供主动探测接口与状态聚合接口。主动探测会实际调用一次最小化文本生成，
 * 用于验证密钥有效性与网络可达性。
 */
export class AIHealthService {
    /**
     * 内存中的 Provider 健康记录
     */
    private static providerHealth: Map<string, ProviderHealthEntry> = new Map();

    /**
     * 检查指定 Provider 的健康状态
     *
     * 参数说明：
     * - name: ProviderName 要检查的供应商名称，仅支持 'deepseek' 或 'aliyun'
     *
     * 返回说明：
     * - HealthCheckResult 包含 healthy（是否健康）、latency（耗时毫秒）、
     *   error（错误信息，成功时无此字段）、quota（剩余额度，当前固定返回 null）
     *
     * 使用示例：
     * >>> const result = await AIHealthService.checkProvider('deepseek');
     * >>> console.log(result.healthy, result.latency);
     *
     * 异常情况：
     * - 超时：15 秒内未返回则 healthy=false，error='健康检查超时'
     * - 调用异常：底层 Provider 抛出的错误会被捕获并记录到 error 字段
     */
    static async checkProvider(name: ProviderName): Promise<HealthCheckResult> {
        Logger.info('AIHealthService', `开始检查 Provider: ${name}`);
        const startTime = Date.now();
        let healthy = false;
        let error: string | undefined;
        const quota: number | null = null;

        try {
            await this.runProviderCheck(name);
            healthy = true;
            Logger.info('AIHealthService', `Provider ${name} 检查成功`);
        } catch (err: any) {
            healthy = false;
            error = err.message || String(err);
            Logger.error('AIHealthService', `Provider ${name} 检查失败`, err);
        }

        const latency = Date.now() - startTime;
        const entry: ProviderHealthEntry = {
            name,
            healthy,
            latency,
            error,
            quota,
            lastCheckAt: new Date().toISOString()
        };
        this.providerHealth.set(name, entry);

        return { name, healthy, latency, error, quota };
    }

    /**
     * 执行实际的 Provider 探测调用
     *
     * 参数说明：
     * - name: ProviderName 供应商名称
     *
     * 返回说明：
     * - Promise<void> 调用成功即代表健康
     *
     * 异常情况：
     * - Provider 初始化失败（如缺少 API Key）会抛出错误
     * - 调用超过 CHECK_TIMEOUT_MS 会抛出超时错误
     */
    private static async runProviderCheck(name: ProviderName): Promise<void> {
        const provider = name === 'deepseek'
            ? new DeepSeekProvider()
            : new AliyunProvider();

        const checkPromise = provider.generateText([
            { role: 'user', content: TINY_PROMPT }
        ]);

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () => reject(new Error('健康检查超时')),
                CHECK_TIMEOUT_MS
            );
        });

        await Promise.race([checkPromise, timeoutPromise]);
    }

    /**
     * 获取当前所有 Provider 的健康状态汇总
     *
     * 返回说明：
     * - StatusResult 包含 providers 数组（每个 Provider 的健康、延迟、
     *   最近检查时间、断路器状态、失败次数）与 activeProvider（当前主用 Provider）
     *
     * 使用示例：
     * >>> const status = AIHealthService.getStatus();
     * >>> console.log(status.activeProvider, status.providers);
     *
     * 异常情况：
     * - 若尚未执行过 checkProvider，healthy 为 false，latency 为 -1
     */
    static getStatus(): StatusResult {
        const factoryStatus = AIFactory.getProviderStatus();
        const activeProvider = factoryStatus?.activeProvider || 'unknown';
        const factoryProviders = factoryStatus?.providers || [];

        const providers: ProviderStatusEntry[] = ['deepseek', 'aliyun'].map((name) => {
            const health = this.providerHealth.get(name);
            const factoryProvider = factoryProviders.find(
                (p) => p.name.toLowerCase().includes(name) || p.name === name
            );

            return {
                name,
                healthy: health?.healthy ?? false,
                latency: health?.latency ?? -1,
                lastCheckAt: health?.lastCheckAt ?? null,
                state: factoryProvider?.state ?? 'UNKNOWN',
                failureCount: factoryProvider?.failureCount ?? 0
            };
        });

        return { providers, activeProvider };
    }
}
