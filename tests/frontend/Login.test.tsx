/**
 * Login page unit tests — covers rendering and basic interactions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock the auth store
vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: vi.fn((selector) => {
        const state = {
            token: null,
            user: null,
            login: vi.fn(),
            logout: vi.fn(),
            isAuthenticated: () => false,
        };
        return selector ? selector(state) : state;
    }),
}));

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: { hasUsers: true } }),
        post: vi.fn().mockResolvedValue({ data: { token: 'test-token', user: { id: 1, username: 'admin', role: 'admin' } } }),
    },
}));

import Login from '../../src/pages/Login';

function renderLogin() {
    return render(
        <BrowserRouter>
            <Login />
        </BrowserRouter>
    );
}

describe('Login Page', () => {
    it('renders the app title', () => {
        renderLogin();
        expect(screen.getByText('小红蚁')).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
        renderLogin();
        expect(screen.getByText('小红书矩阵运营系统')).toBeInTheDocument();
    });

    it('renders login and register tabs', () => {
        renderLogin();
        expect(screen.getByText('登录')).toBeInTheDocument();
        expect(screen.getByText('注册')).toBeInTheDocument();
    });

    it('renders username input field', () => {
        renderLogin();
        expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    });

    it('renders password input field', () => {
        renderLogin();
        expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument();
    });
});