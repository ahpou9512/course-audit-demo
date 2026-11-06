# Database schema

Course Audit Central 以后变成真网站时的数据库设计。现在的 demo 把数据存在浏览器的 localStorage（`courses`、`audits`、`tickets`、`logs`），真网站会把它们拆成下面 11 张表。

## ER 图

```mermaid
erDiagram
  COURSES ||--o{ COURSE_AUDIENCES : has
  COURSES ||--o{ COURSE_LEARNING_PLANS : "part of"
  COURSES ||--o{ AUDITS : "audited in"
  USERS ||--o{ AUDITS : performs
  AUDITS ||--|{ AUDIT_ANSWERS : contains
  CRITERIA ||--o{ AUDIT_ANSWERS : answers
  AUDITS ||--o{ TICKETS : raises
  COURSES ||--o{ TICKETS : has
  USERS ||--o{ TICKETS : creates
  USERS |o--o{ TICKETS : escalates
  USERS |o--o{ TICKETS : "approves close"
  USERS |o--o{ COURSES : "is auditing"
  USERS |o--o{ COURSES : discontinues
  TICKETS ||--o{ TICKET_NOTES : has
  USERS ||--o{ TICKET_NOTES : writes
  COURSES ||--o{ ACTIVITY_LOGS : logs
  USERS ||--o{ ACTIVITY_LOGS : "acts in"
  USERS ||--o{ IMPORT_BATCHES : imports
  IMPORT_BATCHES ||--o{ COURSES : adds
  TICKETS |o--o{ ACTIVITY_LOGS : "records of"
  AUDITS |o--o{ ACTIVITY_LOGS : "edits of"

  USERS {
    int Id PK
    string Name
    string Email UK
    string Role
  }
  COURSES {
    int Id PK
    string Code UK
    string Name
    string Type
    decimal DoceboPrice
    string Health
    string AuditStatus
    int CurrentAuditId FK
    int LockedById FK
    datetime LockedAt
    datetime DiscontinuedAt
    int DiscontinuedById FK
    string DiscontinueReason
    int ImportBatchId FK
    datetime CreatedAt
  }
  COURSE_AUDIENCES {
    int CourseId PK
    string Audience PK
  }
  CRITERIA {
    int Id PK
    string Code
    string Label
    bool AllowNA
    int SortOrder
  }
  AUDITS {
    int Id PK
    int CourseId FK
    int AuditorId FK
    datetime AuditedAt
    string Result
    bool IsReverification
    decimal PriceSnapshot
    string AudienceSnapshot
    string LearningPlanSnapshot
    string Note
  }
  AUDIT_ANSWERS {
    int AuditId PK
    int CriterionId PK
    string Answer
  }
  TICKETS {
    int Id PK
    string Code UK
    int CourseId FK
    int AuditId FK
    string Category
    string Detail
    string Status
    datetime CreatedAt
    datetime SlaStartAt
    int CreatedById FK
    int EscalatedById FK
    datetime EscalatedAt
    datetime FixDate
    datetime FirstFixDate
    string Justification
    string Rejection
    datetime ClosedAt
    int ClosedById FK
    string ClosedAs
  }
  TICKET_NOTES {
    int Id PK
    int TicketId FK
    int UserId FK
    datetime CreatedAt
    string Text
  }
  ACTIVITY_LOGS {
    int Id PK
    datetime CreatedAt
    int ActorId FK
    int CourseId FK
    int TicketId FK
    int AuditId FK
    string Action
    string Detail
    int ImportBatchId FK
  }
  COURSE_LEARNING_PLANS {
    int CourseId PK
    string LearningPlanCode PK
  }
  IMPORT_BATCHES {
    int Id PK
    string FileName
    string Kind
    int CourseCount
    int ImportedById FK
    datetime ImportedAt
    int UndoneById FK
    datetime UndoneAt
  }
```

## 怎么看这张图

**字段标记**

| 标记 | 意思 |
|---|---|
| PK | Primary Key，主键，每一行的唯一编号 |
| FK | Foreign Key，外键，指向另一张表的 PK |
| UK | Unique Key，值不能重复 |

两个字段都标 PK（例如 `AUDIT_ANSWERS` 的 `AuditId` + `CriterionId`）叫 **复合主键**：两个合起来不能重复，也就是同一次 audit 的同一条 criterion 只能有一个答案。

**关系符号**（线的两头）

| 符号 | 意思 |
|---|---|
| `\|\|` | 刚好一个 |
| `\|o` | 零个或一个 |
| `o{` | 零个或多个 |
| `\|{` | 一个或多个 |

