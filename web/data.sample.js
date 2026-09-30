/* 演示数据集，由 tools/build-sample.mjs 生成。重建：node tools/build-sample.mjs */
window.DASHBOARD_DATA_SAMPLE = {
  "generatedAt": "2026-09-29T08:48:05.385Z",
  "sample": true,
  "assets": {
    "hero": {
      "averageColor": "#1e1735",
      "luminance": 0.1045,
      "tone": "dark",
      "suggestedInk": "#fdf7f4",
      "file": "assets/hero.jpg",
      "placeholder": true,
      "width": 1800,
      "height": 563,
      "bytes": 10248
    },
    "cardBuild": {
      "averageColor": "#5c3526",
      "luminance": 0.2361,
      "tone": "dark",
      "suggestedInk": "#fdf7f4",
      "file": "assets/card-build.jpg",
      "placeholder": true,
      "width": 960,
      "height": 540,
      "bytes": 6664
    },
    "cardLearn": {
      "averageColor": "#434a3e",
      "luminance": 0.281,
      "tone": "dark",
      "suggestedInk": "#fdf7f4",
      "file": "assets/card-learn.jpg",
      "placeholder": true,
      "width": 960,
      "height": 540,
      "bytes": 7000
    },
    "cardGrow": {
      "averageColor": "#172435",
      "luminance": 0.1352,
      "tone": "dark",
      "suggestedInk": "#fdf7f4",
      "file": "assets/card-grow.jpg",
      "placeholder": true,
      "width": 960,
      "height": 540,
      "bytes": 5977
    }
  },
  "vaultName": "演示知识库（演示数据）",
  "today": "2026-09-29",
  "settings": {
    "dailyCapacityMinutes": 120,
    "planningHorizonDays": 7,
    "folders": {
      "project": "20 项目库",
      "task": "50 日程待办",
      "inbox": "00 草稿箱",
      "knowledge": "30 知识库",
      "book": "30 知识库/图书库",
      "area": "10 长期领域",
      "people": "40 人物库",
      "archive": "90 归档库",
      "asset": "图片素材"
    }
  },
  "stats": {
    "activeProjects": 3,
    "projects": 4,
    "tasks": 23,
    "activeTasks": 23,
    "overdue": 1,
    "upcoming": 12,
    "inbox": 3,
    "gaps": 3,
    "knowledge": 10,
    "people": 3,
    "areas": 6,
    "capacityMinutes": 120
  },
  "projects": [
    {
      "path": "20 项目库/个人网站上线/个人网站上线.md",
      "name": "个人网站上线",
      "title": "个人网站上线",
      "frontmatter": {
        "type": "project",
        "title": "个人网站上线",
        "status": "active",
        "deadline": "2026-10-17",
        "area": "事业",
        "weight": 5,
        "milestones": [
          "未分组",
          "完成 MVP",
          "上线验收"
        ]
      },
      "summary": "公开可访问的个人主页，能承接作品与联系方式",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "active",
      "statusLabel": "进行中",
      "progress": 0,
      "done": 0,
      "total": 7,
      "deadline": "2026-10-17",
      "daysLeft": 18,
      "outcome": "公开可访问的个人主页，能承接作品与联系方式",
      "acceptance": "首页 / 作品页 / 联系页可访问，移动端可用，Lighthouse 性能 ≥ 90",
      "area": "事业",
      "weight": 5,
      "constraints": "预算 0 元，只用静态托管",
      "milestones": [
        "未分组",
        "完成 MVP",
        "上线验收"
      ],
      "blockers": [],
      "taskPaths": [
        "20 项目库/个人网站上线/完成首页文案.md",
        "20 项目库/个人网站上线/设计首页信息结构.md",
        "20 项目库/个人网站上线/搭好静态托管与域名.md",
        "20 项目库/个人网站上线/整理作品集素材.md",
        "20 项目库/个人网站上线/上线前全站走查.md",
        "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md",
        "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md"
      ]
    },
    {
      "path": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "name": "年度体检与体能计划",
      "title": "年度体检与体能计划",
      "frontmatter": {
        "type": "project",
        "title": "年度体检与体能计划",
        "status": "active",
        "deadline": "2026-11-14",
        "area": "健康",
        "weight": 4,
        "milestones": [
          "未分组",
          "体检预约",
          "建立习惯"
        ]
      },
      "summary": "体检指标回到正常区间，每周稳定运动 3 次",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "active",
      "statusLabel": "进行中",
      "progress": 0,
      "done": 0,
      "total": 6,
      "deadline": "2026-11-14",
      "daysLeft": 46,
      "outcome": "体检指标回到正常区间，每周稳定运动 3 次",
      "acceptance": "连续 8 周每周运动 ≥ 3 次；体检复查指标达标",
      "area": "健康",
      "weight": 4,
      "constraints": "每周可投入 4 小时",
      "milestones": [
        "未分组",
        "体检预约",
        "建立习惯"
      ],
      "blockers": [
        "周三加班与健身房时间冲突"
      ],
      "taskPaths": [
        "20 项目库/年度体检与体能计划/预约体检并确认项目.md",
        "20 项目库/年度体检与体能计划/确认体检前注意事项.md",
        "20 项目库/年度体检与体能计划/本周三次力量训练.md",
        "20 项目库/年度体检与体能计划/记录一周饮食与睡眠.md",
        "20 项目库/年度体检与体能计划/复盘近期体能与体重变化.md",
        "20 项目库/年度体检与体能计划/掌握体能训练的动作标准.md"
      ]
    },
    {
      "path": "20 项目库/知识库体系升级/知识库体系升级.md",
      "name": "知识库体系升级",
      "title": "知识库体系升级",
      "frontmatter": {
        "type": "project",
        "title": "知识库体系升级",
        "status": "active",
        "deadline": "2026-09-26",
        "area": "知识管理",
        "weight": 3,
        "milestones": [
          "未分组",
          "分类规范"
        ]
      },
      "summary": "知识库有清晰的分类与引用规范，能被项目直接复用",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "expired",
      "statusLabel": "过期",
      "progress": 0,
      "done": 0,
      "total": 4,
      "deadline": "2026-09-26",
      "daysLeft": -3,
      "outcome": "知识库有清晰的分类与引用规范，能被项目直接复用",
      "acceptance": "每个长期领域都有索引页；项目任务能引用到知识笔记",
      "area": "知识管理",
      "weight": 3,
      "constraints": "每晚 30 分钟",
      "milestones": [
        "未分组",
        "分类规范"
      ],
      "blockers": [
        "分类维度还没想清楚",
        "旧笔记太多，迁移成本高"
      ],
      "taskPaths": [
        "20 项目库/知识库体系升级/写知识库分类规范初稿.md",
        "20 项目库/知识库体系升级/迁移旧笔记到新分类.md",
        "20 项目库/知识库体系升级/为长期领域建索引页.md",
        "20 项目库/知识库体系升级/给每个项目补验收标准.md"
      ]
    },
    {
      "path": "20 项目库/副业收入实验/副业收入实验.md",
      "name": "副业收入实验",
      "title": "副业收入实验",
      "frontmatter": {
        "type": "project",
        "title": "副业收入实验",
        "status": "planning",
        "deadline": "",
        "area": "财富",
        "weight": 2,
        "milestones": [
          "未分组",
          "选方向"
        ]
      },
      "summary": "验证一个能带来第一笔外部收入的路径",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "planning",
      "statusLabel": "规划中",
      "progress": 0,
      "done": 0,
      "total": 2,
      "deadline": null,
      "daysLeft": null,
      "outcome": "验证一个能带来第一笔外部收入的路径",
      "acceptance": "完成 3 次小规模尝试，其中 1 次产生收入",
      "area": "财富",
      "weight": 2,
      "constraints": "启动资金 ≤ 500 元",
      "milestones": [
        "未分组",
        "选方向"
      ],
      "blockers": [],
      "taskPaths": [
        "20 项目库/副业收入实验/调研三个可行的副业方向.md",
        "20 项目库/副业收入实验/访谈一位在做同类副业的朋友.md"
      ]
    }
  ],
  "tasks": [
    {
      "path": "20 项目库/个人网站上线/完成首页文案.md",
      "name": "完成首页文案",
      "title": "完成首页文案",
      "frontmatter": {
        "type": "task",
        "title": "完成首页文案",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "完成 MVP",
        "due": "2026-10-01",
        "duration": 90,
        "priority": "high",
        "task_set": "本周维护",
        "task_group": "内容产出",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": [
          "写作模板"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 2,
        "open": 1,
        "total": 3
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "完成 MVP",
      "taskSet": "本周维护",
      "taskGroup": "内容产出",
      "due": "2026-10-01",
      "daysLeft": 2,
      "duration": 90,
      "priority": "high",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [
        "写作模板"
      ],
      "type": "task",
      "suggestion": false,
      "index": 0
    },
    {
      "path": "20 项目库/个人网站上线/设计首页信息结构.md",
      "name": "设计首页信息结构",
      "title": "设计首页信息结构",
      "frontmatter": {
        "type": "task",
        "title": "设计首页信息结构",
        "status": "doing",
        "project": "个人网站上线",
        "milestone": "完成 MVP",
        "due": "2026-09-30",
        "duration": 60,
        "priority": "high",
        "task_set": "本周维护",
        "task_group": "内容产出",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 1,
        "total": 2
      },
      "status": "doing",
      "statusLabel": "执行中",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "完成 MVP",
      "taskSet": "本周维护",
      "taskGroup": "内容产出",
      "due": "2026-09-30",
      "daysLeft": 1,
      "duration": 60,
      "priority": "high",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 1
    },
    {
      "path": "20 项目库/个人网站上线/搭好静态托管与域名.md",
      "name": "搭好静态托管与域名",
      "title": "搭好静态托管与域名",
      "frontmatter": {
        "type": "task",
        "title": "搭好静态托管与域名",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "完成 MVP",
        "due": "2026-10-04",
        "duration": 45,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "工程实现",
        "assignee": "同事",
        "recurrence": "none",
        "knowledge_refs": [
          "部署清单"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 2,
        "total": 2
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "完成 MVP",
      "taskSet": "本周维护",
      "taskGroup": "工程实现",
      "due": "2026-10-04",
      "daysLeft": 5,
      "duration": 45,
      "priority": "medium",
      "assignee": "同事",
      "recurrence": "none",
      "knowledgeRefs": [
        "部署清单"
      ],
      "type": "task",
      "suggestion": false,
      "index": 2
    },
    {
      "path": "20 项目库/个人网站上线/整理作品集素材.md",
      "name": "整理作品集素材",
      "title": "整理作品集素材",
      "frontmatter": {
        "type": "task",
        "title": "整理作品集素材",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "未分组",
        "due": "2026-10-08",
        "duration": 120,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "素材整理",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 3,
        "total": 4
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "未分组",
      "taskSet": "本周维护",
      "taskGroup": "素材整理",
      "due": "2026-10-08",
      "daysLeft": 9,
      "duration": 120,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 3
    },
    {
      "path": "20 项目库/个人网站上线/上线前全站走查.md",
      "name": "上线前全站走查",
      "title": "上线前全站走查",
      "frontmatter": {
        "type": "task",
        "title": "上线前全站走查",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "上线验收",
        "due": "2026-10-15",
        "duration": 60,
        "priority": "low",
        "task_set": "深度工作",
        "task_group": "验收",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 3,
        "total": 3
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "上线验收",
      "taskSet": "深度工作",
      "taskGroup": "验收",
      "due": "2026-10-15",
      "daysLeft": 16,
      "duration": 60,
      "priority": "low",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 4
    },
    {
      "path": "20 项目库/年度体检与体能计划/预约体检并确认项目.md",
      "name": "预约体检并确认项目",
      "title": "预约体检并确认项目",
      "frontmatter": {
        "type": "task",
        "title": "预约体检并确认项目",
        "status": "todo",
        "project": "年度体检与体能计划",
        "milestone": "体检预约",
        "due": "2026-10-02",
        "duration": 30,
        "priority": "high",
        "task_set": "本周维护",
        "task_group": "生活事务",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 0,
        "total": 1
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "体检预约",
      "taskSet": "本周维护",
      "taskGroup": "生活事务",
      "due": "2026-10-02",
      "daysLeft": 3,
      "duration": 30,
      "priority": "high",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 5
    },
    {
      "path": "20 项目库/年度体检与体能计划/确认体检前注意事项.md",
      "name": "确认体检前注意事项",
      "title": "确认体检前注意事项",
      "frontmatter": {
        "type": "task",
        "title": "确认体检前注意事项",
        "status": "blocked",
        "project": "年度体检与体能计划",
        "milestone": "体检预约",
        "due": "2026-10-03",
        "duration": 20,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "生活事务",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 1,
        "total": 1
      },
      "status": "blocked",
      "statusLabel": "阻塞",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "体检预约",
      "taskSet": "本周维护",
      "taskGroup": "生活事务",
      "due": "2026-10-03",
      "daysLeft": 4,
      "duration": 20,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 6
    },
    {
      "path": "20 项目库/年度体检与体能计划/本周三次力量训练.md",
      "name": "本周三次力量训练",
      "title": "本周三次力量训练",
      "frontmatter": {
        "type": "task",
        "title": "本周三次力量训练",
        "status": "doing",
        "project": "年度体检与体能计划",
        "milestone": "建立习惯",
        "due": "2026-10-05",
        "duration": 180,
        "priority": "medium",
        "task_set": "生活管理",
        "task_group": "运动",
        "assignee": "自己",
        "recurrence": "weekly",
        "knowledge_refs": [
          "训练计划"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "doing",
      "statusLabel": "执行中",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "建立习惯",
      "taskSet": "生活管理",
      "taskGroup": "运动",
      "due": "2026-10-05",
      "daysLeft": 6,
      "duration": 180,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "weekly",
      "knowledgeRefs": [
        "训练计划"
      ],
      "type": "task",
      "suggestion": false,
      "index": 7
    },
    {
      "path": "20 项目库/年度体检与体能计划/记录一周饮食与睡眠.md",
      "name": "记录一周饮食与睡眠",
      "title": "记录一周饮食与睡眠",
      "frontmatter": {
        "type": "task",
        "title": "记录一周饮食与睡眠",
        "status": "todo",
        "project": "年度体检与体能计划",
        "milestone": "建立习惯",
        "due": "2026-09-29",
        "duration": 25,
        "priority": "low",
        "task_set": "生活管理",
        "task_group": "记录",
        "assignee": "",
        "recurrence": "daily",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 2,
        "open": 0,
        "total": 2
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "建立习惯",
      "taskSet": "生活管理",
      "taskGroup": "记录",
      "due": "2026-09-29",
      "daysLeft": 0,
      "duration": 25,
      "priority": "low",
      "assignee": "",
      "recurrence": "daily",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 8
    },
    {
      "path": "20 项目库/年度体检与体能计划/复盘近期体能与体重变化.md",
      "name": "复盘近期体能与体重变化",
      "title": "复盘近期体能与体重变化",
      "frontmatter": {
        "type": "task",
        "title": "复盘近期体能与体重变化",
        "status": "paused",
        "project": "年度体检与体能计划",
        "milestone": "未分组",
        "due": "2026-10-21",
        "duration": 40,
        "priority": "medium",
        "task_set": "生活管理",
        "task_group": "复盘",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 1,
        "total": 1
      },
      "status": "paused",
      "statusLabel": "暂停",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "未分组",
      "taskSet": "生活管理",
      "taskGroup": "复盘",
      "due": "2026-10-21",
      "daysLeft": 22,
      "duration": 40,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 9
    },
    {
      "path": "20 项目库/知识库体系升级/写知识库分类规范初稿.md",
      "name": "写知识库分类规范初稿",
      "title": "写知识库分类规范初稿",
      "frontmatter": {
        "type": "task",
        "title": "写知识库分类规范初稿",
        "status": "doing",
        "project": "知识库体系升级",
        "milestone": "分类规范",
        "due": "2026-09-28",
        "duration": 75,
        "priority": "high",
        "task_set": "本周维护",
        "task_group": "资料整理",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": [
          "分类方法"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "expired",
      "statusLabel": "过期",
      "projectPath": "20 项目库/知识库体系升级/知识库体系升级.md",
      "projectTitle": "知识库体系升级",
      "milestone": "分类规范",
      "taskSet": "本周维护",
      "taskGroup": "资料整理",
      "due": "2026-09-28",
      "daysLeft": -1,
      "duration": 75,
      "priority": "high",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [
        "分类方法"
      ],
      "type": "task",
      "suggestion": false,
      "index": 10
    },
    {
      "path": "20 项目库/知识库体系升级/迁移旧笔记到新分类.md",
      "name": "迁移旧笔记到新分类",
      "title": "迁移旧笔记到新分类",
      "frontmatter": {
        "type": "task",
        "title": "迁移旧笔记到新分类",
        "status": "todo",
        "project": "知识库体系升级",
        "milestone": "分类规范",
        "due": "2026-10-07",
        "duration": 150,
        "priority": "medium",
        "task_set": "深度工作",
        "task_group": "迁移",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 6,
        "total": 6
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/知识库体系升级/知识库体系升级.md",
      "projectTitle": "知识库体系升级",
      "milestone": "分类规范",
      "taskSet": "深度工作",
      "taskGroup": "迁移",
      "due": "2026-10-07",
      "daysLeft": 8,
      "duration": 150,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 11
    },
    {
      "path": "20 项目库/知识库体系升级/为长期领域建索引页.md",
      "name": "为长期领域建索引页",
      "title": "为长期领域建索引页",
      "frontmatter": {
        "type": "task",
        "title": "为长期领域建索引页",
        "status": "todo",
        "project": "知识库体系升级",
        "milestone": "未分组",
        "due": "2026-10-11",
        "duration": 60,
        "priority": "medium",
        "task_set": "深度工作",
        "task_group": "迁移",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": [
          "索引页范例"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 3,
        "total": 4
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/知识库体系升级/知识库体系升级.md",
      "projectTitle": "知识库体系升级",
      "milestone": "未分组",
      "taskSet": "深度工作",
      "taskGroup": "迁移",
      "due": "2026-10-11",
      "daysLeft": 12,
      "duration": 60,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [
        "索引页范例"
      ],
      "type": "task",
      "suggestion": true,
      "index": 12
    },
    {
      "path": "20 项目库/知识库体系升级/给每个项目补验收标准.md",
      "name": "给每个项目补验收标准",
      "title": "给每个项目补验收标准",
      "frontmatter": {
        "type": "task",
        "title": "给每个项目补验收标准",
        "status": "todo",
        "project": "知识库体系升级",
        "milestone": "未分组",
        "due": "2026-10-14",
        "duration": 50,
        "priority": "low",
        "task_set": "深度工作",
        "task_group": "验收",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 4,
        "total": 4
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/知识库体系升级/知识库体系升级.md",
      "projectTitle": "知识库体系升级",
      "milestone": "未分组",
      "taskSet": "深度工作",
      "taskGroup": "验收",
      "due": "2026-10-14",
      "daysLeft": 15,
      "duration": 50,
      "priority": "low",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 13
    },
    {
      "path": "20 项目库/副业收入实验/调研三个可行的副业方向.md",
      "name": "调研三个可行的副业方向",
      "title": "调研三个可行的副业方向",
      "frontmatter": {
        "type": "task",
        "title": "调研三个可行的副业方向",
        "status": "planning",
        "project": "副业收入实验",
        "milestone": "选方向",
        "due": "",
        "duration": 90,
        "priority": "medium",
        "task_set": "生活管理",
        "task_group": "调研",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 3,
        "total": 3
      },
      "status": "planning",
      "statusLabel": "规划中",
      "projectPath": "20 项目库/副业收入实验/副业收入实验.md",
      "projectTitle": "副业收入实验",
      "milestone": "选方向",
      "taskSet": "生活管理",
      "taskGroup": "调研",
      "due": null,
      "daysLeft": null,
      "duration": 90,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": true,
      "index": 14
    },
    {
      "path": "20 项目库/副业收入实验/访谈一位在做同类副业的朋友.md",
      "name": "访谈一位在做同类副业的朋友",
      "title": "访谈一位在做同类副业的朋友",
      "frontmatter": {
        "type": "task",
        "title": "访谈一位在做同类副业的朋友",
        "status": "planning",
        "project": "副业收入实验",
        "milestone": "选方向",
        "due": "",
        "duration": 45,
        "priority": "low",
        "task_set": "生活管理",
        "task_group": "调研",
        "assignee": "同事",
        "recurrence": "none",
        "knowledge_refs": [
          "访谈提纲"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 2,
        "total": 2
      },
      "status": "planning",
      "statusLabel": "规划中",
      "projectPath": "20 项目库/副业收入实验/副业收入实验.md",
      "projectTitle": "副业收入实验",
      "milestone": "选方向",
      "taskSet": "生活管理",
      "taskGroup": "调研",
      "due": null,
      "daysLeft": null,
      "duration": 45,
      "priority": "low",
      "assignee": "同事",
      "recurrence": "none",
      "knowledgeRefs": [
        "访谈提纲"
      ],
      "type": "task",
      "suggestion": true,
      "index": 15
    },
    {
      "path": "50 日程待办/整理本月账单与现金流.md",
      "name": "整理本月账单与现金流",
      "title": "整理本月账单与现金流",
      "frontmatter": {
        "type": "task",
        "title": "整理本月账单与现金流",
        "status": "todo",
        "project": "",
        "milestone": "未分组",
        "due": "2026-10-03",
        "duration": 40,
        "priority": "high",
        "task_set": "生活管理",
        "task_group": "财务",
        "assignee": "自己",
        "recurrence": "monthly",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 1,
        "total": 2
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "",
      "projectTitle": "",
      "milestone": "未分组",
      "taskSet": "生活管理",
      "taskGroup": "财务",
      "due": "2026-10-03",
      "daysLeft": 4,
      "duration": 40,
      "priority": "high",
      "assignee": "自己",
      "recurrence": "monthly",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 16
    },
    {
      "path": "50 日程待办/给书桌做一次彻底整理.md",
      "name": "给书桌做一次彻底整理",
      "title": "给书桌做一次彻底整理",
      "frontmatter": {
        "type": "task",
        "title": "给书桌做一次彻底整理",
        "status": "todo",
        "project": "",
        "milestone": "未分组",
        "due": "2026-10-05",
        "duration": 60,
        "priority": "low",
        "task_set": "生活管理",
        "task_group": "家务",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 2,
        "total": 2
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "",
      "projectTitle": "",
      "milestone": "未分组",
      "taskSet": "生活管理",
      "taskGroup": "家务",
      "due": "2026-10-05",
      "daysLeft": 6,
      "duration": 60,
      "priority": "low",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 17
    },
    {
      "path": "50 日程待办/梳理移动端适配清单.md",
      "name": "梳理移动端适配清单",
      "title": "梳理移动端适配清单",
      "frontmatter": {
        "type": "task",
        "title": "梳理移动端适配清单",
        "status": "todo",
        "project": "",
        "milestone": "未分组",
        "due": "2026-10-06",
        "duration": 45,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "工程实现",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 0,
        "open": 2,
        "total": 2
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "",
      "projectTitle": "",
      "milestone": "未分组",
      "taskSet": "本周维护",
      "taskGroup": "工程实现",
      "due": "2026-10-06",
      "daysLeft": 7,
      "duration": 45,
      "priority": "medium",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "task",
      "suggestion": false,
      "index": 18
    },
    {
      "path": "50 日程待办/完成一次周复盘并更新方向.md",
      "name": "完成一次周复盘并更新方向",
      "title": "完成一次周复盘并更新方向",
      "frontmatter": {
        "type": "task",
        "title": "完成一次周复盘并更新方向",
        "status": "todo",
        "project": "",
        "milestone": "未分组",
        "due": "2026-09-29",
        "duration": 30,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "复盘",
        "assignee": "自己",
        "recurrence": "weekly",
        "knowledge_refs": [
          "复盘模板"
        ]
      },
      "summary": "来自演示数据集的示例任务。",
      "checklist": {
        "done": 1,
        "open": 2,
        "total": 3
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "",
      "projectTitle": "",
      "milestone": "未分组",
      "taskSet": "本周维护",
      "taskGroup": "复盘",
      "due": "2026-09-29",
      "daysLeft": 0,
      "duration": 30,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "weekly",
      "knowledgeRefs": [
        "复盘模板"
      ],
      "type": "task",
      "suggestion": false,
      "index": 19
    },
    {
      "path": "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md",
      "name": "学习用 Grid 做响应式布局",
      "title": "学习用 Grid 做响应式布局",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "学习用 Grid 做响应式布局",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "完成 MVP",
        "due": "2026-10-03",
        "duration": 60,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "内容产出",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "完成 MVP",
      "taskSet": "本周维护",
      "taskGroup": "内容产出",
      "due": "2026-10-03",
      "daysLeft": 4,
      "duration": 60,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": false,
      "index": 20
    },
    {
      "path": "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md",
      "name": "搞懂 Lighthouse 性能优化项",
      "title": "搞懂 Lighthouse 性能优化项",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "搞懂 Lighthouse 性能优化项",
        "status": "planning",
        "project": "个人网站上线",
        "milestone": "上线验收",
        "due": "",
        "duration": 45,
        "priority": "low",
        "task_set": "深度工作",
        "task_group": "工程实现",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "planning",
      "statusLabel": "规划中",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "上线验收",
      "taskSet": "深度工作",
      "taskGroup": "工程实现",
      "due": null,
      "daysLeft": null,
      "duration": 45,
      "priority": "low",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": true,
      "index": 21
    },
    {
      "path": "20 项目库/年度体检与体能计划/掌握体能训练的动作标准.md",
      "name": "掌握体能训练的动作标准",
      "title": "掌握体能训练的动作标准",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "掌握体能训练的动作标准",
        "status": "doing",
        "project": "年度体检与体能计划",
        "milestone": "建立习惯",
        "due": "2026-10-09",
        "duration": 90,
        "priority": "medium",
        "task_set": "生活管理",
        "task_group": "运动",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "doing",
      "statusLabel": "执行中",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "建立习惯",
      "taskSet": "生活管理",
      "taskGroup": "运动",
      "due": "2026-10-09",
      "daysLeft": 10,
      "duration": 90,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": true,
      "index": 22
    }
  ],
  "inbox": [
    {
      "path": "00 草稿箱/随手记：网站配色灵感.md",
      "name": "随手记：网站配色灵感",
      "title": "随手记：网站配色灵感",
      "stage": "inbox",
      "frontmatter": {
        "type": "note",
        "stage": "inbox"
      },
      "summary": "配色灵感，先记下来，之后并到设计规范里。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      }
    },
    {
      "path": "00 草稿箱/未归类：体检报告要点摘录.md",
      "name": "未归类：体检报告要点摘录",
      "title": "未归类：体检报告要点摘录",
      "stage": "inbox",
      "frontmatter": {
        "type": "note",
        "stage": "inbox"
      },
      "summary": "体检报告要点，等体检项目确认后再整理。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      }
    },
    {
      "path": "00 草稿箱/临时想法：把周复盘做成固定模板.md",
      "name": "临时想法：把周复盘做成固定模板",
      "title": "临时想法：把周复盘做成固定模板",
      "stage": "inbox",
      "frontmatter": {
        "type": "note",
        "stage": "inbox"
      },
      "summary": "把周复盘做成模板，周日固定复盘时用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      }
    }
  ],
  "gaps": [
    {
      "path": "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md",
      "name": "学习用 Grid 做响应式布局",
      "title": "学习用 Grid 做响应式布局",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "学习用 Grid 做响应式布局",
        "status": "todo",
        "project": "个人网站上线",
        "milestone": "完成 MVP",
        "due": "2026-10-03",
        "duration": 60,
        "priority": "medium",
        "task_set": "本周维护",
        "task_group": "内容产出",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "todo",
      "statusLabel": "待办",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "完成 MVP",
      "taskSet": "本周维护",
      "taskGroup": "内容产出",
      "due": "2026-10-03",
      "daysLeft": 4,
      "duration": 60,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": false,
      "index": 20
    },
    {
      "path": "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md",
      "name": "搞懂 Lighthouse 性能优化项",
      "title": "搞懂 Lighthouse 性能优化项",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "搞懂 Lighthouse 性能优化项",
        "status": "planning",
        "project": "个人网站上线",
        "milestone": "上线验收",
        "due": "",
        "duration": 45,
        "priority": "low",
        "task_set": "深度工作",
        "task_group": "工程实现",
        "assignee": "",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "planning",
      "statusLabel": "规划中",
      "projectPath": "20 项目库/个人网站上线/个人网站上线.md",
      "projectTitle": "个人网站上线",
      "milestone": "上线验收",
      "taskSet": "深度工作",
      "taskGroup": "工程实现",
      "due": null,
      "daysLeft": null,
      "duration": 45,
      "priority": "low",
      "assignee": "",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": true,
      "index": 21
    },
    {
      "path": "20 项目库/年度体检与体能计划/掌握体能训练的动作标准.md",
      "name": "掌握体能训练的动作标准",
      "title": "掌握体能训练的动作标准",
      "frontmatter": {
        "type": "knowledge-gap",
        "title": "掌握体能训练的动作标准",
        "status": "doing",
        "project": "年度体检与体能计划",
        "milestone": "建立习惯",
        "due": "2026-10-09",
        "duration": 90,
        "priority": "medium",
        "task_set": "生活管理",
        "task_group": "运动",
        "assignee": "自己",
        "recurrence": "none",
        "knowledge_refs": []
      },
      "summary": "需要补齐的知识缺口，沉淀后回写引用。",
      "checklist": {
        "done": 0,
        "open": 0,
        "total": 0
      },
      "status": "doing",
      "statusLabel": "执行中",
      "projectPath": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "projectTitle": "年度体检与体能计划",
      "milestone": "建立习惯",
      "taskSet": "生活管理",
      "taskGroup": "运动",
      "due": "2026-10-09",
      "daysLeft": 10,
      "duration": 90,
      "priority": "medium",
      "assignee": "自己",
      "recurrence": "none",
      "knowledgeRefs": [],
      "type": "knowledge-gap",
      "suggestion": true,
      "index": 22
    }
  ],
  "notes": [
    {
      "path": "20 项目库/个人网站上线/个人网站上线.md",
      "name": "个人网站上线",
      "kind": "project",
      "type": "project",
      "stage": "",
      "title": "个人网站上线",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "项目",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/年度体检与体能计划.md",
      "name": "年度体检与体能计划",
      "kind": "project",
      "type": "project",
      "stage": "",
      "title": "年度体检与体能计划",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "项目",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/知识库体系升级/知识库体系升级.md",
      "name": "知识库体系升级",
      "kind": "project",
      "type": "project",
      "stage": "",
      "title": "知识库体系升级",
      "folder": "20 项目库/知识库体系升级",
      "statusLabel": "项目",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/副业收入实验/副业收入实验.md",
      "name": "副业收入实验",
      "kind": "project",
      "type": "project",
      "stage": "",
      "title": "副业收入实验",
      "folder": "20 项目库/副业收入实验",
      "statusLabel": "项目",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/完成首页文案.md",
      "name": "完成首页文案",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "完成首页文案",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/设计首页信息结构.md",
      "name": "设计首页信息结构",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "设计首页信息结构",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/搭好静态托管与域名.md",
      "name": "搭好静态托管与域名",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "搭好静态托管与域名",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/整理作品集素材.md",
      "name": "整理作品集素材",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "整理作品集素材",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/上线前全站走查.md",
      "name": "上线前全站走查",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "上线前全站走查",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/预约体检并确认项目.md",
      "name": "预约体检并确认项目",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "预约体检并确认项目",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/确认体检前注意事项.md",
      "name": "确认体检前注意事项",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "确认体检前注意事项",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/本周三次力量训练.md",
      "name": "本周三次力量训练",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "本周三次力量训练",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/记录一周饮食与睡眠.md",
      "name": "记录一周饮食与睡眠",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "记录一周饮食与睡眠",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/复盘近期体能与体重变化.md",
      "name": "复盘近期体能与体重变化",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "复盘近期体能与体重变化",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/知识库体系升级/写知识库分类规范初稿.md",
      "name": "写知识库分类规范初稿",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "写知识库分类规范初稿",
      "folder": "20 项目库/知识库体系升级",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/知识库体系升级/迁移旧笔记到新分类.md",
      "name": "迁移旧笔记到新分类",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "迁移旧笔记到新分类",
      "folder": "20 项目库/知识库体系升级",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/知识库体系升级/为长期领域建索引页.md",
      "name": "为长期领域建索引页",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "为长期领域建索引页",
      "folder": "20 项目库/知识库体系升级",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/知识库体系升级/给每个项目补验收标准.md",
      "name": "给每个项目补验收标准",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "给每个项目补验收标准",
      "folder": "20 项目库/知识库体系升级",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/副业收入实验/调研三个可行的副业方向.md",
      "name": "调研三个可行的副业方向",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "调研三个可行的副业方向",
      "folder": "20 项目库/副业收入实验",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/副业收入实验/访谈一位在做同类副业的朋友.md",
      "name": "访谈一位在做同类副业的朋友",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "访谈一位在做同类副业的朋友",
      "folder": "20 项目库/副业收入实验",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "50 日程待办/整理本月账单与现金流.md",
      "name": "整理本月账单与现金流",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "整理本月账单与现金流",
      "folder": "50 日程待办",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "50 日程待办/给书桌做一次彻底整理.md",
      "name": "给书桌做一次彻底整理",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "给书桌做一次彻底整理",
      "folder": "50 日程待办",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "50 日程待办/梳理移动端适配清单.md",
      "name": "梳理移动端适配清单",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "梳理移动端适配清单",
      "folder": "50 日程待办",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "50 日程待办/完成一次周复盘并更新方向.md",
      "name": "完成一次周复盘并更新方向",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "完成一次周复盘并更新方向",
      "folder": "50 日程待办",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md",
      "name": "学习用 Grid 做响应式布局",
      "kind": "task",
      "type": "knowledge-gap",
      "stage": "",
      "title": "学习用 Grid 做响应式布局",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md",
      "name": "搞懂 Lighthouse 性能优化项",
      "kind": "task",
      "type": "knowledge-gap",
      "stage": "",
      "title": "搞懂 Lighthouse 性能优化项",
      "folder": "20 项目库/个人网站上线",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "20 项目库/年度体检与体能计划/掌握体能训练的动作标准.md",
      "name": "掌握体能训练的动作标准",
      "kind": "task",
      "type": "knowledge-gap",
      "stage": "",
      "title": "掌握体能训练的动作标准",
      "folder": "20 项目库/年度体检与体能计划",
      "statusLabel": "任务",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "00 草稿箱/随手记：网站配色灵感.md",
      "name": "随手记：网站配色灵感",
      "kind": "note",
      "type": "note",
      "stage": "inbox",
      "title": "随手记：网站配色灵感",
      "folder": "00 草稿箱",
      "statusLabel": "草稿",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "00 草稿箱/未归类：体检报告要点摘录.md",
      "name": "未归类：体检报告要点摘录",
      "kind": "note",
      "type": "note",
      "stage": "inbox",
      "title": "未归类：体检报告要点摘录",
      "folder": "00 草稿箱",
      "statusLabel": "草稿",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "00 草稿箱/临时想法：把周复盘做成固定模板.md",
      "name": "临时想法：把周复盘做成固定模板",
      "kind": "note",
      "type": "note",
      "stage": "inbox",
      "title": "临时想法：把周复盘做成固定模板",
      "folder": "00 草稿箱",
      "statusLabel": "草稿",
      "archived": false,
      "words": 0,
      "mtime": "2026-09-29"
    },
    {
      "path": "90 归档库/个人网站上线/[个人网站上线] 旧版配色方案.md",
      "name": "[个人网站上线] 旧版配色方案",
      "kind": "task",
      "type": "task",
      "stage": "",
      "title": "旧版配色方案",
      "folder": "90 归档库/个人网站上线",
      "statusLabel": "已归档",
      "archived": true,
      "words": 0,
      "mtime": "2026-09-29"
    }
  ],
  "timePlan": {
    "days": [
      {
        "date": "2026-09-29",
        "minutes": 55,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/年度体检与体能计划/记录一周饮食与睡眠.md",
          "50 日程待办/完成一次周复盘并更新方向.md"
        ]
      },
      {
        "date": "2026-09-30",
        "minutes": 60,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/个人网站上线/设计首页信息结构.md"
        ]
      },
      {
        "date": "2026-10-01",
        "minutes": 90,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/个人网站上线/完成首页文案.md"
        ]
      },
      {
        "date": "2026-10-02",
        "minutes": 30,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/年度体检与体能计划/预约体检并确认项目.md"
        ]
      },
      {
        "date": "2026-10-03",
        "minutes": 120,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/年度体检与体能计划/确认体检前注意事项.md",
          "50 日程待办/整理本月账单与现金流.md",
          "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md"
        ]
      },
      {
        "date": "2026-10-04",
        "minutes": 45,
        "capacity": 120,
        "overloaded": false,
        "taskPaths": [
          "20 项目库/个人网站上线/搭好静态托管与域名.md"
        ]
      },
      {
        "date": "2026-10-05",
        "minutes": 240,
        "capacity": 120,
        "overloaded": true,
        "taskPaths": [
          "20 项目库/年度体检与体能计划/本周三次力量训练.md",
          "50 日程待办/给书桌做一次彻底整理.md"
        ]
      }
    ],
    "unscheduled": [
      "20 项目库/副业收入实验/调研三个可行的副业方向.md",
      "20 项目库/副业收入实验/访谈一位在做同类副业的朋友.md",
      "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md"
    ]
  },
  "resources": {
    "knowledge": [
      {
        "title": "写作模板",
        "path": "30 知识库/写作模板.md",
        "type": "knowledge",
        "refs": [
          "结构化写作",
          "开头三选一",
          "结尾给行动"
        ]
      },
      {
        "title": "分类方法",
        "path": "30 知识库/分类方法.md",
        "type": "knowledge",
        "refs": [
          "按用途分类",
          "按领域分类",
          "混合分类的取舍"
        ]
      },
      {
        "title": "复盘模板",
        "path": "30 知识库/复盘模板.md",
        "type": "knowledge",
        "refs": [
          "事实",
          "原因",
          "下一步"
        ]
      },
      {
        "title": "部署清单",
        "path": "30 知识库/部署清单.md",
        "type": "knowledge",
        "refs": [
          "构建",
          "域名",
          "回滚预案"
        ]
      },
      {
        "title": "访谈提纲",
        "path": "30 知识库/访谈提纲.md",
        "type": "knowledge",
        "refs": [
          "背景",
          "关键决策",
          "踩过的坑"
        ]
      }
    ],
    "books": [
      {
        "title": "《设计心理学》",
        "path": "30 知识库/图书库/设计心理学.md",
        "type": "book",
        "state": "未读完"
      },
      {
        "title": "《深度工作》",
        "path": "30 知识库/图书库/深度工作.md",
        "type": "book",
        "state": "在读"
      },
      {
        "title": "《掌控习惯》",
        "path": "30 知识库/图书库/掌控习惯.md",
        "type": "book",
        "state": "未开始"
      }
    ],
    "videos": [
      {
        "title": "Grid 布局实战课",
        "path": "30 知识库/视频/Grid 布局实战课.md",
        "type": "video",
        "state": "未看完"
      },
      {
        "title": "体能训练基础课",
        "path": "30 知识库/视频/体能训练基础课.md",
        "type": "video",
        "state": "进行中"
      }
    ],
    "people": [
      {
        "title": "同事",
        "path": "40 人物库/同事.md",
        "type": "person",
        "role": "工程协作"
      },
      {
        "title": "健身教练",
        "path": "40 人物库/健身教练.md",
        "type": "person",
        "role": "体能计划"
      },
      {
        "title": "老朋友",
        "path": "40 人物库/老朋友.md",
        "type": "person",
        "role": "副业经验"
      }
    ],
    "areas": [
      {
        "title": "事业",
        "path": "10 长期领域/事业.md",
        "type": "area",
        "projects": 2
      },
      {
        "title": "健康",
        "path": "10 长期领域/健康.md",
        "type": "area",
        "projects": 1
      },
      {
        "title": "知识管理",
        "path": "10 长期领域/知识管理.md",
        "type": "area",
        "projects": 1
      },
      {
        "title": "财富",
        "path": "10 长期领域/财富.md",
        "type": "area",
        "projects": 1
      },
      {
        "title": "关于我",
        "path": "10 长期领域/关于我.md",
        "type": "area",
        "projects": 0
      },
      {
        "title": "财富相关",
        "path": "10 长期领域/财富相关.md",
        "type": "area",
        "projects": 0
      }
    ]
  },
  "hierarchy": [
    {
      "name": "本周维护",
      "groups": [
        {
          "name": "资料整理",
          "taskPaths": [
            "20 项目库/知识库体系升级/写知识库分类规范初稿.md"
          ]
        },
        {
          "name": "复盘",
          "taskPaths": [
            "50 日程待办/完成一次周复盘并更新方向.md"
          ]
        },
        {
          "name": "内容产出",
          "taskPaths": [
            "20 项目库/个人网站上线/设计首页信息结构.md",
            "20 项目库/个人网站上线/完成首页文案.md",
            "20 项目库/个人网站上线/学习用 Grid 做响应式布局.md"
          ]
        },
        {
          "name": "生活事务",
          "taskPaths": [
            "20 项目库/年度体检与体能计划/预约体检并确认项目.md",
            "20 项目库/年度体检与体能计划/确认体检前注意事项.md"
          ]
        },
        {
          "name": "工程实现",
          "taskPaths": [
            "20 项目库/个人网站上线/搭好静态托管与域名.md",
            "50 日程待办/梳理移动端适配清单.md"
          ]
        },
        {
          "name": "素材整理",
          "taskPaths": [
            "20 项目库/个人网站上线/整理作品集素材.md"
          ]
        }
      ]
    },
    {
      "name": "生活管理",
      "groups": [
        {
          "name": "记录",
          "taskPaths": [
            "20 项目库/年度体检与体能计划/记录一周饮食与睡眠.md"
          ]
        },
        {
          "name": "财务",
          "taskPaths": [
            "50 日程待办/整理本月账单与现金流.md"
          ]
        },
        {
          "name": "运动",
          "taskPaths": [
            "20 项目库/年度体检与体能计划/本周三次力量训练.md",
            "20 项目库/年度体检与体能计划/掌握体能训练的动作标准.md"
          ]
        },
        {
          "name": "家务",
          "taskPaths": [
            "50 日程待办/给书桌做一次彻底整理.md"
          ]
        },
        {
          "name": "复盘",
          "taskPaths": [
            "20 项目库/年度体检与体能计划/复盘近期体能与体重变化.md"
          ]
        },
        {
          "name": "调研",
          "taskPaths": [
            "20 项目库/副业收入实验/调研三个可行的副业方向.md",
            "20 项目库/副业收入实验/访谈一位在做同类副业的朋友.md"
          ]
        }
      ]
    },
    {
      "name": "深度工作",
      "groups": [
        {
          "name": "迁移",
          "taskPaths": [
            "20 项目库/知识库体系升级/迁移旧笔记到新分类.md",
            "20 项目库/知识库体系升级/为长期领域建索引页.md"
          ]
        },
        {
          "name": "验收",
          "taskPaths": [
            "20 项目库/知识库体系升级/给每个项目补验收标准.md",
            "20 项目库/个人网站上线/上线前全站走查.md"
          ]
        },
        {
          "name": "工程实现",
          "taskPaths": [
            "20 项目库/个人网站上线/搞懂 Lighthouse 性能优化项.md"
          ]
        }
      ]
    }
  ],
  "history": []
};
