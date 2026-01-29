import sgMail from '@sendgrid/mail'
import fs from 'fs'
import path from 'path'

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourdomain.com'

// Debug: Log the FROM_EMAIL on module load

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

// Save email to local file for development preview
function saveEmailForPreview(email: EmailOptions & { from: string }) {
  try {
    const emailsDir = path.join(process.cwd(), '.dev-emails')
    
    if (!fs.existsSync(emailsDir)) {
      fs.mkdirSync(emailsDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${timestamp}_${email.to.replace('@', '_at_').replace(/[^a-zA-Z0-9_-]/g, '_')}`
    
    const htmlPath = path.join(emailsDir, `${filename}.html`)
    const jsonPath = path.join(emailsDir, `${filename}.json`)
    
    // Save HTML version
    fs.writeFileSync(htmlPath, email.html)
    
    // Save metadata
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        to: email.to,
        from: email.from,
        subject: email.subject,
        timestamp: new Date().toISOString(),
        textPreview: email.text?.substring(0, 200)
      }, null, 2)
    )

  } catch (error) {
  }
}

export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<boolean> {
  try {
    // If no API key, save for local preview
    if (!process.env.SENDGRID_API_KEY) {
      
      saveEmailForPreview({ to, subject, html, text, from: FROM_EMAIL })
      return true
    }
    await sgMail.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text: text || '',
    })
    return true
    
  } catch (error) {
    return false
  }
}

// Batch send emails (SendGrid supports up to 1000 personalized emails per request)
export async function sendBatchEmails(
  emails: Array<{ to: string; subject: string; html: string; text?: string }>
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0
  let failed = 0
  const errors: string[] = []

  // If no API key, save for local preview
  if (!process.env.SENDGRID_API_KEY) {
    
    emails.forEach((email, i) => {
      saveEmailForPreview({ ...email, from: FROM_EMAIL })
    })
    
    
    return { success: emails.length, failed: 0, errors: [] }
  }


  
  if (emails.length === 0) {
    return { success: 0, failed: 0, errors: [] }
  }

  // Send in batches of 10 to avoid rate limits
  const batchSize = 10
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    
    const results = await Promise.allSettled(
      batch.map(email =>
        sgMail.send({
          from: FROM_EMAIL,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text || '',
        })
      )
    )

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        success++
      } else {
        const errorMsg = result.reason?.response?.body?.errors?.[0]?.message 
          || result.reason?.message 
          || String(result.reason)
        errors.push(`${batch[idx].to}: ${errorMsg}`)
        failed++
      }
    })

    // Small delay between batches to respect rate limits
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return { success, failed, errors }
}

// Password reset email function removed - using Google-only authentication

// Weekly Reminder Email Template (Friday - if user hasn't logged 40 hours)
export function generateWeeklyReminderEmail(
  firstName: string,
  hoursLogged: number,
  targetHours: number,
  weekStart: string,
  weekEnd: string,
  dashboardUrl: string
): { html: string; text: string } {

  const baseUrl = dashboardUrl.replace(/\/(admin|dashboard)$/, '')
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Time Tracking Reminder</title>
        <style>
            body, table, td, p, a {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
            }
            body {
                background-color: #fff8f1;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1d1e1c;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            @media only screen and (max-width: 600px) {
                .email-container { padding: 20px 10px; }
                .content-wrapper { padding: 30px 20px; }
                .heading { font-size: 20px; }
                .body-text { font-size: 15px; }
                .button { display: block; text-align: center; padding: 14px 24px; }
            }
        </style>
    </head>
    <body>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8f1;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 550px; border-radius: 8px;">
                        <tr>
                            <td style="padding: 40px;">
                                <!-- Logo -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" style="padding-bottom: 30px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" valign="middle" style="padding-right: 8px;">
                                                        <img src="${baseUrl}/aseets/logo.png" alt="MD Hourlog" width="160" style="display: block; border: 0;" />
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Main Heading -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 14px;">
                                            <h1 class="heading" style="font-size: 24px; font-weight: 700; color: #1d1e1c; margin: 0; line-height: 1.3;">
                                                ${firstName}, it's almost time to track your time.
                                            </h1>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Body Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 10px;">
                                            <p class="body-text" style="font-size: 16px; color: #1d1e1c; margin: 0; line-height: 1.6;">
                                                This is a reminder that your timesheets are due by 5:00pm on Fridays. Please take a moment to enter your time for the week of ${weekStart}.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding: 12px 0;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" style="background-color: #3C9A46; border-radius: 6px;">
                                                        <a href="${dashboardUrl}" class="button" style="display: inline-block; background-color: #3C9A46; color: #FFFFFF; text-decoration: none; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                                            Track time
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Footer Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-top: 12px;">
                                            <p class="footer-text" style="font-size: 14px; color: #1d1e1c; margin: 0 0 16px 0; line-height: 1.6;">
                                                You're receiving this email because timesheet reminders are enabled for your account. If you'd prefer not to get these reminders, <a href="${dashboardUrl}/settings" class="footer-link" style="color: #1d1e1c; text-decoration: underline;">update your notification settings</a>.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `

  const text = `
${firstName}, it's almost time to track your time.

This is a reminder that your timesheets are due by 5:00pm on Fridays. Please take a moment to enter your time for the week of ${weekStart}.

Track time: ${dashboardUrl}

---
MD Hourlog
  `

  return { html, text }
}

// Weekly Report Email Template (Monday - previous week summary)
export function generateWeeklyReportEmail(
  firstName: string,
  weekStart: string,
  weekEnd: string,
  totalHours: number,
  dailyHours: Array<{ day: string; hours: number }>,
  dashboardUrl: string,
  billableHours: number = 0,
  nonBillableHours: number = 0,
  capacity: number = 40
): { html: string; text: string } {
  // Count days with tracked time
  const daysTracked = dailyHours.filter(d => d.hours > 0).length
  
  // Calculate percentages for the progress bar
  const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
  const nonBillablePercent = totalHours > 0 ? (nonBillableHours / totalHours) * 100 : 0

  // Generate daily breakdown rows (show all days, style 0 hours differently)
  const dailyRows = dailyHours
    .map(d => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: ${d.hours > 0 ? '#1a1a1a' : '#999'};">${d.day}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; color: ${d.hours > 0 ? '#1a1a1a' : '#999'};">${d.hours > 0 ? d.hours.toFixed(1) + 'h' : '0h'}</td>
      </tr>
    `)
    .join('')

  const dailyTextRows = dailyHours
    .map(d => `  ${d.day}: ${d.hours > 0 ? d.hours.toFixed(1) + 'h' : '0h'}`)
    .join('\n')

  const baseUrl = dashboardUrl.replace(/\/(admin|dashboard)$/, '')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Weekly Time Report</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #faf8f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #faf8f5;">
        <tr>
          <td style="padding: 40px 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
              <!-- Logo -->
              <tr>
                <td style="padding-bottom: 40px;">
                  <img src="${baseUrl}/aseets/logo.png" alt="MD Hourlog" width="160" style="display: block; border: 0;" />
                </td>
              </tr>
              <!-- Heading -->
              <tr>
                <td style="padding-bottom: 8px;">
                  <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #1a1a1a; line-height: 1.2;">Your Weekly <span style="background-color: #fef3c7; padding: 0 4px;">MD Hourlog</span> Report</h1>
                </td>
              </tr>
              <!-- Date Range -->
              <tr>
                <td style="padding-bottom: 32px;">
                  <p style="margin: 0; font-size: 20px; color: #1a1a1a;">${weekStart} – ${weekEnd}</p>
                </td>
              </tr>
              <!-- Celebration Message -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <p style="margin: 0; font-size: 18px; color: #1a1a1a; line-height: 1.6;">
                    🎉 <strong>You did it!</strong> You tracked time ${daysTracked} day${daysTracked !== 1 ? 's' : ''} last week!
                    <a href="${dashboardUrl}" style="color: #1a1a1a; text-decoration: underline;">Head to your timesheet</a> to keep it going.
                  </p>
                </td>
              </tr>
              <!-- Hours Summary Stats -->
              <tr>
                <td style="padding-bottom: 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FFFFFF; border-radius: 8px; padding: 24px; margin-bottom: 20px;">
                    <tr>
                      <td>
                        <h2 style="font-size: 18px; font-weight: 700; color: #1D1E1C; margin: 0 0 16px 0;">
                          <span>${totalHours.toFixed(2)} Total hours</span>
                          <span style="font-size: 14px; color: #666666; float: right;">Capacity ${capacity.toFixed(2)}</span>
                        </h2>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <!-- Progress Bar - Table based for email compatibility -->
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #E5E5E5; border-radius: 4px; height: 24px; margin: 16px 0;">
                          <tr>
                            <td width="${billablePercent}%" style="background-color: #2563EB; height: 24px; border-radius: ${nonBillablePercent > 0 ? '4px 0 0 4px' : '4px'};"></td>
                            <td width="${nonBillablePercent}%" style="background-color: #93C5FD; height: 24px; border-radius: ${billablePercent > 0 ? '0 4px 4px 0' : '4px'};"></td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <!-- Legend - Table based for email compatibility -->
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
                          <tr>
                            <td style="padding-bottom: 8px;">
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td width="1%" valign="middle" style="padding-right: 4px;">
                                    <span style="width: 12px; height: 12px; background-color: #2563EB; border-radius: 2px; display: inline-block;"></span>
                                  </td>
                                  <td valign="middle" style="font-size: 14px; color: #1D1E1C;">
                                    Billable hours
                                  </td>
                                  <td align="right" valign="middle" style="font-size: 14px; color: #1D1E1C; font-weight: 500;">
                                    ${billableHours.toFixed(2)}
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td width="1%" valign="middle" style="padding-right: 4px;">
                                    <span style="width: 12px; height: 12px; background-color: #93C5FD; border-radius: 2px; display: inline-block;"></span>
                                  </td>
                                  <td valign="middle" style="font-size: 14px; color: #1D1E1C;">
                                    Non-billable hours
                                  </td>
                                  <td align="right" valign="middle" style="font-size: 14px; color: #1D1E1C; font-weight: 500;">
                                    ${nonBillableHours.toFixed(2)}
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Daily Breakdown -->
              <tr>
                <td style="padding-top: 16px; padding-bottom: 32px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #e5e5e5;">
                    <tr>
                      <td colspan="2" style="padding: 16px 0 8px 0;">
                        <span style="font-size: 14px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Daily Breakdown</span>
                      </td>
                    </tr>
                    ${dailyRows}
                    <tr>
                      <td style="padding: 12px 0 0 0; font-weight: 700; color: #1a1a1a;">Total</td>
                      <td style="padding: 12px 0 0 0; text-align: right; font-weight: 700; color: #1a1a1a;">${totalHours.toFixed(1)}h</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  const text = `
Your Weekly MD Hourlog Report
${weekStart} – ${weekEnd}

🎉 You did it! You tracked time ${daysTracked} day${daysTracked !== 1 ? 's' : ''} last week!
Head to your timesheet to keep it going: ${dashboardUrl}

HOURS SUMMARY:
  Total: ${totalHours.toFixed(2)}h (Capacity: ${capacity.toFixed(2)}h)
  Billable hours: ${billableHours.toFixed(2)}h
  Non-billable hours: ${nonBillableHours.toFixed(2)}h

DAILY BREAKDOWN:
${dailyTextRows}

Total: ${totalHours.toFixed(1)}h

---
MD Hourlog
  `

  return { html, text }
}

// Timesheet Submission Notification Email Template
export function generateTimesheetSubmissionEmail(
  recipientFirstName: string,
  submitterName: string,
  weekStart: string,
  weekEnd: string,
  reviewUrl: string
): { html: string; text: string } {
  const baseUrl = reviewUrl.replace(/\/(admin|dashboard).*$/, '')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Timesheet Submitted for Review</title>
        <style>
            body, table, td, p, a {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
            }
            body {
                background-color: #fff8f1;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1d1e1c;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            @media only screen and (max-width: 600px) {
                .email-container { padding: 20px 10px; }
                .content-wrapper { padding: 30px 20px; }
                .heading { font-size: 20px; }
                .body-text { font-size: 15px; }
                .button { display: block; text-align: center; padding: 14px 24px; }
            }
        </style>
    </head>
    <body>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8f1;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 550px; border-radius: 8px;">
                        <tr>
                            <td style="padding: 40px;">
                                <!-- Logo -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" style="padding-bottom: 30px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" valign="middle" style="padding-right: 8px;">
                                                        <img src="${baseUrl}/aseets/logo.png" alt="MD Hourlog" width="160" style="display: block; border: 0;" />
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Main Heading -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 14px;">
                                            <h1 class="heading" style="font-size: 24px; font-weight: 700; color: #1d1e1c; margin: 0; line-height: 1.3;">
                                                ${submitterName} has submitted a timesheet.
                                            </h1>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Body Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 10px;">
                                            <p class="body-text" style="font-size: 16px; color: #1d1e1c; margin: 0; line-height: 1.6;">
                                                ${submitterName} has just <u>submitted a timesheet</u> for ${weekStart} – ${weekEnd}.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding: 12px 0;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" style="background-color: #3C9A46; border-radius: 6px;">
                                                        <a href="${reviewUrl}" class="button" style="display: inline-block; background-color: #3C9A46; color: #FFFFFF; text-decoration: none; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                                            Review hours
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Footer Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-top: 12px;">
                                            <p class="footer-text" style="font-size: 14px; color: #1d1e1c; margin: 0 0 16px 0; line-height: 1.6;">
                                                You're receiving this email because you have approval notifications enabled. If you'd prefer not to get these notifications, <a href="${baseUrl}/dashboard/settings" class="footer-link" style="color: #1d1e1c; text-decoration: underline;">update your notification settings</a>.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `

  const text = `
${submitterName} has submitted a timesheet.

${submitterName} has just submitted a timesheet for ${weekStart} – ${weekEnd}.

Review hours: ${reviewUrl}

---
MD Hourlog
  `

  return { html, text }
}

// No Hours Reminder Email Template (Monday - if user didn't log any hours)
export function generateNoHoursReminderEmail(
  firstName: string,
  weekStart: string,
  weekEnd: string,
  dashboardUrl: string
): { html: string; text: string } {
  const baseUrl = dashboardUrl.replace(/\/(admin|dashboard).*$/, '')
  const currentDate = new Date()
  const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`
  const formattedTime = `${currentDate.getHours()}:${currentDate.getMinutes().toString().padStart(2, '0')}${currentDate.getHours() >= 12 ? 'pm' : 'am'}`

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Weekly MD Hourlog Report</title>
        <style>
            body, table, td, p, a {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
            }
            body {
                background-color: #fff8f1;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1D1E1C;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            @media only screen and (max-width: 600px) {
                .email-container { padding: 20px 10px; }
                .content-card { padding: 20px; }
                .report-title { font-size: 24px; }
            }
        </style>
    </head>
    <body>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8f1;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px;">
                        <!-- Header -->
                        <tr>
                            <td align="left" style="padding-bottom: 20px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" valign="middle">
                                            <img src="${baseUrl}/aseets/logo.png" width="160px" alt="MD Hourlog" style="display: block; border: 0;" />
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Report Title -->
                        <tr align="left">
                            <td align="left">
                                <h1 style="font-size: 28px; font-weight: 700; color: #1D1E1C; margin: 0;">
                                    Your Weekly MD Hourlog Report
                                </h1>
                            </td>
                        </tr>

                        <!-- Date Range -->
                        <tr align="left">
                            <td align="left" style="padding-bottom: 24px;">
                                <p style="font-size: 20px; font-weight: 600; color: #1D1E1C; margin: 0;">
                                    ${weekStart} – ${weekEnd}
                                </p>
                            </td>
                        </tr>

                        <!-- No Hours Message -->
                        <tr>
                            <td>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FFFFFF; border-radius: 8px; padding: 24px; margin-top: 15px;">
                                    <tr>
                                        <td style="font-size: 16px; color: #1D1E1C; line-height: 1.6;">
                                            No hours were tracked last week.<br/>
                                            When you track time, you'll see a summary report here.
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td>
                                <div style="text-align: left; font-size: 14px; color: #666666; margin-top: 32px; line-height: 1.6;">
                                    <p style="margin: 0 0 8px 0;">
                                        This report was generated from your MD Hourlog account on ${formattedDate} at ${formattedTime}.
                                        Something doesn't look right? <a href="${dashboardUrl}" style="color: #1d1e1c; text-decoration: underline;">Edit your timesheet</a>
                                    </p>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `

  const text = `
Your Weekly MD Hourlog Report
${weekStart} – ${weekEnd}

No hours were tracked last week.
When you track time, you'll see a summary report here.

Track your time: ${dashboardUrl}

---
This report was generated from your MD Hourlog account on ${formattedDate} at ${formattedTime}.
  `

  return { html, text }
}

// Unsubmitted Timesheet Reminder Email Template (Manual reminder from admin)
export function generateUnsubmittedReminderEmail(
  firstName: string,
  weekStart: string,
  dashboardUrl: string
): { html: string; text: string } {
  const baseUrl = dashboardUrl.replace(/\/(admin|dashboard).*$/, '')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Timesheet Reminder</title>
        <style>
            body, table, td, p, a {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
            }
            body {
                background-color: #fff8f1;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1d1e1c;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            @media only screen and (max-width: 600px) {
                .email-container { padding: 20px 10px; }
                .content-wrapper { padding: 30px 20px; }
                .heading { font-size: 20px; }
                .body-text { font-size: 15px; }
                .button { display: block; text-align: center; padding: 14px 24px; }
            }
        </style>
    </head>
    <body>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8f1;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 550px; border-radius: 8px;">
                        <tr>
                            <td style="padding: 40px;">
                                <!-- Logo -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" style="padding-bottom: 30px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" valign="middle" style="padding-right: 8px;">
                                                        <img src="${baseUrl}/aseets/logo.png" alt="MD Hourlog" width="160" style="display: block; border: 0;" />
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Main Heading -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 14px;">
                                            <h1 class="heading" style="font-size: 24px; font-weight: 700; color: #1d1e1c; margin: 0; line-height: 1.3;">
                                                ${firstName}, remember to submit your timesheet.
                                            </h1>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Body Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 10px;">
                                            <p class="body-text" style="font-size: 16px; color: #1d1e1c; margin: 0; line-height: 1.6;">
                                                Please take a moment to enter your time for the week of ${weekStart} and submit it for approval.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding: 12px 0;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" style="background-color: #3C9A46; border-radius: 6px;">
                                                        <a href="${dashboardUrl}" class="button" style="display: inline-block; background-color: #3C9A46; color: #FFFFFF; text-decoration: none; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                                            Track time & submit
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Footer Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-top: 12px;">
                                            <p class="footer-text" style="font-size: 14px; color: #1d1e1c; margin: 0 0 16px 0; line-height: 1.6;">
                                                You're receiving this email because timesheet reminders are enabled for your account. If you'd prefer not to get these reminders, <a href="${dashboardUrl}/settings" class="footer-link" style="color: #1d1e1c; text-decoration: underline;">update your notification settings</a>.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `

  const text = `
${firstName}, remember to submit your timesheet.

Please take a moment to enter your time for the week of ${weekStart} and submit it for approval.

Track time & submit: ${dashboardUrl}

---
You're receiving this email because timesheet reminders are enabled for your account.
  `

  return { html, text }
}

// Past Due Reminder Email Template (Saturday - if user missed Friday deadline)
export function generatePastDueReminderEmail(
  firstName: string,
  weekStart: string,
  dashboardUrl: string
): { html: string; text: string } {
  const baseUrl = dashboardUrl.replace(/\/(admin|dashboard).*$/, '')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Time Tracking Reminder</title>
        <style>
            body, table, td, p, a {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
            }
            body {
                background-color: #fff8f1;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1d1e1c;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            @media only screen and (max-width: 600px) {
                .email-container { padding: 20px 10px; }
                .content-wrapper { padding: 30px 20px; }
                .heading { font-size: 20px; }
                .body-text { font-size: 15px; }
                .button { display: block; text-align: center; padding: 14px 24px; }
            }
        </style>
    </head>
    <body>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8f1;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 550px; border-radius: 8px;">
                        <tr>
                            <td style="padding: 40px;">
                                <!-- Logo -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" style="padding-bottom: 30px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" valign="middle" style="padding-right: 8px;">
                                                        <img src="${baseUrl}/aseets/logo.png" alt="MD Hourlog" width="160" style="display: block; border: 0;" />
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Main Heading -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 14px;">
                                            <h1 class="heading" style="font-size: 24px; font-weight: 700; color: #1d1e1c; margin: 0; line-height: 1.3;">
                                                Pssst, it looks like you missed the deadline.
                                            </h1>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Body Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-bottom: 10px;">
                                            <p class="body-text" style="font-size: 16px; color: #1d1e1c; margin: 0; line-height: 1.6;">
                                                It happens to the best of us, ${firstName}. Your timesheet was due by 5:00pm on Friday. Here's one more reminder to enter your time for the week of ${weekStart}.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding: 12px 0;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                                <tr>
                                                    <td align="left" style="background-color: #3C9A46; border-radius: 6px;">
                                                        <a href="${dashboardUrl}" class="button" style="display: inline-block; background-color: #3C9A46; color: #FFFFFF; text-decoration: none; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                                            Track time
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- Footer Text -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td style="padding-top: 12px;">
                                            <p class="footer-text" style="font-size: 14px; color: #1d1e1c; margin: 0 0 16px 0; line-height: 1.6;">
                                                You're receiving this email because timesheet reminders are enabled for your account. If you'd prefer not to get these reminders, <a href="${dashboardUrl}/settings" class="footer-link" style="color: #1d1e1c; text-decoration: underline;">update your notification settings</a>.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `

  const text = `
Pssst, it looks like you missed the deadline.

It happens to the best of us, ${firstName}. Your timesheet was due by 5:00pm on Friday. Here's one more reminder to enter your time for the week of ${weekStart}.

Track time: ${dashboardUrl}

---
You're receiving this email because timesheet reminders are enabled for your account.
  `

  return { html, text }
}
