import Faq from '../models/Faq.js';

/** 首次启动时补一批默认高频问答（已存在则跳过，避免覆盖后台修改） */
export async function seedFaq() {
  try {
    const count = await Faq.countDocuments();
    if (count > 0) return;

    await Faq.insertMany([
      {
        question: '怎么在你们平台发布文章？',
        answer:
          '登录管理后台（http://localhost:5666），进入左侧「博客管理」→「新建文章」，填写标题、分类、摘要与正文后保存即可。管理员可额外设置「精选文章」。',
        category: '使用指南',
        keywords: ['发布', '写文章', '投稿', '新建文章', '发文章'],
        followUps: ['文章支持哪些状态？', '封面图怎么上传？'],
        order: 1,
      },
      {
        question: '文章支持哪些发布状态？',
        answer:
          '共有三种：草稿（仅自己可见）、已发布（前台可访问）、定时发布（到设定时间自动上线）。在编辑页顶部选择即可。',
        category: '使用指南',
        keywords: ['草稿', '定时发布', '状态', '已发布'],
        followUps: ['怎么设置定时发布？'],
        order: 2,
      },
      {
        question: '评论提交后为什么看不到？',
        answer:
          '为保证内容质量，所有评论需要管理员审核通过后才会展示。提交后会提示「等待审核」，通常在一天内处理完成。',
        category: '评论',
        keywords: ['评论', '审核', '看不到', '没显示', '评论不显示'],
        followUps: ['评论需要登录吗？'],
        order: 3,
      },
      {
        question: '评论需要登录吗？',
        answer:
          '需要。请先登录管理后台账号，再回到文章页发表评论；昵称会自动使用你的账号名，无需重复填写。',
        category: '评论',
        keywords: ['登录', '评论登录', '匿名', '昵称'],
        followUps: [],
        order: 4,
      },
      {
        question: '支持深色模式和主题切换吗？',
        answer:
          '支持。前台右上角可切换 5 套主题色（靛蓝、翡翠、琥珀、玫红、石墨）与深/浅色模式，选择会保存在本地，下次访问自动生效。',
        category: '外观',
        keywords: ['主题', '深色', '暗色', '皮肤', '配色'],
        followUps: [],
        order: 5,
      },
      {
        question: '怎么联系管理员？',
        answer:
          '可以在文章下方评论区留言（需登录），或直接发送邮件给站点管理员。涉及账号权限、内容合作等问题建议直接说明来意。',
        category: '通用',
        keywords: ['联系', '管理员', '客服', '邮箱', '合作'],
        followUps: [],
        order: 6,
      },
    ]);
    console.log('[seed] 已初始化默认客服问答 6 条');
  } catch (err) {
    console.error('[seed] FAQ 初始化失败:', err.message);
  }
}