例如：
- `COURSES ||--o{ AUDITS`：一门课有零到多次 audit，每次 audit 属于刚好一门课。
- `AUDITS ||--|{ AUDIT_ANSWERS`：每次 audit 至少有一个答案（实际上是 8 个）。
- `USERS |o--o{ TICKETS`：ticket 刚创建时还没有人 escalate，所以 `EscalatedById` 可以是空的。
- `USERS |o--o{ COURSES : "is auditing"`：同一时间最多一个人在 audit 一门课（`LockedById`），没人在做时是空的。

## 状态字段的固定值

这些字段只能是下面几个值（可以用 C# 的 `enum`，或另外一张小表）：

| 字段 | 可能的值 |
|---|---|
| `USERS.Role` | `Auditor`、`SELM`、`CourseOwner` |
| `COURSES.Type` | `Learning Plan`、`ILT`、`On-Demand`（以前叫 `E-Learning` 的，一律改成 `Learning Plan`） |
| `COURSES.Health` | `Pending Audit`、`Unhealthy`、`Healthy`、`Discontinued` |
| `COURSES.AuditStatus` | `Pending`（等 auditor）、`In Progress`（这一轮的 ticket 还没处理完）、`Completed` |
| `AUDITS.Result` | `Passed`、`Failed` |
| `AUDIT_ANSWERS.Answer` | `Yes`、`No`、`N/A` |
| `TICKETS.Category` | `Content`、`Edutube`、`Course Setup`、`Learning Plan Setup`、`Pricing`、`CD PDF`、`IT issue`、`Other` |
| `TICKETS.Status` | `New`、`Escalated`、`In Progress`、`Retest Failed`、`Pending Verification - Resolved`、`Pending Verification - Cancelled`、`Closed` |
| `TICKETS.ClosedAs` | `Resolved`、`Cancelled` |

课程列表上的 Pending audit / Unhealthy / Ready to revalidate / Healthy / Discontinued **不用另外存**，可以从 `Health`、`AuditStatus`、`LockedById` 和还没关的 ticket 算出来。

## 每张表的用途

| 表 | 存什么 | 对应 demo 的 |
|---|---|---|
| USERS | 用户和角色（Auditor / SELM / CourseOwner） | `USERS` 常数 |
| COURSES | 课程、Docebo pricing、目前状态、谁正在 audit、下架资料 | `S.courses` |
| COURSE_AUDIENCES | 课程的 catalog audience，可以多选（Partner、DSP、Customer、Tailored、TD），也可以一个都没有 | `course.audience` 字符串 |
| CRITERIA | 固定的 8 条 criteria（H–O），只有前三条 `AllowNA = true` | `CRITERIA` 常数 |
| AUDITS | 每一次 audit | `S.audits` |
| AUDIT_ANSWERS | 每次 audit 的每条 criteria 答案：Yes / No / N/A | `audit.checklist` 数组 |
| TICKETS | 每个 issue 一张 ticket | `S.tickets` |
| TICKET_NOTES | 处理 ticket 的人（SELM 或 Auditor）留的 note | `ticket.notes` 数组 |
| ACTIVITY_LOGS | 所有修改记录（谁、什么时候、做了什么） | `S.logs` |
| COURSE_LEARNING_PLANS | 课程属于哪些 learning plan，可以多个，也可以一个都没有 | `course.learningPlan` 字符串 |
| IMPORT_BATCHES | 每一次导入：文件名、类型、数量、谁导入、有没有撤销 | `S.imports` |

## 设计重点

