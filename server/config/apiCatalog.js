/**
 * 接口目录表：手写维护的 API 文档源，同时被 endpointMonitor 中间件用于路由匹配。
 *
 * 字段约定：
 * - method: HTTP 方法（大写）
 * - path: Express 原始路径，参数用 :param 形式
 * - group: 前端分组展示用（认证 / 博客 / ...）
 * - name: 简短中文名称
 * - description: 一句话描述
 * - auth: 'public' | 'login' | 'admin'
 * - params: { path?: [], query?: [], body?: [] }
 * - response: 响应 JSON 结构示例（字符串）
 * - notes: 额外说明（如流式 SSE）
 *
 * 新增路由后只在这里补一条，中间件匹配和文档详情页自动生效。
 */

const GROUPS = [
  { value: 'system', label: '系统' },
  { value: 'auth', label: '认证' },
  { value: 'blog', label: '博客管理' },
  { value: 'public', label: '前台公开 API' },
  { value: 'comment', label: '评论管理' },
  { value: 'category', label: '分类管理' },
  { value: 'tag', label: '标签管理' },
  { value: 'notification', label: '通知公告' },
  { value: 'upload', label: '文件上传' },
  { value: 'ai', label: 'AI 功能' },
  { value: 'chat', label: '智能客服' },
  { value: 'stats', label: '统计分析' },
  { value: 'feedback', label: '问题反馈' },
  { value: 'audit', label: '留痕管理' },
  { value: 'monitor', label: '系统监控' },
];

// 通用字段描述，用于 params 引用减少重复
const ID = { name: 'id', type: 'string(ObjectId)', required: true, desc: '文档主键（24 位十六进制 ObjectId）' };
const PAGE = { name: 'page', type: 'integer', required: false, desc: '页码，默认 1' };
const PS = { name: 'pageSize', type: 'integer', required: false, desc: '每页条数，默认 10' };
const KEYWORD = { name: 'keyword', type: 'string', required: false, desc: '关键词模糊搜索' };
const START = { name: 'startTime', type: 'ISO 8601', required: false, desc: '起始时间' };
const END = { name: 'endTime', type: 'ISO 8601', required: false, desc: '截止时间' };

/** 把一个 path 模板（带 :param）编译成正则，用于 middleware 里匹配真实请求路径 */
function compilePath(pattern) {
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
  return (path) => regex.test(path);
}

// ============ 条目开始 ============
const items = [];

function add(entry) {
  items.push({
    id: `${entry.method} ${entry.path}`,
    auth: 'public',
    params: {},
    response: '',
    ...entry,
    _match: compilePath(entry.path),
  });
}

// ---- 系统 ----
add({ method: 'GET', path: '/api/health', group: 'system', name: '健康检查', description: '服务器存活探针，返回 {status: ok}', auth: 'public', response: `{"status":"ok"}` });

