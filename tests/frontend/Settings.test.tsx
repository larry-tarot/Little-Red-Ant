/**
 * Settings page unit tests — covers rendering of core UI elements.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock the auth store
vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: vi.fn((selector) => {
        const state = { token: 'test', user: { id: 1, username: 'admin', role: 'admin' }, isAuthenticated: () => true };
        return selector ? selector(state) : state;
    }),
}));

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: { aliyun_api_key: 'sk-test', deepseek_api_key: 'sk-test' } }),
        post: vi.fn().mockResolvedValue({ data: { success: true } }),
        put: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
}));

import SettingsPage from '../../src/pages/Settings';

function renderSettings() {
    return render(
        <BrowserRouter>
            <SettingsPage />
        </BrowserRouter>
    );
}

describe('Settings Page', () => {
    it('renders the page title', async () => {
        renderSettings();
        expect(await screen.findByText('系统设置')).toBeInTheDocument();
    });

    it('renders the profile tab', async () => {
        renderSettings();
        expect(await screen.findByText('个人资料')).toBeInTheDocument();
    });

    it('renders the system tab', async () => {
        renderSettings();
        expect(await screen.findByText('系统配置')).toBeInTheDocument();
    });

    it('renders API Key input field', async () => {
        renderSettings();
        // Wait for settings to load
        await screen.findByText('系统配置');
        // Click the system tab to reveal API key section
        const systemTab = screen.getByText('系统配置');
        systemTab.click();
        // Check for the specific API Key label (Aliyun)
        expect(await screen.findByText(/DASHSCOPE_API_KEY/)).toBeInTheDocument();
    });
});