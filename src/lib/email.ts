import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: '【AI Tools】邮箱验证码',
    html: `
      <div style="max-width: 500px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
        <h2 style="color: #333; margin-bottom: 20px;">邮箱验证码</h2>
        <p style="color: #666; margin-bottom: 20px;">您的验证码是：</p>
        <div style="background: linear-gradient(135deg, #00f5ff, #bf00ff); color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          ${code}
        </div>
        <p style="color: #999; font-size: 14px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
        <p style="color: #999; font-size: 14px;">如非本人操作，请忽略此邮件。</p>
      </div>
    `,
  });
}