// ---- 认证 ----
add({ method: 'GET', path: '/api/auth/captcha', group: 'auth', name: '获取验证码', description: '返回 SVG 图形验证码 + captchaId（一次性，5 分钟过期）', auth: 'public', response: `{"captchaId":"xxx","svg":"<svg.../>"}` });
add({ method: 'POST', path: '/api/auth/register', group: 'auth', name: '注册', description: '新用户注册，成功后自动登录返回 accessToken', auth: 'public', params: { body: [{ name: 'username', type: 'string', desc: '用户名，3-20 位' }, { name: 'password', type: 'string', desc: '密码，6-50 位' }, { name: 'captchaId / captcha', type: 'string', desc: '图形验证码（CAPTCHA_ENABLED 开启时必传）' }] }, response: `{"accessToken":"...","user":{...}}` });
add({ method: 'POST', path: '/api/auth/login', group: 'auth', name: '登录', description: '账号密码登录，返回 accessToken + 当前用户信息', auth: 'public', params: { body: [{ name: 'username', type: 'string' }, { name: 'password', type: 'string' }, { name: 'captchaId / captcha', type: 'string', desc: '图形验证码' }] }, response: `{"accessToken":"...","user":{username,role,...}}` });
add({ method: 'GET', path: '/api/auth/me', group: 'auth', name: '当前用户', description: '根据 accessToken 返回当前登录用户资料', auth: 'login', response: `{username,role,avatar,...}` });
add({ method: 'PUT', path: '/api/auth/profile', group: 'auth', name: '更新个人资料', description: '更新昵称/头像/绑定信息，支持手机号验证码换绑', auth: 'login', params: { body: [{ name: 'username', type: 'string', desc: '昵称' }, { name: 'avatar', type: 'string', desc: '头像 OSS URL' }, { name: 'phone', type: 'string', desc: '密保手机号，空字符串解绑' }, { name: 'phoneCode', type: 'string', desc: '验证码（换绑手机号时必传）' }, { name: 'securityQuestion/securityAnswer', type: 'string', desc: '密保问题和答案必须同时设置或清空' }, { name: 'backupEmail', type: 'string', desc: '备用邮箱' }] } });
add({ method: 'POST', path: '/api/auth/logout', group: 'auth', name: '登出', description: '删除当前设备的 Token 记录', auth: 'login' });
add({ method: 'GET', path: '/api/auth/tokens', group: 'auth', name: '当前登录设备', description: '返回当前账号所有有效登录设备（支持多端并行登录）', auth: 'login' });
add({ method: 'POST', path: '/api/auth/send-sms', group: 'auth', name: '发送短信验证码', description: '开发模式直接返回明文验证码，生产调真实短信服务商', auth: 'public', params: { body: [{ name: 'phone', type: 'string', desc: '手机号' }, { name: 'purpose', type: 'enum', desc: 'change-password / reset-password / bind-phone' }] } });
add({ method: 'POST', path: '/api/auth/change-password', group: 'auth', name: '修改密码', description: '两种验证模式：旧密码或手机号验证码；成功后强制所有设备重新登录', auth: 'login', params: { body: [{ name: 'oldPassword', type: 'string', desc: '模式一：旧密码' }, { name: 'phone + code', type: 'string', desc: '模式二：手机号验证码' }, { name: 'newPassword', type: 'string', desc: '新密码' }] } });
add({ method: 'POST', path: '/api/auth/reset-password', group: 'auth', name: '找回密码', description: '未登录场景，通过手机号验证码重置密码', auth: 'public', params: { body: [{ name: 'phone', type: 'string' }, { name: 'code', type: 'string' }, { name: 'newPassword', type: 'string' }] } });

// ---- 博客管理 ----
add({ method: 'GET', path: '/api/blogs', group: 'blog', name: '博客列表', description: '分页 + 筛选：分类 / 标签 / 状态 / 关键词 / 日期范围 / 作者，admin 可看全站，普通用户只看自己', auth: 'login', params: { query: [PAGE, PS, { name: 'category / tag / status', type: 'string' }, KEYWORD, START, END] } });
add({ method: 'PUT', path: '/api/blogs/batch-status', group: 'blog', name: '批量上下架', description: 'admin 专属，批量把多篇文章改为 published / draft', auth: 'admin', params: { body: [{ name: 'ids', type: 'string[]' }, { name: 'status', type: 'enum', desc: 'published / draft' }] } });
add({ method: 'PUT', path: '/api/blogs/batch-category', group: 'blog', name: '批量修改分类', description: '所有登录用户可用，但仅限操作自己名下的文章', auth: 'login', params: { body: [{ name: 'ids', type: 'string[]' }, { name: 'category', type: 'string' }] } });
add({ method: 'GET', path: '/api/blogs/:id', group: 'blog', name: '博客详情（后台）', description: '后台查看单篇文章详情，admin 可看全站，普通用户只看自己的', auth: 'login', params: { path: [ID] } });
add({ method: 'POST', path: '/api/blogs', group: 'blog', name: '新建博客', description: '创建文章草稿，自动归属当前用户，contentGuard 中间件做敏感词校验', auth: 'login', params: { body: [{ name: 'title / summary / content', type: 'string' }, { name: 'category / tags / coverImage', type: 'string' }, { name: 'status', type: 'enum', desc: 'draft / published / scheduled' }, { name: 'scheduledAt', type: 'ISO 8601', desc: '定时发布时间，status=scheduled 时必填' }, { name: 'contentType', type: 'enum', desc: 'original / ai' }, { name: 'featured', type: 'boolean' }] } });
add({ method: 'PUT', path: '/api/blogs/:id', group: 'blog', name: '编辑博客', description: '更新文章内容，同新建接口的敏感词校验 + ownership 检查', auth: 'login', params: { path: [ID] } });
add({ method: 'PUT', path: '/api/blogs/:id/featured', group: 'blog', name: '切换精选标记', description: 'admin 可对任意文章切换，普通用户仅限自己的', auth: 'login', params: { path: [ID], body: [{ name: 'featured', type: 'boolean' }] } });
add({ method: 'DELETE', path: '/api/blogs/:id', group: 'blog', name: '删除博客', description: '硬删除，ownership 检查；同时删除封面 OSS 资源与关联评论', auth: 'login', params: { path: [ID] } });