1. **存用户 Id，不存名字。** demo 存的是名字，所以改名字时要写 `OLD_NAMES` 去替换旧数据。存 Id 的话，改名字只要改 `USERS` 的一行。
2. **多选和列表拆成另一张表。** audience 和 8 个答案在 demo 里是字符串或数组；在数据库里拆开，才能做统计，例如"哪条 criteria 最常是 No"。
3. **算得出来的不存。** demo 的 `auditCount`、`lastAudited`、`lastAuditor` 可以从 `AUDITS` 算出来，存了反而可能对不上。
4. **Criteria 是数据，不是代码。** 以后要加第 9 条，或改哪几条可以 N/A，只要改 `CRITERIA` 表。
5. **Ticket 的拥有者是 `EscalatedById`。** 只有拥有者可以更新这张 ticket，服务器端要检查这一点；拥有者请假时，其他 SELM 或 Auditor 用 take over 接手，变成新的拥有者。
6. **Pricing 用 `decimal(10,2)`，不用文字。** 文字可以输入任何东西（例如 `fdafasd`），也不能计算、比较或正确排序；金额也不要用 `float`，会有小数误差。空的（null）代表还没填。
7. **Audit 记下当时的 pricing 和 audience**（`PriceSnapshot`、`AudienceSnapshot`），这样课程之后被修改，旧的 audit 还看得到当时的值。
8. **AUDITS 只在提交时才写入。** 打开 audit 表单只是锁定课程（`LockedById`、`LockedAt`），中途放弃的话不会留下任何 audit 记录，课程状态也不变。
9. **下架的课程不删除。** `Health = Discontinued` 加上 `DiscontinuedAt / ById / Reason`，资料和历史都保留，可以 restore。只有从来没 audit 过的课程才真的删除（`DELETE`）。
10. **Criteria 改了要留下痕迹。** Auditor 用 Edit criteria 改答案时，`AUDIT_ANSWERS` 直接更新成新的答案，同时在 `ACTIVITY_LOGS` 写一笔 `Action = Criteria updated`、`AuditId` 指向那次 audit、`Detail` 写 "Launch URL works: No → Yes"。这样画面可以在那次 audit 下面列出修改记录，也能倒推出最原本的答案。
11. **Cancel 和 Discontinue 是不同层级。** Cancel 只关一张 ticket（`ClosedAs = Cancelled`）；Discontinue 是整门课下架。
12. **Team 页面的数字不另外存，用查询算。** 每个 auditor 的统计都从现有的表算出来：

    | 数字 | 怎么算 |
    |---|---|
    | Audits | `AUDITS` 里 `AuditorId` 是他、`IsReverification = false` 的行数 |
    | Courses audited | 同上，`CourseId` 不重复的数量 |
    | Issues raised | `TICKETS` 里 `CreatedById` 是他的数量（包括之后补开的） |
    | Fixes verified | `TICKETS` 里 `ClosedById` 是他、`ClosedAs = Resolved` 的行数；批准 Cancel、课程下架和 Self-approved 都不算；"This month" 用 `ClosedAt` 算 |
    | Audits per month | `AUDITS` 按 `AuditedAt` 的年月分组计数 |

    "This month" 只是多加一个条件：`AuditedAt >= 这个月 1 号`。EF Core 写起来大概是：

    ```csharp
    var monthStart = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
    var stats = await db.Audits
        .Where(a => !a.IsReverification && a.AuditedAt >= monthStart)
        .GroupBy(a => a.AuditorId)
        .Select(g => new { AuditorId = g.Key, Audits = g.Count(), Courses = g.Select(a => a.CourseId).Distinct().Count() })
        .ToListAsync();
    ```

    资料多了以后，在 `AUDITS (AuditorId, AuditedAt)` 和 `TICKETS (ClosedById, ClosedAs, ClosedAt)` 加 index，查询就会快。

## 导入课程

Courses 页的 Import 有两种，都用模板文件（`.xlsx` 或 `.csv`），先检查，确认后才写入。只要有一行不对，整个文件都不能导入，要改好再上传，所以不会只导入一半。不需要新表，Action 也沿用下面的值。

| | New courses | Existing courses |
|---|---|---|
| 谁可以用 | Auditor、Course Owner | 只有 Auditor，因为会写入 audit 结果 |
| 模板栏位 | Course Code、Course Name、Type | 前三栏，加 Course Status、Docebo Price、Audience、8 项 criteria、Audit Owner、Audit Date、Audit Note、Issue、Category，共 19 栏 |
| 导入后 | `Pending Audit`，等 audit 的 30 天从导入时算 | `Course Status = Discontinued` 就下架；否则有 `No` 是 `Unhealthy` 并开 `New` ticket；都不是就 `Healthy`，`AuditCount = 1` |

