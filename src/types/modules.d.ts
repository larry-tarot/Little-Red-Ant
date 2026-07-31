/**
 * 第三方库类型声明兜底
 *
 * 这些库没有官方 @types 包或类型声明，为避免 strict 模式下 implicit-any 报错，
 * 统一在此处做最小化声明。后续若官方提供类型定义，可替换为精确类型。
 */
declare module 'better-sqlite3' {
    const Database: any;
    export default Database;
}

declare module 'node-fetch' {
    const fetch: any;
    export default fetch;
}

declare module 'ali-oss' {
    const OSS: any;
    export default OSS;
}

declare module 'fluent-ffmpeg' {
    const ffmpeg: any;
    export default ffmpeg;
}