// ---- 前台公开 API ----
add({ method: 'GET', path: '/api/public/blogs', group: 'public', name: '公开博客列表', description: '无需登录，只返回 status=published 的文章，按 featured 置顶后 publishedAt 倒序', auth: 'public', params: { query: [PAGE, PS, { name: 'keyword / category / tag', type: 'string' }] } });
add({ method: 'GET', path: '/api/public/blogs/:id', group: 'public', name: '公开博客详情', description: '无需登录，返回已发布文章完整内容 + 评论数，访问时自动自增 views', auth: 'public', params: { path: [ID] } });
add({ method: 'GET', path: '/api/public/categories', group: 'public', name: '分类聚合（公开）', description: '无需登录，按分类统计已发布文章数量', auth: 'public' });
add({ method: 'GET', path: '/api/public/tags', group: 'public', name: '标签聚合（公开）', description: '无需登录，按标签统计已发布文章数量（Top 50）', auth: 'public' });
add({ method: 'GET', path: '/api/public/archive', group: 'public', name: '按月归档', description: '无需登录，按发布月份分组聚合文章数', auth: 'public' });
add({ method: 'GET', path: '/api/public/blogs/:id/comments', group: 'public', name: '文章评论列表', description: '无需登录，返回已通过（approved）的评论', auth: 'public', params: { path: [ID] } });
add({ method: 'POST', path: '/api/public/blogs/:id/comments', group: 'public', name: '发表评论（前台）', description: '无需登录，默认 status=pending 待审核', auth: 'public', params: { path: [ID], body: [{ name: 'nickname', type: 'string' }, { name: 'content', type: 'string' }, { name: 'email', type: 'string' }] } });

// ---- 评论管理 ----
add({ method: 'GET', path: '/api/comments', group: 'comment', name: '评论列表（后台）', description: 'admin 看全站，普通用户看自己文章收到的评论', auth: 'login', params: { query: [PAGE, PS, { name: 'blogId', type: 'string' }, { name: 'status', type: 'enum' }] } });
add({ method: 'GET', path: '/api/comments/stats', group: 'comment', name: '评论状态统计', description: '返回 pending / approved / rejected 各状态数量', auth: 'login' });
add({ method: 'PUT', path: '/api/comments/:id', group: 'comment', name: '审核评论', description: '把评论状态改为 approved / rejected', auth: 'login', params: { path: [ID], body: [{ name: 'status', type: 'enum' }] } });
add({ method: 'DELETE', path: '/api/comments/:id', group: 'comment', name: '删除评论', description: '硬删除评论', auth: 'login', params: { path: [ID] } });

// ---- 分类 ----
add({ method: 'GET', path: '/api/categories', group: 'category', name: '分类候选列表', description: '所有登录用户可见，按使用量倒序（供博客列表/创建页下拉 + 自由输入）', auth: 'login' });
add({ method: 'POST', path: '/api/categories', group: 'category', name: '新增分类', description: 'admin 可添加新的自定义分类', auth: 'admin', params: { body: [{ name: 'name', type: 'string' }] } });
add({ method: 'PUT', path: '/api/categories/:id', group: 'category', name: '修改分类', description: '重命名分类，已归属该分类的文章同时更新', auth: 'admin', params: { path: [ID], body: [{ name: 'name', type: 'string' }] } });
add({ method: 'DELETE', path: '/api/categories/:id', group: 'category', name: '删除分类', description: '把已归属该分类的文章重置为空分类后再删除', auth: 'admin', params: { path: [ID] } });

