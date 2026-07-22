/**
 * 文件功能：AI Provider 断路器模式实现，防止故障 Provider 被反复调用导致雪崩效应
 * 主要类/函数：CircuitBreaker, CircuitBreakerState
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

export enum CircuitBreakerState {
    CLOSED = 'CLOSED',      // 正常状态，允许请求通过
    OPEN = 'OPEN',          // 断路器打开，拒绝请求
    HALF_OPEN = 'HALF_OPEN' // 半开状态，允许少量请求试探
}

export interface CircuitBreakerOptions {
    failureThreshold: number;    // 失败次数阈值，达到后打开断路器
    resetTimeout: number;        // 断路器打开后，多久进入半开状态（毫秒）
    halfOpenMaxCalls: number;    // 半开状态下允许的最大试探请求数
}

export class CircuitBreaker {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: number = 0;
    private halfOpenCalls: number = 0;
    private readonly options: CircuitBreakerOptions;

    constructor(options: Partial<CircuitBreakerOptions> = {}) {
        this.options = {
            failureThreshold: 5,      // 默认 5 次失败打开断路器
            resetTimeout: 60000,       // 默认 60 秒后进入半开状态
            halfOpenMaxCalls: 3,       // 半开状态最多允许 3 次试探
            ...options
        };
    }

    /**
     * 获取当前断路器状态
     * 
     * 返回说明：
     * - CircuitBreakerState 当前状态枚举值
     */
    getState(): CircuitBreakerState {
        // 如果处于 OPEN 状态，检查是否已经过了 resetTimeout
        if (this.state === CircuitBreakerState.OPEN) {
            const now = Date.now();
            if (now - this.lastFailureTime >= this.options.resetTimeout) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.halfOpenCalls = 0;
                this.successCount = 0;
                console.log(`[CircuitBreaker] State changed: OPEN -> HALF_OPEN`);
            }
        }
        return this.state;
    }

    /**
     * 检查是否允许请求通过
     * 
     * 返回说明：
     * - boolean true 表示允许请求，false 表示拒绝
     */
    canExecute(): boolean {
        const state = this.getState();
        
        if (state === CircuitBreakerState.CLOSED) {
            return true;
        }
        
        if (state === CircuitBreakerState.OPEN) {
            return false;
        }
        
        // HALF_OPEN 状态：检查试探次数是否超限
        if (state === CircuitBreakerState.HALF_OPEN) {
            if (this.halfOpenCalls < this.options.halfOpenMaxCalls) {
                this.halfOpenCalls++;
                return true;
            }
            return false;
        }
        
        return false;
    }

    /**
     * 记录成功请求
     * 
     * 功能描述：当底层 Provider 调用成功时调用此方法
     * 在半开状态下，如果成功次数达到阈值，关闭断路器
     */
    recordSuccess(): void {
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.successCount++;
            // 半开状态下，如果成功次数达到 halfOpenMaxCalls，关闭断路器
            if (this.successCount >= this.options.halfOpenMaxCalls) {
                this.state = CircuitBreakerState.CLOSED;
                this.failureCount = 0;
                this.successCount = 0;
                this.halfOpenCalls = 0;
                console.log(`[CircuitBreaker] State changed: HALF_OPEN -> CLOSED`);
            }
        } else if (this.state === CircuitBreakerState.CLOSED) {
            // 正常状态下，重置失败计数
            this.failureCount = 0;
        }
    }

    /**
     * 记录失败请求
     * 
     * 功能描述：当底层 Provider 调用失败时调用此方法
     * 在关闭状态下，如果失败次数达到阈值，打开断路器
     * 在半开状态下，任何失败都会立即重新打开断路器
     */
    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            // 半开状态下，任何失败都会重新打开断路器
            this.state = CircuitBreakerState.OPEN;
            this.halfOpenCalls = 0;
            this.successCount = 0;
            console.log(`[CircuitBreaker] State changed: HALF_OPEN -> OPEN (failure in half-open)`);
        } else if (this.state === CircuitBreakerState.CLOSED) {
            if (this.failureCount >= this.options.failureThreshold) {
                this.state = CircuitBreakerState.OPEN;
                console.log(`[CircuitBreaker] State changed: CLOSED -> OPEN (${this.failureCount} failures)`);
            }
        }
    }

    /**
     * 获取断路器统计信息（用于调试和监控）
     * 
     * 返回说明：
     * - object 包含 state, failureCount, successCount, lastFailureTime 等字段
     */
    getStats(): object {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            halfOpenCalls: this.halfOpenCalls,
            lastFailureTime: this.lastFailureTime,
            options: this.options
        };
    }
}
