# Import 测试文件

这个文件夹放 Import 功能的测试文件和 UAT 结果。所有资料都是假的（`DT-` 开头），不要把真实课程资料放进来，因为这个 repo 是 public 的。

每次测试前先 **Clear all data**，因为 Course Code 重复会挡下文件。用 Auditor 登录，在 Courses 页按 Import。

## 测试文件

| 文件 | 选哪个 | 应该看到 | 状态 |
|---|---|---|---|
| `01-new-valid.xlsx` | New | 可以导入 5 门 | 通过 |
| `02-new-duplicate-code.csv` | New | 挡下，1 个问题（大小写不同也算重复） | 通过 |
| `03-new-same-name.csv` | New | 可以导入 2 门，1 个同名警告 | 通过 |
| `04-existing-valid.xlsx` | Existing | 3 Healthy、2 Unhealthy、1 Discontinued、3 张 ticket | 通过 |
| `05-existing-bad-data.csv` | Existing | 挡下，13 个问题 | 通过 |
| `06-existing-same-code-different-data.csv` | Existing | 挡下，2 个问题（Course Name 和 Docebo Price 不同） | 通过 |
| `07-existing-same-issue-twice.csv` | Existing | 可以导入 1 门，只开 1 张 ticket，有警告 | 通过 |
| `08-wrong-template.csv` | New | 不接受，提示改用 Import existing courses | 通过 |
| `09-old-master-layout.csv` | Existing | 不接受，提示缺少栏位 | 通过 |
| `10-date-formats.csv` | Existing | 挡下，2 个问题（文字日期只接受 `YYYY-MM-DD`） | 通过 |
| `11-hidden-character-code.csv` | New | 挡下，2 个问题（隐藏字符和多余空格不能绕过重复检查） | 通过 |
| `12-audit-owner-names.csv` | Existing | **应该检查名字；现在 3 行都能导入** | **问题 3** |
| `13-price-currency-audience.csv` | Existing | **应该挡下；现在 3 行都能导入** | **问题 5** |
| `14-new-large-1000.csv` | New | 可以导入 1,000 门 | 通过 |

## UAT 结果

测试日期：2026-11-06，在 localhost 用 Auditor、SELM、Course Owner 测试。

**通过：**

- 权限：Auditor 两种都能用，Course Owner 只能用 New，SELM 看不到 Import。
- 文件：`.xlsx`、`.csv`、大写副档名、栏位顺序不同、多余栏位、空白行都正常；错误文件、坏文件、空文件都有清楚提示。行号正确。
- 一行不对就整个文件不能导入，资料完全不变。错误会逐项列出行号、课程、栏位、文件里的值和问题。
- Discontinued 的 Course Code 不能再用，Add course 和 Import 都挡下。
- 导入后的流程：Escalate、填 fix date、Resolved、Approve 变 Healthy；Start audit；Re-audit；Restore 都正常。
- 文字和文件名里的 HTML 不会被执行。
- 存储空间不够时不导入，也不改资料。
- 手机宽度（375px）的弹窗和翻页没有超出屏幕。

**问题：**

| # | 严重度 | 问题 | 例子 | 建议 |
|---|---|---|---|---|
| 1 | 已修好 | 文字日期被当成月/日，日/月的日期会默默变成错误日期 | `03/10/2026`（3 Oct）存成 3 月 10 日。旧 Excel 的文字里两种写法都有 | 文字日期只接受 `YYYY-MM-DD`；Excel 日期格式照常 |
| 2 | 已修好 | 隐藏字符和多余空格可以绕过 Course Code 重复检查 | `DT-H1` 和后面带零宽字符的 `DT-H1` 算两门；`DT H1` 和 `DT  H1` 也算两门 | 比较前删除隐藏字符、合并空格 |
| 3 | 中 | Audit Owner 不检查 | `Zed`、`rick`、SELM 的 `Gary` 都能导入。Team 页不算这些 audit，`rick` 的不算进 Rick | 待决定，见问题 B |
| 4 | 已修好 | 导入后没有撤销 | Existing 导入的课程没有 Delete，要清掉只能 Clear all data（全部资料） | 已加整批撤销：Courses 页的 Undo import 和 Import history |
| 5 | 中 | 没有上限和合理性检查 | 价格 `999999999999` 超过数据库 `decimal(10,2)`；币种 `ZZZ`；`Partner, partner` 存成两个；日期 `1900-01-01` 也接受 | 加上限、币种清单，Audience 去重 |
| 6 | 中 | Code 和 Name 没有长度限制 | 300 字的 Code、3,000 字的 Name 都能导入，可能撑破版面 | 和数据库长度一致 |
| 7 | 低 | 只读第一张 sheet，提示没有说明 | 第一张是 Summary 时，只提示缺少栏位 | 提示里写明读的是哪张 sheet |
| 8 | 低 | CSV 不是 UTF-8 时，中文变乱码也能导入 | GBK 编码的中文名称变成 `����` | 发现乱码就挡下 |
| 9 | 低 | 读大文件时关掉弹窗，读完会再弹出来 | 60,000 行的 CSV | 关掉就取消 |
| 10 | 低 | 拖放文件没有测试，弹窗的键盘操作也没有完整测试 | | 正式上线前再测 |

**还没测试：** artifact 版本的上传和下载，以及真的用文件拖放。

## 要决定的问题

| # | 问题 | 为什么要决定 |
|---|---|---|
| A | 整批撤销的规则可以吗？ | 现在只有 Auditor 或导入的人能撤销；只要其中一门课被动过，整批都不能撤销 |
| B | Audit Owner 不在系统里（已离职或还没开账号）时怎么办？ | 旧资料有 8 位 Audit Owner 不在 demo 的用户里，他们的 audit 不会出现在 Team 页 |
| C | 导入的 audit 要算进 Team 的成绩和 Status report 吗？ | 现在会算，某段时间的数字可能突然变高 |
| D | 谁可以导入 Existing？只要 Auditor 就够吗？还是要 Admin？ | 这个操作可以改很多资料，也会写入别人的 audit 结果 |
| E | 要不要 Import updates（批量更新已有课程）？ | 现在已有的 Course Code 一律挡下，要改只能手动 |
| F | 550 张 ticket 同一天开始算 7 天，SELM 处理得完吗？ | 可能一周后同时全部超时，可以考虑分批导入 |
| G | Currency 留空代表什么？可以当作 USD 吗？ | 旧资料大部分没写币种 |
| H | 多个 Category 拆成多张相同文字的 ticket，团队可以接受吗？ | 真实文件因此多了 105 张 |
| I | `Needs review` 的 1,605 行谁负责看？什么时候看完？ | 这些改好前，只有 1,087 门课能进系统 |

## 正式网站要注意

- 所有检查都要在服务器端再做一次，并用一个 transaction 写入，这样不会只导入一半。
- 文件要在服务器解析。Demo 用的 SheetJS 0.18.5 是旧版本，有已公开的安全问题，不适合用来处理不信任的文件。
