import nodemailer from 'nodemailer'
import type { MailConfig, MailLocale } from '../types/mail-settings.js'
import {
  buildDeveloperMailTemplate,
  type DeveloperMailKind,
} from './mail-templates.js'

export type { DeveloperMailKind }

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
  const template = buildDeveloperMailTemplate({
    locale: input.locale,
    kind: input.kind,
    link,
    brandName: mail.fromName || 'Senkronla',
    webBaseUrl: mail.webBaseUrl,
  })

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
