import jwt from 'jsonwebtoken';

const token = jwt.sign(
    { id: 1, username: 'admin', alias: '管理员', role: 'admin' },
    'red-ant-fixed-secret-key-2026-dev',
    { expiresIn: '7d' }
);
console.log(token);
