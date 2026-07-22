import { AIProvider } from '../interfaces/AIProvider.js';
import { CircuitBreaker } from './CircuitBreaker.js';

interface ProviderWithBreaker {
    provider: AIProvider;
    breaker: CircuitBreaker;
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
        
        for (const { provider, breaker } of this.providers) {
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
                console.warn(`[CompositeProvider] ${this.name} operation failed with ${provider.constructor.name}:`, error.message);
                breaker.recordFailure();
                errors.push(`${provider.constructor.name}: ${error.message}`);
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
}