// ---- 标签 ----
add({ method: 'GET', path: '/api/tags', group: 'tag', name: '标签候选列表', description: '按使用量倒序返回，所有登录用户可见', auth: 'login' });
add({ method: 'POST', path: '/api/tags', group: 'tag', name: '新增标签', description: 'admin 可添加新的标签（按 name 去重）', auth: 'admin', params: { body: [{ name: 'name', type: 'string' }] } });
add({ method: 'PUT', path: '/api/tags/:id', group: 'tag', name: '修改标签', description: '重命名标签，已使用该标签的文章同时更新', auth: 'admin', params: { path: [ID], body: [{ name: 'name', type: 'string' }] } });
add({ method: 'DELETE', path: '/api/tags/:id', group: 'tag', name: '删除标签', description: '把已使用该标签的文章从 tags 数组移除后再删除', auth: 'admin', params: { path: [ID] } });

// ---- 通知 ----
add({ method: 'GET', path: '/api/notifications', group: 'notification', name: '通知列表', description: '当前登录用户的通知列表（全员可见），按 createdAt 倒序', auth: 'login', params: { query: [PAGE, PS] } });
add({ method: 'GET', path: '/api/notifications/unread-count', group: 'notification', name: '未读计数', description: '返回当前用户未读通知数量', auth: 'login' });
add({ method: 'PUT', path: '/api/notifications/read-all', group: 'notification', name: '全部标为已读', description: '用 $addToSet 原子操作写入 readBy，避免并发重复', auth: 'login' });
add({ method: 'POST', path: '/api/notifications', group: 'notification', name: '发布通知', description: 'admin 发布全员通知', auth: 'admin', params: { body: [{ name: 'title / content', type: 'string' }] } });
add({ method: 'GET', path: '/api/notifications/:id', group: 'notification', name: '通知详情', description: '查看单条通知，自动把当前用户加入 readBy', auth: 'login', params: { path: [ID] } });
add({ method: 'PUT', path: '/api/notifications/:id', group: 'notification', name: '编辑通知', description: 'admin 编辑通知内容', auth: 'admin', params: { path: [ID] } });
add({ method: 'DELETE', path: '/api/notifications/:id', group: 'notification', name: '删除通知', description: 'admin 删除通知', auth: 'admin', params: { path: [ID] } });

// ---- 上传 ----
add({ method: 'POST', path: '/api/upload/file', group: 'upload', name: '文件上传（OSS）', description: '后端中转上传到阿里云 OSS，返回公开 URL；中间件自动处理 multipart/form-data', auth: 'login', notes: 'FormData 字段名 file，Vite 端需覆盖 request header 为 multipart/form-data' });
add({ method: 'POST', path: '/api/upload/local', group: 'upload', name: '本地模式上传', description: 'OSS 不可用时的本地落盘 fallback', auth: 'login' });
add({ method: 'DELETE', path: '/api/upload/object', group: 'upload', name: '删除 OSS 对象', description: '删除指定 key 的 OSS 文件（清理封面替换后的垃圾文件）', auth: 'login', params: { body: [{ name: 'key / url', type: 'string' }] } });

// ---- AI ----
add({ method: 'POST', path: '/api/ai/generate', group: 'ai', name: '文生图', description: '调用 wan2.2-t2i-flash 同步文生图，后端中转，单价 0.14 元/张', auth: 'login', params: { body: [{ name: 'prompt', type: 'string', desc: '提示词，最长 500 字' }] }, notes: '同步返回 URL + OSS key；埋点 scene=image；可能因 Vite proxy 重启产生偶发 502' });
add({ method: 'POST', path: '/api/ai/article', group: 'ai', name: 'AI 写作助手', description: 'SSE 流式返回 Markdown 正文，支持 qwen3.7-plus / qwen3.8-max / qwen3.8-flash 三档模型 + 四种文笔风格 + 三种篇幅', auth: 'login', params: { body: [{ name: 'prompt', type: 'string', desc: '写作提示词（2000 字上限）' }, { name: 'title / category', type: 'string', desc: '可选写作上下文' }, { name: 'tone', type: 'enum', desc: 'technical / popular / deep / casual' }, { name: 'length', type: 'enum', desc: 'short ~800 / medium ~1500 / long ~2600' }, { name: 'model', type: 'enum' }] }, notes: 'SSE text/event-stream；用户断开会触发 controller.signal.aborted 终止上游请求并记一笔取消的埋点' });

