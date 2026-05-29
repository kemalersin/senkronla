import { useTranslations } from 'next-intl'

export type OriginVerifyErrorState =
  | { kind: 'generic'; message: string }
  | { kind: 'verification'; origin: string; dnsHost: string; wellKnownUrl: string }

interface OperatorOriginVerifyErrorProps {
  error: OriginVerifyErrorState
}

export function OperatorOriginVerifyError({ error }: OperatorOriginVerifyErrorProps) {
  const t = useTranslations('operator')

  if (error.kind === 'generic') {
    return (
      <div className="operator-verify-error" role="alert">
        <p className="operator-verify-error-title">{t('apps.verifyFailedTitle')}</p>
        <p className="operator-verify-error-intro">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="operator-verify-error" role="alert">
      <p className="operator-verify-error-title">{t('apps.verifyFailedTitle')}</p>
      <p className="operator-verify-error-intro">
        {t('apps.verifyFailedIntro', { origin: error.origin })}
      </p>
      <ul className="operator-verify-error-steps">
        <li>
          <span className="operator-verify-error-step-label">{t('apps.verifyFailedDns')}</span>
          <code>{error.dnsHost}</code>
        </li>
        <li>
          <span className="operator-verify-error-step-label">{t('apps.verifyFailedHttps')}</span>
          <code>{error.wellKnownUrl}</code>
        </li>
      </ul>
    </div>
  )
}
