import type { MailLocale } from '../types/mail-settings.js'

export type DeveloperMailKind = 'email_verify' | 'password_reset'

/** Light-theme tokens aligned with apps/web globals.css */
const COLORS = {
  bg: '#f8f7f4',
  card: '#ffffff',
  band: '#f0efe9',
  border: '#dfe3ea',
  text: '#1b2330',
  muted: '#5a6578',
  accent: '#0b7a71',
  accentDim: '#096860',
} as const

interface MailCopy {
  subject: string
  preheader: string
  heading: string
  body: string
  cta: string
  fallback: string
  disclaimer: string
  footer: string
}

const COPY: Record<MailLocale, Record<DeveloperMailKind, MailCopy>> = {
  en: {
    email_verify: {
      subject: 'Verify your developer account',
      preheader: 'Confirm your email to sign in to the developer portal.',
      heading: 'Verify your email',
      body: 'Thanks for registering with the developer portal. Confirm your email address to sign in and manage your applications.',
      cta: 'Verify email',
      fallback: 'If the button does not work, copy and paste this link into your browser:',
      disclaimer: 'If you did not create this account, you can ignore this message.',
      footer: 'Developer portal',
    },
    password_reset: {
      subject: 'Reset your developer password',
      preheader: 'Use this link to choose a new password for your developer account.',
      heading: 'Reset your password',
      body: 'We received a request to reset the password for your developer account. Choose a new password using the button below.',
      cta: 'Reset password',
      fallback: 'If the button does not work, copy and paste this link into your browser:',
      disclaimer: 'If you did not request a reset, you can ignore this message. Your password will stay the same.',
      footer: 'Developer portal',
    },
  },
  tr: {
    email_verify: {
      subject: 'Geliştirici hesabınızı doğrulayın',
      preheader: 'Geliştirici portalına giriş yapmak için e-postanızı onaylayın.',
      heading: 'E-postanızı doğrulayın',
      body: 'Geliştirici portalına kaydolduğunuz için teşekkürler. Giriş yapıp uygulamalarınızı yönetmek için e-posta adresinizi onaylayın.',
      cta: 'E-postayı doğrula',
      fallback: 'Düğme çalışmazsa bu bağlantıyı kopyalayıp tarayıcınıza yapıştırın:',
      disclaimer: 'Bu hesabı siz oluşturmadıysanız bu mesajı yok sayabilirsiniz.',
      footer: 'Geliştirici portalı',
    },
    password_reset: {
      subject: 'Geliştirici şifrenizi sıfırlayın',
      preheader: 'Geliştirici hesabınız için yeni bir parola belirlemek üzere bu bağlantıyı kullanın.',
      heading: 'Parolanızı sıfırlayın',
      body: 'Geliştirici hesabınız için parola sıfırlama isteği aldık. Aşağıdaki düğmeyi kullanarak yeni bir parola belirleyin.',
      cta: 'Parolayı sıfırla',
      fallback: 'Düğme çalışmazsa bu bağlantıyı kopyalayıp tarayıcınıza yapıştırın:',
      disclaimer: 'Bu isteği siz yapmadıysanız bu mesajı yok sayabilirsiniz. Parolanız değişmeyecektir.',
      footer: 'Geliştirici portalı',
    },
  },
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderLogo(brandName: string): string {
  const normalized = brandName.trim().toLowerCase()
  if (normalized === 'senkronla') {
    return `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.text};">senkron<span style="color:${COLORS.accent};">la</span></span>`
  }

  return `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.text};">${escapeHtml(brandName)}</span>`
}

function renderHtml(input: {
  copy: MailCopy
  link: string
  brandName: string
  webBaseUrl: string
}): string {
  const { copy, link, brandName, webBaseUrl } = input
  const safeLink = escapeHtml(link)
  const safeBrand = escapeHtml(brandName)
  const safeWebBaseUrl = escapeHtml(webBaseUrl.replace(/\/$/, ''))

  return `<!DOCTYPE html>
<html lang="und">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(copy.subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};color:${COLORS.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              ${renderLogo(brandName)}
            </td>
          </tr>
          <tr>
            <td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:28px 28px 24px;box-shadow:0 1px 2px rgba(27,35,48,0.06);">
              <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${COLORS.text};">${escapeHtml(copy.heading)}</h1>
              <p style="margin:0 0 24px;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:${COLORS.muted};">${escapeHtml(copy.body)}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="border-radius:12px;background-color:${COLORS.accent};">
                    <a href="${safeLink}" style="display:inline-block;padding:12px 24px;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(copy.cta)}</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
                <tr>
                  <td style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(copy.fallback)}</p>
              <p style="margin:0;font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.55;word-break:break-all;">
                <a href="${safeLink}" style="color:${COLORS.accent};text-decoration:underline;">${safeLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;">
              <p style="margin:0 0 8px;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(copy.disclaimer)}</p>
              <p style="margin:0;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:${COLORS.muted};">
                <a href="${safeWebBaseUrl}" style="color:${COLORS.accent};text-decoration:none;">${safeBrand}</a>
                · ${escapeHtml(copy.footer)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderText(copy: MailCopy, link: string, brandName: string): string {
  return `${copy.heading}

${copy.body}

${copy.cta}:
${link}

${copy.fallback}
${link}

${copy.disclaimer}

—
${brandName} · ${copy.footer}`
}

export function buildDeveloperMailTemplate(input: {
  locale: MailLocale
  kind: DeveloperMailKind
  link: string
  brandName: string
  webBaseUrl: string
}): { subject: string; text: string; html: string } {
  const copy = COPY[input.locale][input.kind]
  const brandName = input.brandName.trim() || 'Senkronla'

  return {
    subject: copy.subject,
    text: renderText(copy, input.link, brandName),
    html: renderHtml({
      copy,
      link: input.link,
      brandName,
      webBaseUrl: input.webBaseUrl,
    }),
  }
}
