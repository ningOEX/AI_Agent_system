import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: $t('page.dashboard.title'),
    },
    name: 'Dashboard',
    path: '/dashboard',
    children: [
      {
        name: 'Analytics',
        path: 'analytics',
        component: () => import('#/views/dashboard/analytics/index.vue'),
        meta: {
          affixTab: true,
          icon: 'lucide:area-chart',
          title: $t('page.dashboard.analytics'),
        },
      },
      {
        name: 'Workspace',
        path: 'workspace',
        component: () => import('#/views/dashboard/workspace/index.vue'),
        meta: {
          authority: ['admin'],
          icon: 'carbon:workspace',
          title: $t('page.dashboard.workspace'),
        },
      },
    ],
  },
  {
    meta: {
      icon: 'lucide:file-text',
      order: 10,
      title: '博客管理',
    },
    name: 'Blog',
    path: '/blog',
    children: [
      {
        name: 'BlogList',
        path: '',
        component: () => import('#/views/blog/index.vue'),
        meta: {
          icon: 'lucide:list',
          title: '文章列表',
        },
      },
      {
        name: 'BlogCreate',
        path: 'create',
        component: () => import('#/views/blog/edit.vue'),
        meta: {
          hideInMenu: true,
          // 缓存页面：切换菜单/标签页时保留已输入的内容，不重新挂载重置表单
          keepAlive: true,
          title: '新建文章',
        },
      },
      {
        name: 'BlogEdit',
        path: ':id/edit',
        component: () => import('#/views/blog/edit.vue'),
        meta: {
          hideInMenu: true,
          keepAlive: true,
          title: '编辑文章',
        },
      },
    ],
  },
  {
    meta: {
      icon: 'lucide:tags',
      order: 10.5,
      title: '分类标签',
    },
    name: 'Taxonomy',
    path: '/taxonomy',
    children: [
      {
        name: 'CategoryManage',
        path: 'category',
        component: () => import('#/views/category/index.vue'),
        meta: {
          icon: 'lucide:folder-tree',
          title: '分类管理',
        },
      },
      {
        name: 'TagManage',
        path: 'tag',
        component: () => import('#/views/tag/index.vue'),
        meta: {
          icon: 'lucide:hash',
          title: '标签管理',
        },
      },
    ],
  },
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:message-circle',
      order: 11,
      title: '评论管理',
    },
    name: 'Comment',
    path: '/comment',
    children: [
      {
        name: 'CommentList',
        path: '',
        component: () => import('#/views/comment/index.vue'),
        meta: {
          icon: 'lucide:list',
          title: '评论列表',
        },
      },
    ],
  },
  {
    name: 'Profile',
    path: '/profile',
    component: () => import('#/views/_core/profile/index.vue'),
    meta: {
      icon: 'lucide:user',
      hideInMenu: true,
      title: $t('page.auth.profile'),
    },
  },
  {
    meta: {
      icon: 'lucide:bell',
      order: 12,
      title: '通知公告',
    },
    name: 'Notification',
    path: '/notification',
    children: [
      {
        name: 'NotificationList',
        path: '',
        component: () => import('#/views/notification/index.vue'),
        meta: {
          icon: 'lucide:list',
          title: '通知列表',
        },
      },
      {
        name: 'NotificationCreate',
        path: 'create',
        component: () => import('#/views/notification/edit.vue'),
        meta: {
          authority: ['admin'],
          hideInMenu: true,
          title: '发布通知',
        },
      },
      {
        name: 'NotificationEdit',
        path: ':id/edit',
        component: () => import('#/views/notification/edit.vue'),
        meta: {
          authority: ['admin'],
          hideInMenu: true,
          title: '编辑通知',
        },
      },
    ],
  },
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:headset',
      order: 13,
      title: '智能客服',
    },
    name: 'ChatManage',
    path: '/chat',
    children: [
      {
        name: 'ChatManageIndex',
        path: '',
        component: () => import('#/views/chat/index.vue'),
        meta: {
          icon: 'lucide:message-square-more',
          title: '问答与会话',
        },
      },
    ],
  },
  {
    meta: {
      // 用户视角的反馈提交/查看入口；管理员只看「反馈处理」，不需要再提交反馈
      authority: ['user'],
      icon: 'lucide:message-square-warning',
      order: 14,
      title: '问题反馈',
    },
    name: 'Feedback',
    path: '/feedback',
    children: [
      {
        name: 'FeedbackList',
        path: '',
        component: () => import('#/views/feedback/index.vue'),
        meta: {
          icon: 'lucide:list',
          title: '我的反馈',
        },
      },
    ],
  },
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:clipboard-check',
      order: 15,
      title: '反馈处理',
    },
    name: 'FeedbackManage',
    path: '/feedback/manage',
    component: () => import('#/views/feedback/manage.vue'),
  },
  {
    // 操作留痕：所有登录用户可见（每个账号只能看到 / 管理自己的操作记录，管理员也不例外）
    meta: {
      icon: 'lucide:history',
      order: 15.5,
      title: '留痕管理',
    },
    name: 'AuditLog',
    path: '/audit',
    component: () => import('#/views/audit/index.vue'),
  },
  {
    // AI 成本统计：仅管理员可见（统计全站大模型调用量与费用）
    meta: {
      authority: ['admin'],
      icon: 'lucide:calculator',
      order: 15.7,
      title: 'AI 成本统计',
    },
    name: 'AiUsage',
    path: '/ai-usage',
    component: () => import('#/views/ai-usage/index.vue'),
  },
  {
    // 接口调用监控：仅管理员可见（全站 HTTP 请求监控 + 接口文档）
    meta: {
      authority: ['admin'],
      icon: 'lucide:activity',
      order: 15.9,
      title: '接口监控',
    },
    name: 'EndpointMonitor',
    path: '/endpoint-monitor',
    component: () => import('#/views/endpoint-monitor/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:wrench',
      order: 16,
      title: '技术栈',
    },
    name: 'TechStack',
    path: '/tech',
    component: () => import('#/views/tech/index.vue'),
  },
  {
    // 「博客前台」入口：不配置 authority，所有角色可见。
    // 点击后进入中转页，由中转页带上当前登录 token + 角色跳转到博客前台，
    // 前台拿到 token 即为登录态，评论无需二次登录；前台再按角色隐藏管理员不该看到的模块
    meta: {
      icon: 'lucide:external-link',
      order: 17,
      title: '博客前台',
    },
    name: 'BlogWeb',
    path: '/blog-web',
    component: () => import('#/views/_core/blog-web/index.vue'),
  },
];

export default routes;