- 这些都算错误，会挡下整个文件，并逐项列出行号、课程、栏位、文件里的值和问题：系统里已有的 Course Code（包括 Discontinued）、文件里重复的 Course Code、资料不合规则的行。
- Existing 文件里同一个 Course Code 的后续行只能加 issue：其他栏位可以留空或和第一行相同；填了不同的值，就算 Course Code 重复，整个文件不能导入。这是模板唯一允许重复 Course Code 的情况，因为一门课有多个 issue。
- 同一门课里 Issue 和 Category 都相同的行只开一张 ticket，预览会提示。
- 课程名称相同（和系统里的或文件里的）只警告，还是可以导入，因为不同 Course Code 可能真的同名。有警告的课程排在预览最前面。
- Existing 模板一门课一行；多个 issue 就多加一行，写同一个 Course Code，只要填 Issue 和 Category。每个 issue 只有一个 Category。
- Existing 用的规则和 audit 表单一样：有 `No` 一定要有 issue，没有 `No` 就不能有 issue；没有 `No` 时 8 项都要答；`N/A` 只有前 3 项能用；有 `No` 时空白的存成 `Yes`。Audit Date 不能在未来。
- 导入的 ticket：`CreatedAt` 是 Audit Date，`SlaStartAt` 是导入当天，escalate 的 7 天从 `SlaStartAt` 算。手动开的 ticket `SlaStartAt` 是空的，从 `CreatedAt` 算。
- `Course Status = Discontinued`：不检查 criteria，空白的存成 `N/A`，也不能有 Issue（要写在 Audit Note）；原因必填，写在 Audit Note，存进 `DiscontinueReason`。Audit 记录照样保留，也可以 restore。
- Audit Note 存在那次 audit 的备注里，不开 ticket。
- 所有价格都是 USD，不存币种。旧文件如果有 `Currency` 栏，填了 USD 以外的值就算错误。
- `E-Learning` 导入时改成 `Learning Plan`。
- Audit Date：Excel 的日期格式可以；文字只接受 `YYYY-MM-DD`，因为 `03/10/2026` 分不出哪个是月。
- Course Code 比较和保存前都要清理：去掉隐藏字符，全角字符和各种破折号转成一般字符，多个空格合并成一个，头尾空格去掉；比较时不分大小写。Add course、编辑课程和导入都一样。
- 撤销导入：可以整批撤销，只有 Auditor 或导入的人能做，导入的课程、audit、ticket 和记录全部删除，`IMPORT_BATCHES` 记下 `UndoneById` 和 `UndoneAt`。只要其中一门课导入后有人动过（有 `ImportBatchId` 为空的 `ACTIVITY_LOGS`，或正在 audit），整批都不能撤销。
- 每门课写一行 `Course registered`，`Detail` 记文件名；Existing 再用 Audit Owner 和 Audit Date 写 `Audit passed` 或 `Audit failed`。

## ACTIVITY_LOGS.Action 的值

| 对象 | Action |
|---|---|
| 课程 | `Course registered`、`Course discontinued`、`Course restored`、`Pricing updated`、`Audience updated`、`Course info updated` |
| Audit | `Audit passed`、`Audit failed`、`Criteria updated`、`Re-verification approved`、`Closed with cancelled tickets` |
| Ticket（Auditor） | `Ticket created`、`Added after audit`、`Edited by auditor`、`Ticket removed`、`Ticket closed`、`Retest failed`、`Cancellation rejected` |
| Ticket（SELM 或 Auditor） | `Escalated`、`Escalation undone`、`Fix date set`、`Fix date changed`、`Status → In Progress`、`Note added`、`Marked resolved`、`Proposed cancellation`、`Taken back`、`Taken over` |

## 规则（服务器端要检查）

