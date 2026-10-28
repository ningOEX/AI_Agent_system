import { requestClient } from './request';

export interface DashboardStats {
  overview: {
    blogs: number;
    publishedBlogs: number;
    views: number;
    comments: number;
    pendingComments: number;
    approvedComments: number;
    users: number;
    chats: number;
    pendingChats: number;
    faqs: number;
    notifications: number;
  };
  today: {
    blogs: number;
    comments: number;
    chats: number;
  };
  trend: {
    date: string;
    blogs: number;
    comments: number;
    chats: number;
  }[];
  categories: { name: string; value: number }[];
  topBlogs: {
    _id: string;
    title: string;
    views: number;
    category: string;
    featured: boolean;
    status: string;
    publishedAt?: string;
  }[];
  recentComments: {
    _id: string;
    nickname: string;
    content: string;
    status: string;
    createdAt: string;
    blogTitle: string;
  }[];
  recentSessions: {
    sessionId: string;
    unhandled: boolean;
    messageCount: number;
    lastMessage: string;
    lastMessageAt: string;
  }[];
  recentBlogs: {
    _id: string;
    title: string;
    category: string;
    status: string;
    views: number;
    createdAt: string;
  }[];
}

/** 普通用户的个人创作统计（只含自己名下文章及其评论） */
export interface PersonalStats {
  overview: {
    blogs: number;
    publishedBlogs: number;
    drafts: number;
    scheduled: number;
    views: number;
    comments: number;
    pendingComments: number;
    approvedComments: number;
  };
  today: {
    blogs: number;
    comments: number;
  };
  trend: {
    date: string;
    blogs: number;
    comments: number;
  }[];
  categories: { name: string; value: number }[];
  topBlogs: DashboardStats['topBlogs'];
  recentComments: DashboardStats['recentComments'];
  recentBlogs: DashboardStats['recentBlogs'];
}

export function getDashboardStatsApi() {
  return requestClient.get<DashboardStats>('/stats/dashboard');
}

export function getPersonalStatsApi() {
  return requestClient.get<PersonalStats>('/stats/personal');
}
