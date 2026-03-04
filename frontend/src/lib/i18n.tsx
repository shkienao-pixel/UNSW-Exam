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
