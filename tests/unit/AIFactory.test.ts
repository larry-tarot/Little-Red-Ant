/**
 * CircuitBreaker unit tests — covers the failure / open / half-open
 * transitions that the AI provider uses to skip a flaky provider.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../api/services/ai/providers/CircuitBreaker.js';

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 100, // 100ms for fast tests
            halfOpenMaxCalls: 2,
        });
    });

    it('starts closed and allows calls', () => {
        expect(breaker.canExecute()).toBe(true);
    });

    it('opens after failureThreshold consecutive failures', () => {
        for (let i = 0; i < 3; i++) breaker.recordFailure();
        expect(breaker.canExecute()).toBe(false);
    });

    it('transitions to half-open after resetTimeout', async () => {
        for (let i = 0; i < 3; i++) breaker.recordFailure();
        expect(breaker.canExecute()).toBe(false);

        await new Promise((r) => setTimeout(r, 110));
        expect(breaker.canExecute()).toBe(true); // half-open: probe allowed
    });

    it('closes again on success in half-open', async () => {
        for (let i = 0; i < 3; i++) breaker.recordFailure();
        await new Promise((r) => setTimeout(r, 110));

        // In half-open state: canExecute() returns true; we need halfOpenMaxCalls
        // (configured to 2) successful probes to fully close the circuit.
        expect(breaker.canExecute()).toBe(true); // probe 1
        breaker.recordSuccess();
        // 1 success isn't enough — need 2 per halfOpenMaxCalls config.
        expect(breaker.canExecute()).toBe(true); // probe 2
        breaker.recordSuccess();
        // Now successCount (2) === halfOpenMaxCalls (2), so circuit is fully closed.
        expect(breaker.getState()).toBe('CLOSED');
        expect(breaker.canExecute()).toBe(true);

        // And subsequent failures should not open immediately
        breaker.recordFailure();
        expect(breaker.canExecute()).toBe(true);
    });

    it('half-open reopens on failure', async () => {
        for (let i = 0; i < 3; i++) breaker.recordFailure();
        await new Promise((r) => setTimeout(r, 110));

        expect(breaker.canExecute()).toBe(true); // half-open
        breaker.recordFailure();
        // Should be open again — but resetTimeout is 100ms, so right now we are 110ms in.
        // The breaker just reopens, so canExecute returns false until next reset.
        expect(breaker.canExecute()).toBe(false);
    });
});
