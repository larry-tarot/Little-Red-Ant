/**
 * 文件功能：运营人设（users 表）Service 层，封装运营人设的数据库操作
 * 主要类/函数：UserService
 * 作者：AI Assistant
 * 创建时间：2026-06-26
 * 最后修改：2026-06-26
 */

import db from '../../db.js';

/**
 * 运营人设数据结构
 */
export interface Persona {
    id: number;
    name: string;
    niche: string;
    identity_tags: string;      // JSON 字符串
    style: string;
    benchmark_accounts: string; // JSON 字符串
    writing_samples: string;    // JSON 字符串
    is_active: number;
    created_at: string;
    updated_at: string;
}

/**
 * 解析后的运营人设（JSON 字段已转对象）
 */
export interface ParsedPersona {
    id: number;
    name: string;
    niche: string;
    identity_tags: any[];
    style: string;
    benchmark_accounts: any[];
    writing_samples: any[];
    is_active: number;
    created_at: string;
    updated_at: string;
}

export class UserService {
    /**
     * 功能描述：获取当前活跃的人设，无活跃则回退到最新创建的一条
     *
     * 返回说明：
     * - ParsedPersona | null 解析后的活跃人设，无数据时返回 null
     *
     * 使用示例：
     * >>> const persona = UserService.getActivePersona();
     * >>> if (persona) console.log(persona.name);
     */
    static getActivePersona(): ParsedPersona | null {
        // 优先取 is_active=1 的人设
        const user = db.prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get() as Persona | undefined;
        // 回退：取最新一条
        const fallback = db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 1').get() as Persona | undefined;

        const target = user || fallback;
        if (!target) return null;

        return this.parsePersona(target);
    }

    /**
     * 功能描述：获取所有人设列表（按更新时间倒序）
     *
     * 返回说明：
     * - ParsedPersona[] 解析后的人设数组
     */
    static getAllPersonas(): ParsedPersona[] {
        const users = db.prepare('SELECT * FROM users ORDER BY updated_at DESC').all() as Persona[];
        return users.map(u => this.parsePersona(u));
    }

    /**
     * 功能描述：创建新人设（首条自动设为活跃，其余默认非活跃）
     *
     * 参数说明：
     * - data: [object] 人设数据
     *   - name: [string] 人设名称
     *   - niche: [string] 赛道领域
     *   - identity_tags: [any[]] 身份标签数组
     *   - style: [string] 写作风格
     *   - benchmark_accounts: [any[]] 对标账号数组
     *   - writing_samples: [any[]] 写作样本数组
     *
     * 返回说明：
     * - { success: boolean, id: number | bigint, message: string }
     */
    static createPersona(data: {
        name?: string;
        niche: string;
        identity_tags?: any[];
        style?: string;
        benchmark_accounts?: any[];
        writing_samples?: any[];
    }): { success: boolean; id: number | bigint; message: string } {
        // 第一条人设自动设为活跃
        const count = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
        const isActive = count.c === 0 ? 1 : 0;

        const info = db.prepare(`
            INSERT INTO users (name, niche, identity_tags, style, benchmark_accounts, writing_samples, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            data.name || `${data.niche}博主`,
            data.niche,
            JSON.stringify(data.identity_tags || []),
            data.style,
            JSON.stringify(data.benchmark_accounts || []),
            JSON.stringify(data.writing_samples || []),
            isActive
        );

        return { success: true, id: info.lastInsertRowid, message: 'Persona created successfully' };
    }

    /**
     * 功能描述：更新指定人设
     *
     * 参数说明：
     * - id: [number] 人设 ID
     * - data: [object] 待更新字段（同 createPersona 的 data）
     */
    static updatePersona(id: number, data: {
        name?: string;
        niche?: string;
        identity_tags?: any[];
        style?: string;
        benchmark_accounts?: any[];
        writing_samples?: any[];
    }): void {
        db.prepare(`
            UPDATE users
            SET name = ?, niche = ?, identity_tags = ?, style = ?, benchmark_accounts = ?, writing_samples = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            data.name,
            data.niche,
            JSON.stringify(data.identity_tags || []),
            data.style,
            JSON.stringify(data.benchmark_accounts || []),
            JSON.stringify(data.writing_samples || []),
            id
        );
    }

    /**
     * 功能描述：激活指定人设（事务内先全部置 0 再激活目标）
     *
     * 参数说明：
     * - id: [number] 待激活的人设 ID
     */
    static activatePersona(id: number): void {
        db.transaction(() => {
            db.prepare('UPDATE users SET is_active = 0').run();
            db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(id);
        })();
    }

    /**
     * 功能描述：删除指定人设
     *
     * 参数说明：
     * - id: [number] 人设 ID
     */
    static deletePersona(id: number): void {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }

    /**
     * 功能描述：将数据库原始记录的 JSON 字段解析为对象
     *
     * 参数说明：
     * - raw: [Persona] 数据库原始记录
     *
     * 返回说明：
     * - ParsedPersona 解析后的人设对象
     *
     * NOTE: 私有工具方法，供内部调用复用
     */
    private static parsePersona(raw: Persona): ParsedPersona {
        return {
            ...raw,
            identity_tags: JSON.parse(raw.identity_tags || '[]'),
            benchmark_accounts: JSON.parse(raw.benchmark_accounts || '[]'),
            writing_samples: JSON.parse(raw.writing_samples || '[]')
        };
    }
}
