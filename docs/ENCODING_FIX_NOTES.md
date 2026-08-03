# 历史 commit message 乱码说明

> 仅供维护者阅读，普通用户无需关心。

## 现象

仓库早期（2026-07-31 一次大批提交）有两个 commit 的 message 在 `git log` 中显示为乱码，例如：

```
96fe8bc  chore: ÅäÖÃͬ²½ + ¹¹½¨½ű¾ÓŻ¯ + ÁÙʱ½ű¾¹鵵 + Îĵµ¸üÐÂ
370e10b  feat(frontend): ǰ¶Ë×é¼þÖع¹ + ¹²ÏíÀàÐÍ + ͳһÊý¾Ý Hooks
```

## 原因

当时的编辑器/工具链把 GBK 编码的 commit message **错误地**经过一次「GBK 字节 → 当作 Latin-1 字符 → 再以 UTF-8 编码」的双重转换后才写入 git 对象仓库。

数学上：每个原始字节 `B`（0x00-0xFF）被映射为 2 字节：

```
B' = 0xC0 | (B >> 6), 0x80 | (B & 0x3F)
```

即 `0xC5 0xE4`（GBK 编码的"配"两个字的前缀）→ `0xC3 0x85 0xC3 0xA4`（UTF-8 编码的 `Åä`）。

而 0x80-0xBF 范围内的单字节则保持原样，进一步加深破坏。

## 解决

**不重写历史**（避免影响远端 CI、他人 fork、PR 引用），改用 **git notes** 在 `refs/notes/corrected-msg` 命名空间下保存还原后的正确文本。commit hash 与推送历史保持不变。

| 乱码 commit | 还原后标题 |
| --- | --- |
| `96fe8bc` | `chore: 配置同步 + 构建脚本优化 + 临时脚本归档 + 文档更新` |
| `370e10b` | `feat(frontend): 前端组件重构 + 共享类型 + 统一数据 Hooks` |

## 如何查看

```bash
# 任意 commit 还原后的标题
git notes --ref=corrected-msg show 96fe8bc

# 让 git log 自动把 note 当成"修正后"的 message 打印
git log --format='%H%n  原标题: %s%n  修正后: %(notes:corrected-msg)%n' -2

# 仓库根目录提供便捷脚本
./scripts/git-log-readable.sh        # 漂亮打印最近 20 个 commit
./scripts/git-log-readable.sh -10    # 指定条数
./scripts/git-log-readable.sh 96fe8bc # 看指定 commit
```

## 复现修复

如果你看到新的乱码 commit，可用以下 Python 脚本还原（位于仓库脚本不存在时直接复制使用）：

```python
import subprocess

def fix_double_utf8(b):
    out = bytearray()
    i = 0
    while i < len(b):
        b0 = b[i]
        if 0xC0 <= b0 <= 0xC3 and i+1 < len(b) and 0x80 <= b[i+1] <= 0xBF:
            out.append(((b0 & 0x03) << 6) | (b[i+1] & 0x3F))
            i += 2
        else:
            out.append(b0); i += 1
    return bytes(out)

sha = "<乱码 commit>"
subj = subprocess.check_output(['git','show','-s','--format=%s', sha]).rstrip(b'\n')
body = subprocess.check_output(['git','show','-s','--format=%b', sha]).rstrip(b'\n')
print(fix_double_utf8(subj).decode('gbk', errors='replace'))
print(fix_double_utf8(body).decode('gbk', errors='replace'))
```

## 防止再次发生

1. **编辑器默认 UTF-8**：VS Code 设置 `"files.encoding": "utf8"`，Trae/Aider/Cursor 同理。
2. **git 全局 UTF-8**：
   ```bash
   git config --global i18n.commitEncoding utf-8
   git config --global i18n.logOutputEncoding utf-8
   ```
3. **Windows PowerShell 终端**：避免 `chcp 936`，改用 `chcp 65001` 或 Windows Terminal 默认 UTF-8。
4. **CI 校验**：`.github/workflows/ci.yml` 已在 `quick-check` 阶段对 commit message 做 UTF-8 校验（见 `scripts/check-commit-msg.mjs`），新 commit 不会重蹈覆辙。
