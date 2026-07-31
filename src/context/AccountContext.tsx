import axios from '@/lib/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useState, useEffect, useContext, createContext, ReactNode } from "react";

interface Account {
    id: number;
    nickname: string;
    avatar?: string;
    persona_image_url?: string;
    persona?: {
        desc?: string;
    };
    status: string;
}

interface AccountContextType {
    activeAccount: Account | null;
    isLoading: boolean;
    refreshAccount: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider = ({ children }: { children: ReactNode }) => {
    const [activeAccount, setActiveAccount] = useState<Account | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const isAuthenticated = useAuthStore((state) => !!state.token);

    const fetchActiveAccount = async () => {
        // If not logged in, skip fetching but set loading to false
        if (!isAuthenticated) {
            setActiveAccount(null);
            setIsLoading(false);
            return;
        }

        try {
            const res = await axios.get('/api/accounts/status');
            if (res.data.activeAccount) {
                setActiveAccount(res.data.activeAccount);
            } else {
                setActiveAccount(null);
            }
        } catch (error) {
            console.error('Failed to fetch global account status', error);
            // Don't crash, just set null
            setActiveAccount(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchActiveAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]); // Re-fetch when auth state changes

    const refreshAccount = async () => {
        setIsLoading(true);
        await fetchActiveAccount();
    };

    return (
        <AccountContext.Provider value={{ activeAccount, isLoading, refreshAccount }}>
            {children}
        </AccountContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAccount = () => {
    const context = useContext(AccountContext);
    if (context === undefined) {
        throw new Error('useAccount must be used within an AccountProvider');
    }
    return context;
};