// ---- 智能客服 ----
add({ method: 'GET', path: '/api/chat/faq', group: 'chat', name: '客服 FAQ 首屏', description: '无需登录，返回高频预设问答 + 快捷选项（首屏 20 条）', auth: 'public' });
add({ method: 'POST', path: '/api/chat/message', group: 'chat', name: '发送客服消息', description: '无需登录，type=option 命中预设 / type=text 先走 FAQ 匹配（bigram 相似度）再走 qwen-plus SSE 兜底 / type=handoff 标记待跟进', auth: 'public', params: { body: [{ name: 'sessionId', type: 'string', desc: '前端生成的匿名会话 ID' }, { name: 'message', type: 'string' }, { name: 'type', type: 'enum', desc: 'text / option / handoff' }, { name: 'faqId', type: 'ObjectId', desc: 'type=option 时必须传' }] }, notes: 'SSE 流式返回；上游失败自动 fallback 转兜底回答并标 unhandled' });
add({ method: 'GET', path: '/api/chat/faqs', group: 'chat', name: 'FAQ 列表（后台）', description: 'admin 管理客服预设问答，返回全部（含 enabled 标志）', auth: 'admin' });
add({ method: 'POST', path: '/api/chat/faqs', group: 'chat', name: '新增 FAQ', description: 'admin 新增预设问答', auth: 'admin' });
add({ method: 'PUT', path: '/api/chat/faqs/:id', group: 'chat', name: '修改 FAQ', description: 'admin 编辑预设问答', auth: 'admin', params: { path: [ID] } });
add({ method: 'DELETE', path: '/api/chat/faqs/:id', group: 'chat', name: '删除 FAQ', description: 'admin 删除预设问答', auth: 'admin', params: { path: [ID] } });
add({ method: 'GET', path: '/api/chat/sessions', group: 'chat', name: '客服会话列表', description: 'admin 查看全部匿名客服会话，支持 unhandled 筛选', auth: 'admin' });
add({ method: 'GET', path: '/api/chat/sessions/:sessionId', group: 'chat', name: '客服会话详情', description: 'admin 查看完整对话历史', auth: 'admin' });
add({ method: 'PUT', path: '/api/chat/sessions/:sessionId/handled', group: 'chat', name: '标记已处理', description: 'admin 把 unhandled 会话标为已跟进', auth: 'admin' });
add({ method: 'DELETE', path: '/api/chat/sessions/:sessionId', group: 'chat', name: '删除客服会话', description: 'admin 删除匿名客服会话', auth: 'admin' });

// ---- 统计 ----
add({ method: 'GET', path: '/api/stats/dashboard', group: 'stats', name: '工作台汇总', description: 'admin 专属，Promise.all 并行 22 个聚合：overview / today / 14 天趋势 / 分类分布 / 热门文章 / 最新评论 / 最新会话 / 最新文章', auth: 'admin' });
add({ method: 'GET', path: '/api/stats/personal', group: 'stats', name: '个人创作分析', description: '普通用户专属，只统计自己名下文章及其评论；admin 走 /dashboard', auth: 'login' });

// ---- 反馈 ----
add({ method: 'POST', path: '/api/feedback', group: 'feedback', name: '提交反馈', description: '普通用户提交问题反馈', auth: 'login', params: { body: [{ name: 'title / content', type: 'string' }, { name: 'type', type: 'enum', desc: 'bug / feature / question' }] } });
add({ method: 'GET', path: '/api/feedback', group: 'feedback', name: '反馈列表（我的）', description: '普通用户查看自己提交的反馈', auth: 'login' });
add({ method: 'GET', path: '/api/feedback/all', group: 'feedback', name: '反馈列表（全部）', description: 'admin 查看所有用户的反馈', auth: 'admin' });
add({ method: 'PUT', path: '/api/feedback/:id', group: 'feedback', name: '处理反馈', description: 'admin 修改反馈状态/响应', auth: 'admin', params: { path: [ID] } });

// ---- 留痕 ----
add({ method: 'GET', path: '/api/audit-logs', group: 'audit', name: '留痕列表', description: '每个账号只看自己的操作记录；按 module+targetId 聚合后只展示最新一条改动', auth: 'login', params: { query: [PAGE, PS, { name: 'module', type: 'string' }, { name: 'action', type: 'enum', desc: 'create / update / delete' }, KEYWORD, START, END] } });
add({ method: 'GET', path: '/api/audit-logs/:id/history', group: 'audit', name: '同一对象完整历史', description: '同一条业务内容的全部改动时间线（列表聚合只显示最新，这里看全量）', auth: 'login', params: { path: [ID] } });
add({ method: 'GET', path: '/api/audit-logs/:id', group: 'audit', name: '留痕详情', description: '包含变更前后完整快照', auth: 'login', params: { path: [ID] } });
add({ method: 'POST', path: '/api/audit-logs/:id/restore', group: 'audit', name: '一键恢复', description: '把数据回滚到变更前状态（仅 create/update/delete 三类 + 有目标模型 + 未恢复过的记录可用）', auth: 'login', params: { path: [ID] } });