- `AUDIT_ANSWERS.Answer` 只能是 `Yes`、`No`、`N/A`；`N/A` 只在 `CRITERIA.AllowNA = true` 时允许。
- 有任何 `No` 就一定要开至少一张 ticket。
- 有 `No` 时，Auditor 没选的 criteria 一律存成 `Yes`，所以每次 audit 在 `AUDIT_ANSWERS` 永远是完整的 8 行；一个 `No` 都没有（全部通过）时，8 条都要明确选过才能提交。
- Part of learning plan 是选填：audit 表单勾选后至少要填一个 Course Code，多个用逗号隔开，重复的只算一个（不分大小写，保留第一个写法），只是换顺序不算改动，不能有这门课自己的 Code。提交成功才写入 `COURSE_LEARNING_PLANS`，并存进 `AUDITS.LearningPlanSnapshot`。这些 Code 不用已经在系统里，因为 learning plan 不一定已经加入 masterlist。没有勾选就存成空的；re-audit 只改这一项也可以提交。
- Catalog audience 是选填：audit 表单和课程页都可以一个都不选，`COURSE_AUDIENCES` 就没有这门课的行，`AudienceSnapshot` 是空的。
- Audit 提交成功才写入课程的 `DoceboPrice` 和 `COURSE_AUDIENCES`；验证失败或取消都不改课程。
- 还有 ticket 没关时，这次 audit 至少要留一个 `No`。
- 全部 ticket 都修好（`ClosedAs = Resolved`）后，自动建一次 re-verification audit（`IsReverification = true`），答案全部是 `Yes`，原本 `N/A` 的保持 `N/A`。它只确认修好的问题，所以 Last audited 不算它，只算最新一次 `IsReverification = false` 的 audit，也包括 Failed。
- 课程等 audit 是 30 天：停在 Pending audit 超过 30 天就算超时。从课程新增或 restore（`COURSES.CreatedAt` 或 `ACTIVITY_LOGS` 里最新的 `Course registered`、`Course restored`）开始算，不用新字段。
- Ticket 的 SLA 有两段，都是 7 天：`Status = New` 且 `SlaStartAt`（空的话用 `CreatedAt`）超过 7 天（还没 escalate）；`Status` 是 `Escalated` 或 `Retest Failed`、`FixDate` 是空的、而且 `EscalatedAt` 超过 7 天（还没填 fix date）。这两种在 Dashboard 分开计数、分开提醒。
- 一门课同一时间只能有一个人 audit（`LockedById`）；中途离开或取消就放弃这次 audit、解除锁定，不留记录；锁太久没提交（例如超过一天）也要自动解除。
- 这一轮还有 open ticket 时，Auditor 可以补开 ticket：`AuditId` 是这一轮的 audit，`CreatedById` 是补开的人，`ACTIVITY_LOGS` 记 `Added after audit`。
- Ticket 还是 `New`（还没有人 escalate）时，Auditor 可以改 Category 和 Detail（记 `Edited by auditor`），或直接删除；删除会在 `ACTIVITY_LOGS` 留一笔 `Ticket removed`，`AuditId` 指向那一轮。这一轮最后一张 open ticket 不能删。
- 所有动作都要在服务器端、用**当下**的状态再检查一次（例如 `DELETE ... WHERE Status = 'New'`，或 EF Core 的 `RowVersion`），避免画面是旧的、别人刚好已经改了状态。
- 只有 Auditor 可以 re-audit，按下后直接打开 8 项 criteria；Course Owner 不能排入 re-audit。
- Re-audit 时课程保持 `Healthy`，直到提交结果；答案全部没变也可以提交，先确认一次，会留下一笔 Passed 记录并更新 Last audited；这是半年复查最常见的结果。不想留记录就用 Cancel audit。有 `No` 提交后变成 `Unhealthy`，只改成 N/A 的话保持 `Healthy`。
- SELM 和 Auditor 都可以 escalate ticket。只有 escalate 的人（`EscalatedById`）可以更新、Resolve 或 Cancel 那张 ticket；只有 Auditor 可以 Approve 或 Reject。
- Auditor 可以批准自己处理的 ticket。`ClosedById = EscalatedById` 就是 Self-approved，页面上有标记，Status report 分开计数，也不算进 Team 页的 Fixes verified。不用新字段。
- Pricing 和 Audience 每次修改都要在 `ACTIVITY_LOGS` 记一笔（`Pricing updated` / `Audience updated`，`Detail` 写 `旧值 → 新值`），`AuditId` 指向这一轮的 audit，画面上显示在那一轮 audit 的修改记录里。
- 按错 escalate 可以 undo：只限 escalate 的同一个人，而且还是 `Escalated`、`FixDate` 是空的；填了 `FixDate` 就不能 undo。次数不限。Undo 后 `Status` 回到 `New`，`EscalatedById` 清空，`EscalatedAt` **保留**；之后再 escalate 继续用原本的 `EscalatedAt`，所以 SLA 不会重新算。
- 拥有者请假（AL / MC）时，其他 SELM 或 Auditor 可以 take over 还在处理中（`Escalated`、`In Progress`、`Retest Failed`）的 ticket：`EscalatedById` 换成接手的人，`EscalatedAt` 和 `FixDate` 不变（SLA 照算），`ACTIVITY_LOGS` 记 `Taken over`，`Detail` 写原本的人。
- 拥有者送出 Resolved 或 Cancel 后，在 Auditor 审核前可以 take back：`Status` 回到 `In Progress`（没有 `FixDate` 就回到 `Escalated`），`Justification` 清空，`ACTIVITY_LOGS` 记 `Taken back`。
- 新的 `FixDate` 不能早于今天。送出 Resolved 前一定要有 `FixDate`；Cancel 不用。
- Ticket 填了 `FixDate` 就从 `Escalated` 变成 `In Progress`。
- 第一次填 `FixDate` 不用写 note，同时存进 `FirstFixDate`（之后不再改）。填了之后不能清空，只能改成新日期。
- 改 `FixDate` 一定要写 note，原因存进 `TICKET_NOTES`，`ACTIVITY_LOGS` 记 `Fix date changed`；改了几次就数这个 Action 的行数。
- 改 `FixDate` 不限次数，也不用批准；次数和原因都显示出来，让大家知道。
- Audit 数字：课程页、Status report 和 Team 页都只算 `IsReverification = false` 的 audit，所以数字一致。Re-verification 还是留在 Audit history，但不编号。修好的数量看 `Ticket closed`。
- 这一轮只要有 ticket 是 `ClosedAs = Cancelled`，全部关闭后课程还是变 `Healthy`，但不建 re-verification audit，答案保持原样，`ACTIVITY_LOGS` 记 `Closed with cancelled tickets`，画面显示取消的数量，直到下一次完整 audit。
- 长度和金额上限：Course Code 和 Learning Plan Code 最多 50 个字符，Course Name 最多 200 个字符，Docebo Price 是 0 到 99,999,999.99。Add course、编辑课程、audit 和导入都一样。导入的 Audience 重复写只算一个。
- Last audited 和 180 天：都用最新一次 `IsReverification = false` 的 `AUDITS.AuditedAt` 算，不用存。超过 180 天（第 180 天当天不算）可以用 `Over 180 days ago` 筛选；只有 `Healthy` 的课程会变琥珀色。这个不改变课程状态，也不开 ticket，要 Auditor 自己筛选后做 re-audit。
- Dashboard 有 Needs attention 表，把超时的项目放在一起，最久的排最前面：等 audit 超过 30 天、没 escalate 超过 7 天、没 fix date 超过 7 天、ETA missed。每行显示课程、ticket、负责人和超时天数，可以按类型筛选。都用查询算，不用新字段。
- Dashboard 有 Fix date changes 表：列出还没关、改过 `FixDate` 的 ticket，显示次数、`FirstFixDate`、现在的 `FixDate` 和最近一次的原因（最近一次 `Fix date changed` 之后的那笔 `Note added`）。都用查询算，不用新字段。
- ETA missed：`Status` 是 `In Progress` 或 `Retest Failed`，而且今天已经过了 `FixDate`。不用存，查询时算，Dashboard 和 ticket 上都要显示。
- Cancel ticket 一定要写原因（存在 `Justification`），Auditor 确认后 `ClosedAs = Cancelled`，课程不会下架。
- 改课程的 `Code`、`Name`、`Type`：只有 Course Owner，课程不能是 `Discontinued`；`Code` 还是不能重复（包括已下架的课程）。`ACTIVITY_LOGS` 记 `Course info updated`，`Detail` 写旧值和新值。
- Discontinue 课程：只有 Auditor 或 Course Owner 可以做，一定要写原因；有人正在 audit（`LockedById`）时要先提醒，确认后那次 audit 作废；还没关的 ticket 全部变成 `Closed`、`ClosedAs = Cancelled`。
- Restore 课程：只有 Auditor；课程直接变回 `Pending Audit`、`AuditStatus = Pending`，等新的 audit。如果有还在使用的课程 `Code` 相同，或 `Name` 相同（不分大小写、忽略多余空格），先提示 Auditor，确认后才可以强制 restore，并在 `ACTIVITY_LOGS` 的 `Detail` 写明相同的课程。
- Delete 课程：只有在这门课**没有任何 audit 和 ticket** 时才允许。
- Pricing 和 Audience：在 audit 表单里填；之后只有课程是 `Unhealthy`（ticket 处理中）时，Auditor 或 SELM 才能在课程页直接改，`Pending Audit`、`Healthy`、`Discontinued` 和 audit 进行中都不能改（Healthy 的课程要改，就在 re-audit 表单里改，提交后才写入，只改这两项也可以提交）；每次修改都写进 `ACTIVITY_LOGS`。

## 只有 demo 才有的部分

这些不用放进数据库：

- **登录：** demo 只选账号，没有密码。真网站要先确认是不是用公司的 SSO；用 SSO 的话 `USERS` 不用存密码，不用的话要加 ASP.NET Core Identity 的表。
- **Clear all data 和 Add samples：** 只给 demo 用，真网站不要有这两个功能。
- **分页同步：** demo 的资料存在浏览器，靠 `storage` 事件同步分页。真网站由服务器保存，`LockedById` 要在服务器端检查，才能避免两个人同时 audit 同一门课。
