# Database schema

Course Audit Central 以后变成真网站时的数据库设计。现在的 demo 把数据存在浏览器的 localStorage（`courses`、`audits`、`tickets`、`logs`），真网站会把它们拆成下面 9 张表。

## ER 图

```mermaid
erDiagram
  COURSES ||--o{ COURSE_AUDIENCES : has
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
| TICKET_NOTES | SELM 在 ticket 上留的 note | `ticket.notes` 数组 |
| ACTIVITY_LOGS | 所有修改记录（谁、什么时候、做了什么） | `S.logs` |

## 设计重点

1. **存用户 Id，不存名字。** demo 存的是名字，所以改名字时要写 `OLD_NAMES` 去替换旧数据。存 Id 的话，改名字只要改 `USERS` 的一行。
2. **多选和列表拆成另一张表。** audience 和 8 个答案在 demo 里是字符串或数组；在数据库里拆开，才能做统计，例如"哪条 criteria 最常是 No"。
3. **算得出来的不存。** demo 的 `auditCount`、`lastAudited`、`lastAuditor` 可以从 `AUDITS` 算出来，存了反而可能对不上。
4. **Criteria 是数据，不是代码。** 以后要加第 9 条，或改哪几条可以 N/A，只要改 `CRITERIA` 表。
5. **Ticket 的拥有者是 `EscalatedById`。** 只有拥有者可以更新这张 ticket，服务器端要检查这一点；拥有者请假时，别的 SELM 用 take over 接手，变成新的拥有者。
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
    | Fixes verified | `ACTIVITY_LOGS` 里 `ActorId` 是他、`Action = Ticket closed` 的行数 |
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

    资料多了以后，在 `AUDITS (AuditorId, AuditedAt)` 和 `ACTIVITY_LOGS (ActorId, Action, CreatedAt)` 加 index，查询就会快。

## ACTIVITY_LOGS.Action 的值

| 对象 | Action |
|---|---|
| 课程 | `Course registered`、`Course discontinued`、`Course restored`、`Re-audit queued`、`Pricing updated`、`Audience updated`、`Course info updated` |
| Audit | `Audit passed`、`Audit failed`、`Criteria updated`、`Re-verification approved` |
| Ticket（Auditor） | `Ticket created`、`Added after audit`、`Edited by auditor`、`Ticket removed`、`Ticket closed`、`Retest failed`、`Cancellation rejected` |
| Ticket（SELM） | `Escalated`、`Escalation undone`、`Fix date set`、`Fix date changed`、`Status → In Progress`、`Note added`、`Marked resolved`、`Proposed cancellation`、`Taken back`、`Taken over` |

## 规则（服务器端要检查）

- `AUDIT_ANSWERS.Answer` 只能是 `Yes`、`No`、`N/A`；`N/A` 只在 `CRITERIA.AllowNA = true` 时允许。
- 有任何 `No` 就一定要开至少一张 ticket。
- 有 `No` 时，Auditor 没选的 criteria 一律存成 `Yes`，所以每次 audit 在 `AUDIT_ANSWERS` 永远是完整的 8 行；一个 `No` 都没有（全部通过）时，8 条都要明确选过才能提交。
- Catalog audience 是选填：audit 表单和课程页都可以一个都不选，`COURSE_AUDIENCES` 就没有这门课的行，`AudienceSnapshot` 是空的。
- 还有 ticket 没关时，这次 audit 至少要留一个 `No`。
- 全部 ticket 关闭后，自动建一次 re-verification audit（`IsReverification = true`），答案全部是 `Yes`，原本 `N/A` 的保持 `N/A`。
- 课程等 audit 也是 7 天：停在 Pending audit 超过 7 天就算超时。从课程新增、restore 或排入 re-audit（`COURSES.CreatedAt` 或 `ACTIVITY_LOGS` 里最新的 `Course registered`、`Course restored`、`Re-audit queued`）开始算，不用新字段。
- Ticket 的 SLA 有两段，都是 7 天：`Status = New` 且 `CreatedAt` 超过 7 天（还没 escalate）；`Status` 是 `Escalated` 或 `Retest Failed`、`FixDate` 是空的、而且 `EscalatedAt` 超过 7 天（还没填 fix date）。这两种在 Dashboard 分开计数、分开提醒。
- 一门课同一时间只能有一个人 audit（`LockedById`）；中途离开或取消就放弃这次 audit、解除锁定，不留记录；锁太久没提交（例如超过一天）也要自动解除。
- 这一轮还有 open ticket 时，Auditor 可以补开 ticket：`AuditId` 是这一轮的 audit，`CreatedById` 是补开的人，`ACTIVITY_LOGS` 记 `Added after audit`。
- Ticket 还是 `New`（SELM 还没 escalate）时，Auditor 可以改 Category 和 Detail（记 `Edited by auditor`），或直接删除；删除会在 `ACTIVITY_LOGS` 留一笔 `Ticket removed`，`AuditId` 指向那一轮。这一轮最后一张 open ticket 不能删。
- 所有动作都要在服务器端、用**当下**的状态再检查一次（例如 `DELETE ... WHERE Status = 'New'`，或 EF Core 的 `RowVersion`），避免画面是旧的、别人刚好已经改了状态。
- Re-audit 时课程保持 `Healthy`，直到提交结果；re-audit 要有 `No`，或有答案改变（例如 Yes → N/A）才能提交；完全没变就取消，不留记录。有 `No` 提交后变成 `Unhealthy`，只改成 N/A 的话保持 `Healthy`。
- 只有 escalate 的 SELM（`EscalatedById`）可以更新、Resolve 或 Cancel 那张 ticket；只有 Auditor 可以 Approve 或 Reject。
- Pricing 和 Audience 每次修改都要在 `ACTIVITY_LOGS` 记一笔（`Pricing updated` / `Audience updated`，`Detail` 写 `旧值 → 新值`），`AuditId` 指向这一轮的 audit，画面上显示在那一轮 audit 的修改记录里。
- 按错 escalate 可以 undo：只限同一个 SELM，而且还是 `Escalated`、`FixDate` 是空的；填了 `FixDate` 就不能 undo。次数不限。Undo 后 `Status` 回到 `New`，`EscalatedById` 清空，`EscalatedAt` **保留**；之后再 escalate 继续用原本的 `EscalatedAt`，所以 SLA 不会重新算。
- SELM 请假（AL / MC）时，别的 SELM 可以 take over 还在处理中（`Escalated`、`In Progress`、`Retest Failed`）的 ticket：`EscalatedById` 换成接手的人，`EscalatedAt` 和 `FixDate` 不变（SLA 照算），`ACTIVITY_LOGS` 记 `Taken over`，`Detail` 写原本的人。
- SELM 送出 Resolved 或 Cancel 后，在 Auditor 审核前可以 take back：`Status` 回到 `In Progress`（没有 `FixDate` 就回到 `Escalated`），`Justification` 清空，`ACTIVITY_LOGS` 记 `Taken back`。
- 新的 `FixDate` 不能早于今天。送出 Resolved 前一定要有 `FixDate`；Cancel 不用。
- Ticket 填了 `FixDate` 就从 `Escalated` 变成 `In Progress`。
- 第一次填 `FixDate` 不用写 note，同时存进 `FirstFixDate`（之后不再改）。填了之后不能清空，只能改成新日期。
- 改 `FixDate` 一定要写 note，原因存进 `TICKET_NOTES`，`ACTIVITY_LOGS` 记 `Fix date changed`；改了几次就数这个 Action 的行数。
- 改 `FixDate` 不限次数，也不用批准；次数和原因都显示出来，让大家知道。
- Dashboard 有 Fix date changes 表：列出还没关、改过 `FixDate` 的 ticket，显示次数、`FirstFixDate`、现在的 `FixDate` 和最近一次的原因（最近一次 `Fix date changed` 之后的那笔 `Note added`）。都用查询算，不用新字段。
- ETA missed：`Status` 是 `In Progress` 或 `Retest Failed`，而且今天已经过了 `FixDate`。不用存，查询时算，Dashboard 和 ticket 上都要显示。
- Cancel ticket 一定要写原因（存在 `Justification`），Auditor 确认后 `ClosedAs = Cancelled`，课程不会下架。
- 改课程的 `Code`、`Name`、`Type`：只有 Course Owner，课程不能是 `Discontinued`；`Code` 还是不能重复（包括已下架的课程）。`ACTIVITY_LOGS` 记 `Course info updated`，`Detail` 写旧值和新值。
- Discontinue 课程：只有 Auditor 或 Course Owner 可以做，一定要写原因；有人正在 audit（`LockedById`）时要先提醒，确认后那次 audit 作废；还没关的 ticket 全部变成 `Closed`、`ClosedAs = Cancelled`。
- Restore 课程：只有 Auditor；课程直接变回 `Pending Audit`、`AuditStatus = Pending`，等新的 audit。如果有还在使用的课程 `Code` 相同，或 `Name` 相同（不分大小写、忽略多余空格），先提示 Auditor，确认后才可以强制 restore，并在 `ACTIVITY_LOGS` 的 `Detail` 写明相同的课程。
- Delete 课程：只有在这门课**没有任何 audit 和 ticket** 时才允许。
- Pricing 和 Audience：在 audit 表单里填；之后只有课程是 `Unhealthy`（ticket 处理中）时，Auditor 或 SELM 才能在课程页直接改，`Pending Audit`、`Healthy`、`Discontinued` 和 audit 进行中都不能改（re-audit 也不能改；Healthy 的课程要先 re-audit 标出 No、变成 Unhealthy 后才能改）；每次修改都写进 `ACTIVITY_LOGS`。
