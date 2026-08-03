import { AIProvider } from '../interfaces/AIProvider.js';
import { CircuitBreaker } from './CircuitBreaker.js';

interface ProviderWithBreaker {
    provider: AIProvider;
    breaker: CircuitBreaker;
    lastFailure?: string;
}

export class CompositeProvider implements AIProvider {
    private providers: ProviderWithBreaker[];
    private name: string;

    constructor(name: string, providers: AIProvider[]) {
        this.name = name;
        this.providers = providers.map(p => ({
            provider: p,
            breaker: new CircuitBreaker({
                failureThreshold: 5,
                resetTimeout: 60000,
                halfOpenMaxCalls: 3
            })
        }));
    }

    private async executeWithBreaker<T>(
        operation: (provider: AIProvider) => Promise<T>
    ): Promise<T> {
        const errors: string[] = [];

        for (const item of this.providers) {
            const { provider, breaker } = item;
            if (!breaker.canExecute()) {
                console.warn(`[CompositeProvider] ${provider.constructor.name} is OPEN (circuit breaker), skipping...`);
                errors.push(`${provider.constructor.name}: Circuit breaker OPEN`);
                continue;
            }

            try {
                const result = await operation(provider);
                breaker.recordSuccess();
                return result;
            } catch (error: any) {
                const errorMessage = error.message || String(error);
                console.warn(`[CompositeProvider] ${this.name} operation failed with ${provider.constructor.name}:`, errorMessage);
                item.lastFailure = errorMessage;
                breaker.recordFailure();
                errors.push(`${provider.constructor.name}: ${errorMessage}`);
            }
        }

        throw new Error(`All providers failed for ${this.name}: ${errors.join('; ')}`);
    }

    async generateText(messages: any[], options?: any): Promise<string> {
        return this.executeWithBreaker(provider => provider.generateText(messages, options));
    }

    async generateJSON<T>(messages: any[], options?: any): Promise<T> {
        return this.executeWithBreaker(provider => provider.generateJSON<T>(messages, options));
    }

    async generateImage(prompt: string, options?: any): Promise<string> {
        return this.executeWithBreaker(async provider => {
            try {
                return await provider.generateImage(prompt, options);
            } catch (error: any) {
                if (error.message.includes('not support')) {
                    throw error; // 重新抛出，让断路器记录为失败
                }
                throw error;
            }
        });
    }
    
    // Optional: Video generation (extended interface)
    async generateVideo(prompt: string, imageUrl?: string): Promise<string> {
        return this.executeWithBreaker(async provider => {
            if ((provider as any).generateVideo) {
                return await (provider as any).generateVideo(prompt, imageUrl);
            }
            throw new Error('Video generation not supported');
        });
    }

    /**
     * 获取组合 Provider 中所有子 Provider 的状态
     *
     * 返回说明：
     * - object 包含组合器名称、当前主用 Provider、以及每个子 Provider 的
     *   断路器状态、失败次数、成功次数、最近失败时间、最近失败信息、是否允许执行
     */
    getStatus(): {
        name: string;
        activeProvider: string;
        providers: {
            name: string;
            state: string;
            failureCount: number;
            successCount: number;
            lastFailureTime: number;
            lastFailure?: string;
            canExecute: boolean;
        }[];
    } {
        const providers = this.providers.map((item) => {
            const stats = item.breaker.getStats() as {
                state: string;
                failureCount: number;
                successCount: number;
                lastFailureTime: number;
            };

            return {
                name: item.provider.constructor.name,
                state: stats.state,
                failureCount: stats.failureCount,
                successCount: stats.successCount,
                lastFailureTime: stats.lastFailureTime,
                lastFailure: item.lastFailure,
                canExecute: item.breaker.canExecute()
            };
        });

        const active = providers.find((p) => p.canExecute) || providers[0];

        return {
            name: this.name,
            activeProvider: active?.name || 'none',
            providers
        };
    }
}
