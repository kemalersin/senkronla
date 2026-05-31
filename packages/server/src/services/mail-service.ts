import nodemailer from 'nodemailer'
import type { MailConfig, MailLocale } from '../types/mail-settings.js'

export type DeveloperMailKind = 'email_verify' | 'password_reset'

interface MailTemplate {
  subject: string
  text: string
  html: string
}

const TEMPLATES: Record<MailLocale, Record<DeveloperMailKind, (link: string) => MailTemplate>> = {
  en: {
    email_verify: (link) => ({
      subject: 'Verify your developer account',
      text: `Verify your email address by opening this link:\n\n${link}\n\nIf you did not create this account, you can ignore this message.`,
      html: `<p>Verify your email address by opening this link:</p><p><a href="${link}">${link}</a></p><p>If you did not create this account, you can ignore this message.</p>`,
    }),
    password_reset: (link) => ({
      subject: 'Reset your developer password',
      text: `Reset your password by opening this link:\n\n${link}\n\nIf you did not request a reset, you can ignore this message.`,
      html: `<p>Reset your password by opening this link:</p><p><a href="${link}">${link}</a></p><p>If you did not request a reset, you can ignore this message.</p>`,
    }),
  },
  tr: {
    email_verify: (link) => ({
      subject: 'Geliştirici hesabınızı doğrulayın',
      text: `E-posta adresinizi doğrulamak için bu bağlantıyı açın:\n\n${link}\n\nBu hesabı siz oluşturmadıysanız bu mesajı yok sayabilirsiniz.`,
      html: `<p>E-posta adresinizi doğrulamak için bu bağlantıyı açın:</p><p><a href="${link}">${link}</a></p><p>Bu hesabı siz oluşturmadıysanız bu mesajı yok sayabilirsiniz.</p>`,
    }),
    password_reset: (link) => ({
      subject: 'Geliştirici şifrenizi sıfırlayın',
      text: `Şifrenizi sıfırlamak için bu bağlantıyı açın:\n\n${link}\n\nBu isteği siz yapmadıysanız bu mesajı yok sayabilirsiniz.`,
      html: `<p>Şifrenizi sıfırlamak için bu bağlantıyı açın:</p><p><a href="${link}">${link}</a></p><p>Bu isteği siz yapmadıysanız bu mesajı yok sayabilirsiniz.</p>`,
    }),
  },
}

function buildActionLink(
  mail: MailConfig,
  locale: MailLocale,
  kind: DeveloperMailKind,
  token: string,
): string {
  const base = mail.webBaseUrl.replace(/\/$/, '')
  const path =
    kind === 'email_verify'
      ? `${base}/${locale}/developer/verify?token=${encodeURIComponent(token)}`
      : `${base}/${locale}/developer/reset-password?token=${encodeURIComponent(token)}`

  return path
}

export async function sendDeveloperMail(
  mail: MailConfig,
  input: {
    to: string
    locale: MailLocale
    kind: DeveloperMailKind
    token: string
  },
): Promise<void> {
  const link = buildActionLink(mail, input.locale, input.kind, input.token)
  const template = TEMPLATES[input.locale][input.kind](link)

  const transporter = nodemailer.createTransport({
    host: mail.smtp.host,
    port: mail.smtp.port,
    secure: mail.smtp.secure,
    auth: {
      user: mail.smtp.user,
      pass: mail.smtp.password,
    },
  })

  await transporter.sendMail({
    from: mail.fromName ? `"${mail.fromName}" <${mail.from}>` : mail.from,
    to: input.to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  })
}