// ---- 监控 ----
add({ method: 'GET', path: '/api/ai-usage/overview', group: 'monitor', name: 'AI 用量概览', description: '近 N 天调用汇总 + 今日快照', auth: 'admin', params: { query: [{ name: 'days', type: 'int', desc: '1~90，默认 14' }] } });
add({ method: 'GET', path: '/api/ai-usage/trend', group: 'monitor', name: 'AI 用量趋势', description: '按天补零的调用量 / token / 费用趋势', auth: 'admin' });
add({ method: 'GET', path: '/api/ai-usage/distribution', group: 'monitor', name: 'AI 费用分布', description: '按模型或按场景聚合费用', auth: 'admin', params: { query: [{ name: 'by', type: 'enum', desc: 'model / scene' }] } });
add({ method: 'GET', path: '/api/ai-usage/list', group: 'monitor', name: 'AI 用量明细', description: '分页埋点明细 + 多条件筛选', auth: 'admin' });
add({ method: 'GET', path: '/api/ai-usage/pricing', group: 'monitor', name: '价目表', description: '返回内置价目表 + 场景字典（供页面展示与计算器取初值）', auth: 'admin' });
add({ method: 'GET', path: '/api/endpoint-monitor/overview', group: 'monitor', name: '接口调用概览', description: '全站接口调用次数 / 成功率 / 平均耗时 / 异常数', auth: 'admin' });
add({ method: 'GET', path: '/api/endpoint-monitor/distribution', group: 'monitor', name: '接口调用分布', description: '按 routeKey 聚合调用量 + 成功率 + 平均耗时', auth: 'admin' });
add({ method: 'GET', path: '/api/endpoint-monitor/list', group: 'monitor', name: '接口调用明细', description: '单条请求级别的详细调用记录', auth: 'admin' });
add({ method: 'GET', path: '/api/endpoint-monitor/route/:routeKey', group: 'monitor', name: '单路由聚合 + 文档', description: '返回一个路由的聚合 stats + 原始 catalog 文档（详情页核心数据）', auth: 'admin' });

// 兜底 404：最后一个中间件，但 catalog 不收录它
// 兜底统一错误处理：同样不收录

/**
 * 根据 method + 真实请求路径找 catalog 条目。
 * path 模板编译后的正则会把参数占位符换成 [^/]+，匹配实际路径里的 ObjectId / sessionId 等。
 * 匹配不到返回 null（这种请求不会被 endpointMonitor 落库）。
 */
export function matchCatalog(method, path) {
  return items.find((e) => e.method === method && e._match(path)) || null;
}

export function listCatalog() {
  return items.map(({ _match, ...rest }) => rest);
}

export function getCatalogGroups() {
  return GROUPS;
}

export function getCatalogById(id) {
  return items.find((e) => e.id === id) || null;
}

/** 给 routeKey 做前缀分类（catalog 没覆盖到的兜底） */
export function guessGroup(method, path) {
  const entry = matchCatalog(method, path);
  if (entry) return entry.group;
  if (path.startsWith('/api/auth')) return 'auth';
  if (path.startsWith('/api/blogs') || path.startsWith('/api/categories') || path.startsWith('/api/tags')) return 'blog';
  if (path.startsWith('/api/public')) return 'public';
  if (path.startsWith('/api/comments')) return 'comment';
  if (path.startsWith('/api/notification')) return 'notification';
  if (path.startsWith('/api/upload')) return 'upload';
  if (path.startsWith('/api/ai')) return 'ai';
  if (path.startsWith('/api/chat')) return 'chat';
  if (path.startsWith('/api/stats')) return 'stats';
  if (path.startsWith('/api/feedback')) return 'feedback';
  if (path.startsWith('/api/audit-logs')) return 'audit';
  if (path.startsWith('/api/ai-usage') || path.startsWith('/api/endpoint-monitor')) return 'monitor';
  return 'other';
}
