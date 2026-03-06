'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export type Lang = 'zh' | 'en'

// ── Translation dictionary ─────────────────────────────────────────────────────

const dict = {
  // Sidebar
  all_courses:    { zh: '所有课程',  en: 'All Courses'   },
  flashcards:     { zh: '闪卡',      en: 'Flashcards'    },
  quiz:           { zh: '模拟题',    en: 'Quiz'          },
  summary:        { zh: '摘要',      en: 'Summary'       },
  outline:        { zh: '大纲',      en: 'Outline'       },
  ask:            { zh: 'AI 问答',   en: 'AI Q&A'        },
  generate:       { zh: 'AI 生成',   en: 'AI Generate'   },
  history:        { zh: '历史输出',  en: 'History'       },
  files:          { zh: '文件上传',  en: 'Files'         },
  scope:          { zh: 'Scope',     en: 'Scope'         },
  dashboard:      { zh: 'Dashboard', en: 'Dashboard'     },
  my_courses:     { zh: '我的课程',  en: 'My Courses'    },
  mistakes:       { zh: '错题本',    en: 'Mistakes'      },
  logout:         { zh: '退出登录',  en: 'Logout'        },
  no_courses:     { zh: '暂无课程',  en: 'No courses'    },

  // Credits page
  credits_badge: { zh: 'Credits', en: 'Credits' },
  credits_title: { zh: '能量中心', en: 'Credit Hub' },
  credits_sub: {
    zh: '选择适合你的备考节奏，从期中突击到学期冲刺都能匹配。',
    en: 'Pick the plan that matches your prep intensity from midterm boost to finals sprint.',
  },
  credits_balance_label: { zh: '当前余额', en: 'Current Balance' },
  credits_balance_unit: { zh: '积分', en: 'credits' },
  credits_success_title: { zh: '支付成功', en: 'Payment succeeded' },
  credits_success_desc: { zh: '积分通常会在几秒内到账，如未到账请刷新页面。', en: 'Credits usually arrive in seconds. Refresh if you do not see them.' },
  credits_cancel_title: { zh: '支付已取消', en: 'Payment canceled' },
  credits_cancel_desc: { zh: '本次余额没有变化。', en: 'No balance changes were made.' },
  credits_packages_title: { zh: '充值方案', en: 'Plans' },
  credits_packages_sub: { zh: '按课程强度选择：轻量补给 / 核心进阶 / 学期通行。', en: 'Choose by workload: starter, pro, or semester pass.' },
  credits_popular: { zh: '最受欢迎', en: 'Most Popular' },
  credits_cta_buy: { zh: '立即购买', en: 'Buy Now' },
  credits_cta_buying: { zh: '正在跳转支付', en: 'Redirecting to checkout' },
  credits_cta_support: { zh: '联系支持开通', en: 'Contact Support' },
  credits_pack_a_name: { zh: '期中突击版', en: 'Mid-term Boost' },
  credits_pack_a_tag: { zh: '基础加油包', en: 'Starter Pack' },
  credits_pack_a_price: { zh: '$9.9 / 1,000 积分', en: '$9.9 / 1,000 credits' },
  credits_pack_a_desc: { zh: '适合偶尔需要解析高难度课件或生成一份模拟卷。', en: 'For occasional deep slide parsing or one mock exam generation.' },
  credits_pack_a_b1: { zh: '解锁所有 AI 模型（GPT-4o / Claude 3.5 等）', en: 'Unlock all AI models (GPT-4o / Claude 3.5, etc.)' },
  credits_pack_a_b2: { zh: '支持解析 5 份超长 PDF/PPT', en: 'Parse up to 5 long PDF/PPT files' },
  credits_pack_a_b3: { zh: '基础客服支持', en: 'Basic support' },
  credits_pack_b_name: { zh: '高分收割机', en: 'Distinction Mastery' },
  credits_pack_b_tag: { zh: '核心进阶版', en: 'Pro Plan' },
  credits_pack_b_price: { zh: '$24.9 / 3,000 积分', en: '$24.9 / 3,000 credits' },
  credits_pack_b_desc: { zh: '适合 COMP9417 / COMP9321 等重课连续备考。', en: 'Built for intensive courses like COMP9417 and COMP9321.' },
  credits_pack_b_b1: { zh: '优先算力排队，复杂公式解析更稳定', en: 'Priority compute queue for heavy formula parsing' },
  credits_pack_b_b2: { zh: '深度知识库，支持跨课程关联复习', en: 'Cross-course review with deeper knowledge linking' },
  credits_pack_b_b3: { zh: '支持解析 20+ 份资料', en: 'Parse 20+ files' },
  credits_pack_c_name: { zh: '学霸不眠夜', en: 'HD Legend' },
  credits_pack_c_tag: { zh: '终极备考季', en: 'Semester Pass' },
  credits_pack_c_price: { zh: '$49.9 / 7,000 积分', en: '$49.9 / 7,000 credits' },
  credits_pack_c_desc: { zh: '适合 Finals 全线备考与高频追问。', en: 'For full-semester finals prep and high-frequency follow-up.' },
  credits_pack_c_b1: { zh: '无限次 AI 追问（不限 Token 消耗）', en: 'Unlimited AI follow-ups (no token cap)' },
  credits_pack_c_b2: { zh: '专属考前押题增强模式', en: 'Enhanced pre-exam prediction mode' },
  credits_pack_c_b3: { zh: '离线闪卡导出（Anki 兼容）', en: 'Offline flashcard export (Anki compatible)' },
  credits_estimator_title: { zh: '我的积分能做多少事？', en: 'What Can My Credits Do?' },
  credits_estimator_sub: { zh: '以下为核心动作的标准消耗与交付价值。', en: 'Standard costs and deliverables for core actions.' },
  credits_estimator_action: { zh: '动作', en: 'Action' },
  credits_estimator_cost: { zh: '消耗', en: 'Cost' },
  credits_estimator_value: { zh: '包含价值 / 交付物', en: 'Included Value / Deliverables' },
  credits_estimator_item_1: { zh: '解锁并解析文件', en: 'Unlock + Parse File' },
  credits_estimator_cost_1: { zh: '50 积分 / 份', en: '50 credits / file' },
  credits_estimator_value_1: { zh: '解锁全文阅读 + AI 自动提取核心考点 + 生成思维导图预览', en: 'Full access + key-point extraction + mindmap preview' },
  credits_estimator_item_2: { zh: '全真模拟试题', en: 'Full Mock Exam' },
  credits_estimator_cost_2: { zh: '120 积分 / 套', en: '120 credits / set' },
  credits_estimator_value_2: { zh: '对标历年真题逻辑，生成含解析的完整考卷', en: 'Past-exam aligned full paper with explanations' },
  credits_estimator_item_3: { zh: 'AI 深度追问', en: 'AI Deep Follow-up' },
  credits_estimator_cost_3: { zh: '30 积分 / 10 次', en: '30 credits / 10 rounds' },
  credits_estimator_value_3: { zh: '围绕疑难点进行高精度、长上下文互动', en: 'High-precision long-context discussion on difficult points' },
  credits_faq_title: { zh: '算力分配参考', en: 'Compute Budget Examples' },
  credits_faq_item_1: { zh: '入门体验：$9.9（1000 积分）可深度解析约 20 份核心课件。', en: 'Starter: $9.9 (1000 credits) parses around 20 core files.' },
  credits_faq_item_2: { zh: '学霸必备：$49.9（7000 积分）可覆盖约 140 份资料，支撑整个学期模拟考与深度追问。', en: 'HD tier: $49.9 (7000 credits) covers around 140 files for semester-long mock exams and deep Q&A.' },
  credits_hint_fx: { zh: '支付支持 AUD/CNY 实时汇率转换。', en: 'Payments support real-time AUD/CNY conversion.' },
  credits_hint_bonus: { zh: '针对 UNSW CSE 学院学生，首次充值赠送 100 能量值。', en: 'UNSW CSE students get +100 bonus credits on first purchase.' },
  credits_txn_title: { zh: '积分流水', en: 'Transactions' },
  credits_txn_sub: { zh: '每一次生成、购买、退款和奖励都会记录在这里。', en: 'Every generation, purchase, refund, and reward is tracked here.' },
  credits_txn_empty: { zh: '暂无积分流水。', en: 'No transactions yet.' },
  credits_type_welcome_bonus: { zh: '新用户欢迎积分', en: 'Welcome Bonus' },
  credits_type_artifact_approved: { zh: '文件审核通过', en: 'Artifact Approved' },
  credits_type_feedback_adopted: { zh: '反馈被采纳', en: 'Feedback Adopted' },
  credits_type_admin_grant: { zh: '管理员赠送', en: 'Admin Adjustment' },
  credits_type_purchase: { zh: '积分购买', en: 'Purchase' },
  credits_type_refund: { zh: '生成失败退款', en: 'Generation Refund' },
  credits_type_gen_flashcards: { zh: '生成闪卡', en: 'Generate Flashcards' },
  credits_type_gen_quiz: { zh: '生成模拟题', en: 'Generate Quiz' },
  credits_type_gen_summary: { zh: '生成摘要', en: 'Generate Summary' },
  credits_type_gen_outline: { zh: '生成大纲', en: 'Generate Outline' },
  credits_type_gen_plan: { zh: '生成复习规划', en: 'Generate Study Plan' },
  credits_type_gen_ask: { zh: 'AI 问答', en: 'AI Q&A' },
  credits_type_unlock_upload: { zh: '文件深度解析', en: 'File Deep Parse' },
  credits_type_unlock_all: { zh: '一键深度解析', en: 'Bulk Deep Parse' },

  // Admin shell
  admin_title: { zh: '管理后台', en: 'Admin Console' },
  admin_sub: { zh: '课程 · 文件审核 · 用户 · 邀请码 · API 密钥', en: 'Courses · Artifacts · Users · Invites · API Keys' },
  admin_enter_desc: { zh: '请输入管理员密钥进入', en: 'Enter admin secret to continue' },
  admin_enter_btn: { zh: '进入管理后台', en: 'Enter Console' },
  admin_secret_ph: { zh: '管理员密钥', en: 'Admin Secret' },
  admin_logout: { zh: '退出', en: 'Sign Out' },
  admin_tab_courses: { zh: '课程管理', en: 'Courses' },
  admin_tab_artifacts: { zh: '文件审核', en: 'Artifacts' },
  admin_tab_users: { zh: '用户列表', en: 'Users' },
  admin_tab_invites: { zh: '邀请码', en: 'Invites' },
  admin_tab_api_keys: { zh: 'API 密钥', en: 'API Keys' },
  admin_tab_feedback: { zh: '用户反馈', en: 'Feedback' },
  sidebar_low_credits: { zh: '算力不足，建议先充值', en: 'Low credits, top up recommended' },

  // Page headings & subtitles
  flashcards_title: { zh: '闪卡学习', en: 'Flashcards' },
  flashcards_sub:   { zh: '记忆强化 · 错题追踪 · 随时复习', en: 'Reinforce memory · Track mistakes · Study anytime' },
  quiz_title:       { zh: '模拟题',   en: 'Practice Quiz' },
  quiz_sub:         { zh: '多选题练习 — 基于课程材料生成', en: 'MCQ practice generated from course material' },
  summary_title:    { zh: '知识摘要', en: 'Summary' },
  summary_sub:      { zh: '核心知识点提炼与结构化总结', en: 'Key knowledge points distilled from course material' },
  outline_title:    { zh: '课程大纲', en: 'Outline' },
  outline_sub:      { zh: '知识结构树与学习路径', en: 'Knowledge structure and learning path' },
  ask_title:        { zh: 'AI 问答',  en: 'AI Q&A' },
  ask_sub:          { zh: '基于课程材料的 RAG 检索问答 · 支持中英双语', en: 'RAG-powered Q&A over course material · Bilingual' },
  generate_title:   { zh: 'AI 生成',  en: 'AI Generate' },
  generate_sub:     { zh: '从课程材料自动生成学习内容', en: 'Auto-generate study content from course material' },
  files_title:      { zh: '文件上传', en: 'Files' },
  files_sub:        { zh: '上传课程材料，管理员审核通过后用于 AI 生成', en: 'Upload course material for AI generation after admin approval' },
  scope_title:      { zh: 'Scope 设置', en: 'Scope Settings' },
  scope_sub:        { zh: '选择 AI 生成时使用哪些文件', en: 'Choose which files to use for AI generation' },

  // Flashcard controls
  fc_all:       { zh: '全部',     en: 'All'      },
  fc_wrong:     { zh: '错题本',   en: 'Mistakes' },
  fc_reset:     { zh: '重置',     en: 'Reset'    },
  fc_flip:      { zh: '翻转 →',   en: 'Flip →'   },
  fc_forgot:    { zh: '✗ 没记住', en: '✗ Forgot' },
  fc_got_it:    { zh: '✓ 记住了', en: '✓ Got it' },
  fc_prev:      { zh: '← 上一张', en: '← Prev'   },
  fc_next:      { zh: '下一张 →', en: 'Next →'   },
  fc_skip:      { zh: '跳过 →',   en: 'Skip →'   },
  fc_done:      { zh: '完成 ✓',   en: 'Done ✓'   },
  fc_front:     { zh: '正面（概念）', en: 'Front (Concept)'     },
  fc_back:      { zh: '背面（定义）', en: 'Back (Definition)'   },
  fc_click_tip: { zh: '点击翻转',    en: 'Click to flip'       },
  fc_no_wrong:  { zh: '🎉 没有错题，继续保持！', en: '🎉 No mistakes, keep it up!' },
  fc_pending:   { zh: '道错题待复习', en: 'mistakes pending'    },

  // Bilingual toggle
  bi_full: { zh: '中/EN',  en: '中/EN'  },
  bi_zh:   { zh: '中文',   en: 'Chinese' },
  bi_en:   { zh: 'English', en: 'English' },

  // Generate tab
  gen_summary:      { zh: '知识摘要', en: 'Summary'     },
  gen_quiz:         { zh: '模拟题目', en: 'Quiz'         },
  gen_outline:      { zh: '课程大纲', en: 'Outline'      },
  gen_flashcards:   { zh: '生成闪卡', en: 'Flashcards'   },
  gen_desc_summary:    { zh: '提炼核心知识点，生成结构化总结',   en: 'Extract key knowledge as structured summary'    },
  gen_desc_quiz:       { zh: '基于内容生成多选题练习',          en: 'Generate MCQ practice from content'            },
  gen_desc_outline:    { zh: '生成知识树和学习大纲',            en: 'Create knowledge tree and study outline'       },
  gen_desc_flashcards: { zh: '自动生成知识卡片和选择题闪卡',    en: 'Auto-generate knowledge cards and MCQ flashcards' },
  gen_scope:        { zh: '使用 Scope Set', en: 'Scope Set'     },
  gen_new_scope:    { zh: '+ 新建 Scope',   en: '+ New Scope'   },
  gen_num_q:        { zh: '题目数量',       en: 'No. of questions' },
  gen_btn:          { zh: '开始生成',       en: 'Start Generating' },
  gen_loading:      { zh: 'AI 生成中（30–60 秒）...', en: 'AI generating (30–60s)...' },
  gen_no_files:     { zh: '⚠️ 暂无已通过的文件，请先上传并等待审核', en: '⚠️ No approved files. Upload and wait for admin review.' },
  gen_done_prefix:  { zh: '✅ 生成完成！前往', en: '✅ Done! Go to'  },
  gen_done_suffix:  { zh: '查看',            en: 'to view →'       },
  gen_scope_name:   { zh: 'Scope 名称',      en: 'Scope name'      },
  gen_scope_ph:     { zh: '例如：期中考试范围', en: 'e.g. Midterm scope' },
  gen_create:       { zh: '创建',  en: 'Create' },
  gen_cancel:       { zh: '取消',  en: 'Cancel' },
  gen_scope_files:  { zh: '选择包含的文件（可选）', en: 'Select files (optional)' },

  // Ask tab
  ask_scope_label: { zh: '知识范围：', en: 'Scope:' },
  ask_no_files:    { zh: '⚠️ 暂无已通过文件，AI 问答需要课程材料作为知识库', en: '⚠️ No approved files. AI Q&A needs course material as knowledge base.' },
  ask_thinking:    { zh: '思考中...',  en: 'Thinking...'  },
  ask_sources:     { zh: '📎 参考来源：', en: '📎 Sources:' },
  ask_placeholder: { zh: '输入问题，例如：什么是卷积神经网络？', en: 'Ask a question, e.g. What is a convolutional neural network?' },
  ask_empty_msg:   { zh: '输入问题，AI 将从课件中检索并作答', en: 'Ask a question. AI will search through course files.' },

  // Files tab
  files_drag:      { zh: '拖拽文件到此处，或点击选择', en: 'Drag & drop here, or click to select' },
  files_hint:      { zh: '支持 PDF / Word / Python / TXT / Jupyter · 上传后需管理员审核', en: 'PDF / Word / Python / TXT / Jupyter · Requires admin review' },
  files_uploading: { zh: '上传中...',  en: 'Uploading...'  },
  files_approved:  { zh: '已通过',    en: 'Approved'      },
  files_rejected:  { zh: '已拒绝',    en: 'Rejected'      },
  files_pending:   { zh: '待审核',    en: 'Pending'       },
  files_empty:     { zh: '还没有文件', en: 'No files yet'  },

  // Scope tab
  scope_current:    { zh: '当前 Scope：',   en: 'Current Scope:' },
  scope_default:    { zh: '(默认)',         en: '(default)'      },
  scope_sel_files:  { zh: '选择包含的文件', en: 'Select included files' },
  scope_save:       { zh: '保存 Scope',    en: 'Save Scope'    },
  scope_saving:     { zh: '保存中...',     en: 'Saving...'     },
  scope_selected:   { zh: '已选',         en: 'Selected'      },
  scope_no_files:   { zh: '请先上传文件',  en: 'Upload files first' },

  // Empty states
  empty_fc:       { zh: '还没有闪卡',    en: 'No flashcards yet'  },
  empty_fc_btn:   { zh: '去 AI 生成闪卡', en: 'Generate Flashcards' },
  empty_quiz:     { zh: '还没有模拟题',   en: 'No quiz yet'         },
  empty_quiz_btn: { zh: '去 AI 生成模拟题', en: 'Generate Quiz'      },
  empty_summary:     { zh: '还没有知识摘要', en: 'No summary yet'    },
  empty_summary_btn: { zh: '去 AI 生成摘要', en: 'Generate Summary'  },
  empty_outline:     { zh: '还没有课程大纲', en: 'No outline yet'    },
  empty_outline_btn: { zh: '去 AI 生成大纲', en: 'Generate Outline'  },

  // History tab
  history_title: { zh: '历史输出',   en: 'History'              },
  history_sub:   { zh: '查看所有 AI 生成记录', en: 'Browse all AI-generated outputs' },
  history_all:   { zh: '全部记录',   en: 'All records'          },
  history_empty: { zh: '还没有生成记录', en: 'No generation records yet' },
  history_hint:  { zh: '前往「AI 生成」生成内容', en: 'Go to AI Generate to create content' },

  // Common
  loading:    { zh: '加载中...', en: 'Loading...'    },
  course_404: { zh: '课程不存在', en: 'Course not found' },
  no_content: { zh: '无内容',    en: 'No content'      },
  view_file:  { zh: '查看文件',  en: 'View file'       },
  save_err:   { zh: '保存失败',  en: 'Save failed'     },
  upload_err: { zh: '上传失败',  en: 'Upload failed'   },
  gen_err:    { zh: '生成失败，请检查 API Key 配置', en: 'Generation failed. Check API Key config.' },
} as const

export type TranslationKey = keyof typeof dict

// ── Context ───────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
}

const LangCtx = createContext<LangContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: (k) => dict[k].zh,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh')

  useEffect(() => {
    const saved = localStorage.getItem('ui_lang')
    if (saved === 'zh' || saved === 'en') setLangState(saved)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('ui_lang', l)
  }

  const t = (key: TranslationKey): string => dict[key][lang]

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>
}

export function useLang() {
  return useContext(LangCtx)
}
