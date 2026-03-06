'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, CreditCard, Loader2, Sparkles, Star, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useLang } from '@/lib/i18n'

type Txn = { id: string; amount: number; type: string; note: string | null; created_at: string }
type PackageId = '1000' | '3000' | '7000'

function CreditsPageInner() {
  const searchParams = useSearchParams()
  const { t } = useLang()

  const [balance, setBalance] = useState<number | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [payingPkg, setPayingPkg] = useState<PackageId | null>(null)
  const [payError, setPayError] = useState('')

  const payStatus = searchParams.get('pay')

  const typeLabels = useMemo<Record<string, string>>(
    () => ({
      welcome_bonus: t('credits_type_welcome_bonus'),
      artifact_approved: t('credits_type_artifact_approved'),
      feedback_adopted: t('credits_type_feedback_adopted'),
      admin_grant: t('credits_type_admin_grant'),
      purchase: t('credits_type_purchase'),
      refund: t('credits_type_refund'),
      gen_flashcards: t('credits_type_gen_flashcards'),
      gen_quiz: t('credits_type_gen_quiz'),
      gen_summary: t('credits_type_gen_summary'),
      gen_outline: t('credits_type_gen_outline'),
      gen_plan: t('credits_type_gen_plan'),
      gen_ask: t('credits_type_gen_ask'),
      unlock_upload: t('credits_type_unlock_upload'),
      unlock_all: t('credits_type_unlock_all'),
    }),
    [t]
  )

  const packages: Array<{
    id: PackageId
    name: string
    tag: string
    price: string
    desc: string
    bullets: string[]
    highlight?: boolean
  }> = [
    {
      id: '1000',
      name: t('credits_pack_a_name'),
      tag: t('credits_pack_a_tag'),
      price: t('credits_pack_a_price'),
      desc: t('credits_pack_a_desc'),
      bullets: [t('credits_pack_a_b1'), t('credits_pack_a_b2'), t('credits_pack_a_b3')],
    },
    {
      id: '3000',
      name: t('credits_pack_b_name'),
      tag: t('credits_pack_b_tag'),
      price: t('credits_pack_b_price'),
      desc: t('credits_pack_b_desc'),
      bullets: [t('credits_pack_b_b1'), t('credits_pack_b_b2'), t('credits_pack_b_b3')],
      highlight: true,
    },
    {
      id: '7000',
      name: t('credits_pack_c_name'),
      tag: t('credits_pack_c_tag'),
      price: t('credits_pack_c_price'),
      desc: t('credits_pack_c_desc'),
      bullets: [t('credits_pack_c_b1'), t('credits_pack_c_b2'), t('credits_pack_c_b3')],
    },
  ]

  const load = useCallback(async () => {
    try {
      const [bal, list] = await Promise.all([api.credits.balance(), api.credits.transactions()])
      setBalance(bal.balance)
      setTxns(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCheckout(pkg: PackageId) {
    setPayingPkg(pkg)
    setPayError('')
    try {
      const origin = window.location.origin
      const { checkout_url } = await api.credits.checkout(`${origin}/credits?pay=success`, `${origin}/credits?pay=cancel`, pkg)
      window.location.href = checkout_url
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : 'Checkout failed.')
      setPayingPkg(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-y-auto px-5 py-8 sm:px-6 lg:py-10">
      <section className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/58">
              <CreditCard className="h-3.5 w-3.5 text-[#c8a55a]" />
              {t('credits_badge')}
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white">{t('credits_title')}</h1>
            <p className="mt-4 max-w-[680px] text-base leading-8 text-white/52">{t('credits_sub')}</p>
          </div>

          <div className="min-w-[250px] rounded-[26px] border border-[#c8a55a]/20 bg-[#c8a55a]/8 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.18em] text-white/32">{t('credits_balance_label')}</p>
            {loading ? (
              <Loader2 className="mt-4 h-7 w-7 animate-spin text-[#c8a55a]" />
            ) : (
              <div className="mt-4 flex items-end gap-3">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-white">{balance ?? 0}</span>
                <span className="pb-2 text-sm font-medium uppercase tracking-[0.2em] text-[#e6cf98]">{t('credits_balance_unit')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {payStatus === 'success' ? (
            <div className="flex items-start gap-3 rounded-[20px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-4 text-sm text-emerald-200/88">
              <CheckCircle className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">{t('credits_success_title')}</p>
                <p className="mt-1 text-emerald-100/64">{t('credits_success_desc')}</p>
              </div>
            </div>
          ) : null}

          {payStatus === 'cancel' ? (
            <div className="flex items-start gap-3 rounded-[20px] border border-red-400/18 bg-red-500/8 px-4 py-4 text-sm text-red-200/88">
              <XCircle className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">{t('credits_cancel_title')}</p>
                <p className="mt-1 text-red-100/64">{t('credits_cancel_desc')}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">{t('credits_packages_title')}</h2>
        <p className="mt-1 text-sm text-white/42">{t('credits_packages_sub')}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {packages.map((pkg) => (
            <article
              key={pkg.id}
              className="rounded-[28px] border bg-white/[0.03] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.2)]"
              style={{
                borderColor: pkg.highlight ? 'rgba(200,165,90,0.28)' : 'rgba(255,255,255,0.08)',
                background: pkg.highlight ? 'linear-gradient(180deg, rgba(200,165,90,0.08), rgba(255,255,255,0.03))' : 'rgba(255,255,255,0.03)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/58">
                  {pkg.tag}
                </span>
                {pkg.highlight ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#c8a55a]/30 bg-[#c8a55a]/14 px-2.5 py-1 text-[11px] font-semibold text-[#e6cf98]">
                    <Star className="h-3 w-3" />
                    {t('credits_popular')}
                  </span>
                ) : null}
              </div>

              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">{pkg.name}</h3>
              <p className="mt-2 text-sm text-white/46">{pkg.desc}</p>
              <p className="mt-4 text-xl font-semibold text-[#f1ddb1]">{pkg.price}</p>

              <ul className="mt-4 space-y-2 text-sm text-white/72">
                {pkg.bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#c8a55a] opacity-80" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout(pkg.id)}
                disabled={payingPkg !== null}
                className="btn-gold mt-5 flex w-full items-center justify-center gap-2 py-3 text-sm"
              >
                {payingPkg === pkg.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('credits_cta_buying')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t('credits_cta_buy')}
                  </>
                )}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-4 space-y-1.5 text-xs text-white/34">
          <p>{t('credits_hint_fx')}</p>
          <p>{t('credits_hint_bonus')}</p>
        </div>

        {payError ? (
          <div className="mt-4 rounded-2xl border border-red-400/18 bg-red-500/8 px-4 py-3 text-sm text-red-200/88">
            {payError}
          </div>
        ) : null}
      </section>

      <section className="mt-8 rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
        <h3 className="text-lg font-semibold text-white">{t('credits_estimator_title')}</h3>
        <p className="mt-1 text-sm text-white/42">{t('credits_estimator_sub')}</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/8">
          <div className="grid grid-cols-[1.1fr_0.65fr_1.8fr] px-4 py-2.5 text-xs uppercase tracking-[0.08em] text-white/36">
            <span>{t('credits_estimator_action')}</span>
            <span>{t('credits_estimator_cost')}</span>
            <span>{t('credits_estimator_value')}</span>
          </div>
          {[
            [t('credits_estimator_item_1'), t('credits_estimator_cost_1'), t('credits_estimator_value_1')],
            [t('credits_estimator_item_2'), t('credits_estimator_cost_2'), t('credits_estimator_value_2')],
            [t('credits_estimator_item_3'), t('credits_estimator_cost_3'), t('credits_estimator_value_3')],
          ].map(([name, cost, value], idx) => (
            <div
              key={name}
              className="grid grid-cols-[1.1fr_0.65fr_1.8fr] gap-3 px-4 py-3 text-sm"
              style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-white/74">{name}</span>
              <span className="font-medium text-[#e6cf98]">{cost}</span>
              <span className="text-white/56">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
          <h4 className="text-sm font-semibold text-white">{t('credits_faq_title')}</h4>
          <p className="mt-2 text-sm text-white/58">{t('credits_faq_item_1')}</p>
          <p className="mt-1.5 text-sm text-white/58">{t('credits_faq_item_2')}</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">{t('credits_txn_title')}</h2>
        <p className="mt-1 text-sm text-white/42">{t('credits_txn_sub')}</p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#c8a55a]" />
          </div>
        ) : txns.length === 0 ? (
          <div className="mt-5 rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-16 text-center text-sm text-white/42">
            {t('credits_txn_empty')}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {txns.map((txn) => (
              <div key={txn.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-white">{typeLabels[txn.type] ?? txn.type}</p>
                  {txn.note ? <p className="mt-1 text-sm text-white/42">{txn.note}</p> : null}
                  <p className="mt-2 text-xs text-white/32">
                    {new Date(txn.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`text-lg font-semibold ${txn.amount > 0 ? 'text-emerald-300' : 'text-white/72'}`}>
                  {txn.amount > 0 ? '+' : ''}
                  {txn.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#c8a55a]" />
        </div>
      }
    >
      <CreditsPageInner />
    </Suspense>
  )
}
