export interface TechItem {
  name: string;
  version?: string;
  desc: string;
  /** 主色，用于 chip 背景 */
  color: string;
  /** 图标 emoji，无外链依赖 */
  icon: string;
  link?: string;
}

export interface TechGroup {
  key: string;
  title: string;
  subtitle: string;
  /** 左侧 accent 条颜色 */
  accent: string;
  items: TechItem[];
}

/**
 * 系统技术栈清单 —— 纯前端静态数据，按分类渲染
 */
export const techStack: TechGroup[] = [
  {
    key: 'admin',
    title: '后台管理 · CMS',
    subtitle: 'Vben Admin 基座 + Ant Design Vue 的企业级控制台',
    accent: '#1677ff',
    items: [
      { name: 'Vue 3', version: 'catalog', desc: '渐进式前端框架，Script Setup + TS', color: '#42b883', icon: '💚', link: 'https://vuejs.org/' },
      { name: 'TypeScript', version: 'catalog', desc: '类型安全的 JavaScript 超集', color: '#3178c6', icon: '🔷', link: 'https://www.typescriptlang.org/' },
      { name: 'Vite', version: 'catalog', desc: '极速开发服务器与构建工具', color: '#646cff', icon: '⚡', link: 'https://vitejs.dev/' },
      { name: 'Vben Admin', version: 'workspace', desc: '现代 Vue 3 管理框架基座（Monorepo）', color: '#165dff', icon: '🧱', link: 'https://doc.vben.pro/' },
      { name: 'Ant Design Vue', version: 'catalog', desc: '企业级 UI 组件库', color: '#1677ff', icon: '🎨', link: 'https://antdv.com/' },
      { name: 'Pinia', version: 'catalog', desc: 'Vue 3 官方推荐状态管理', color: '#ffd95a', icon: '🍍', link: 'https://pinia.vuejs.org/' },
      { name: 'ECharts', desc: 'Apache 出品的可视化图表库（@vben/plugins/echarts）', color: '#5470c6', icon: '📊', link: 'https://echarts.apache.org/' },
      { name: 'md-editor-v3', version: '^7.1', desc: 'Markdown 富文本编辑器，支持流式渲染', color: '#8b5cf6', icon: '✍️', link: 'https://github.com/imzbf/md-editor-v3' },
      { name: 'VueUse', version: 'catalog', desc: '实用的 Vue Composition API 工具集', color: '#18a058', icon: '🛠️', link: 'https://vueuse.org/' },
      { name: 'Day.js', version: 'catalog', desc: '轻量级日期处理库', color: '#f7df1e', icon: '📅', link: 'https://dayjs.gitee.io/' },
      { name: 'Tailwind CSS', version: 'catalog', desc: '原子化 CSS 工具类框架', color: '#38bdf8', icon: '🌬️', link: 'https://tailwindcss.com/' },
    ],
  },
  {
    key: 'blog-web',
    title: '博客前台 · 公开站',
    subtitle: '独立部署的创意博客前台，全屏画布背景 + 主题切换',
    accent: '#f472b6',
    items: [
      { name: 'Vue 3', version: '^3.5', desc: '渐进式前端框架', color: '#42b883', icon: '💚', link: 'https://vuejs.org/' },
      { name: 'Vite', version: '^8.3', desc: '极速开发服务器与构建工具', color: '#646cff', icon: '⚡', link: 'https://vitejs.dev/' },
      { name: 'Tailwind CSS', version: '^3.4', desc: '原子化 CSS 工具类框架', color: '#38bdf8', icon: '🌬️', link: 'https://tailwindcss.com/' },
      { name: 'GSAP', version: '^3.15', desc: '高性能 JS 动画库（ScrollTrigger once 模式）', color: '#88ce02', icon: '🎞️', link: 'https://gsap.com/' },
      { name: 'Axios', version: '^1.20', desc: 'HTTP 请求客户端', color: '#5a29e4', icon: '🌐', link: 'https://axios-http.com/' },
      { name: 'Markdown-It', version: '^15.0', desc: 'Markdown 解析器', color: '#555', icon: '📝', link: 'https://markdown-it.github.io/' },
      { name: 'Lucide Vue', version: '^1.0', desc: '简约一致的图标库', color: '#0ea5e9', icon: '🪶', link: 'https://lucide.dev/' },
      { name: 'Canvas 2D', desc: '手绘的 PulseGrid 粒子/网格背景（原生 Web API）', color: '#ef4444', icon: '🧬' },
    ],
  },
  {
    key: 'backend',
    title: '后端服务 · Node',
    subtitle: 'Express + Mongoose，纯 ESM 模块化',
    accent: '#22c55e',
    items: [
      { name: 'Node.js', version: '≥22', desc: 'JavaScript 运行时', color: '#6cc24a', icon: '🟢', link: 'https://nodejs.org/' },
      { name: 'Express', version: '^4.21', desc: '最流行的 Node Web 框架', color: '#444', icon: '🚉', link: 'https://expressjs.com/' },
      { name: 'Mongoose', version: '^8.7', desc: 'MongoDB ODM 建模与查询', color: '#880000', icon: '🐘', link: 'https://mongoosejs.com/' },
      { name: 'MongoDB', desc: 'NoSQL 文档型数据库，TTL 索引自动清理过期 Token', color: '#47a248', icon: '🍃', link: 'https://www.mongodb.com/' },
      { name: 'JWT', version: '^9.0', desc: '无状态 Token 鉴权，多设备并行登录', color: '#f97316', icon: '🔐', link: 'https://jwt.io/' },
      { name: 'bcryptjs', version: '^2.4', desc: '密码加盐哈希', color: '#334155', icon: '🔑' },
      { name: 'Express-Validator', version: '^7.2', desc: '请求参数校验', color: '#0ea5e9', icon: '✅', link: 'https://express-validator.github.io/' },
      { name: 'Multer', version: '^1.4', desc: '文件上传中间件', color: '#a855f7', icon: '📤' },
      { name: 'Aliyun OSS SDK', version: '^6.21', desc: '阿里云 OSS 中转上传。Bucket: ai-agent-cover (region: oss-cn-hangzhou)。封面图存 blog/covers/，头像存 avatars/。后端中转签名，前端不直传暴露 Key', color: '#ff6a00', icon: '☁️', link: 'https://help.aliyun.com/zh/oss/developer-reference/node' },
      { name: 'svg-captcha', version: '^1.4', desc: '开发环境可选的图形验证码', color: '#6366f1', icon: '🧩' },
      { name: 'cors', version: '^2.8', desc: '跨域资源共享', color: '#0d9488', icon: '🌍' },
      { name: 'dotenv', version: '^16.4', desc: '环境变量加载', color: '#facc15', icon: '⚙️' },
    ],
  },
  {
    key: 'ai',
    title: 'AI 大模型 · 百炼',
    subtitle: '阿里云百炼平台，OpenAI 兼容端点 + SSE 流式',
    accent: '#8b5cf6',
    items: [
      {
        name: 'qwen-plus',
        desc: '主力客服与知识问答模型，中文表现稳健、速度与成本平衡',
        color: '#6d28d9',
        icon: '🧠',
        link: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
      },
      {
        name: 'qwen3.7-plus',
        desc: '默认 AI 写作助手模型，输出 Markdown 文章、速度与文笔兼顾',
        color: '#7c3aed',
        icon: '✍️',
        link: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
      },
      {
        name: 'qwen3.8-max',
        desc: '长文/深度写作场景，结构化强、质量高，但速度较慢',
        color: '#4c1d95',
        icon: '🌟',
        link: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
      },
      {
        name: 'qwen3.8-flash',
        desc: '极速轻量模型，适合生成提纲、润色等低成本任务',
        color: '#a78bfa',
        icon: '⚡',
        link: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
      },
      {
        name: 'DashScope',
        desc: '阿里云百炼 API 平台，OpenAI 兼容端点 /compatible-mode/v1',
        color: '#ff6a00',
        icon: '🌀',
        link: 'https://help.aliyun.com/zh/model-studio/',
      },
      {
        name: 'SSE 流式协议',
        desc: 'text/event-stream，边生成边展示，用户无需等待',
        color: '#0ea5e9',
        icon: '🌊',
      },
    ],
  },
  {
    key: 'infra',
    title: '基础设施 & 工程化',
    subtitle: '本地开发、部署与团队协作',
    accent: '#0ea5e9',
    items: [
      { name: 'pnpm Workspace', version: '≥10', desc: 'Monorepo 包管理器，子项目隔离', color: '#f69220', icon: '📦', link: 'https://pnpm.io/' },
      { name: 'Git', desc: '分布式版本控制', color: '#f05032', icon: '🌿' },
      { name: 'VS Code', desc: '开发编辑器', color: '#007acc', icon: '🖥️', link: 'https://code.visualstudio.com/' },
      { name: 'Compass / Studio 3T', desc: 'MongoDB 可视化管理工具', color: '#47a248', icon: '🔍' },
      { name: 'PowerShell', desc: 'Windows 环境脚本执行', color: '#5391fe', icon: '💻' },
    ],
  },
];
