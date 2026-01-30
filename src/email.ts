/**
 * 邮件服务 - 提供邮件发送能力
 */

import { createTransport } from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';

/**
 * 邮件配置
 */
export interface EmailConfig {
  /** SMTP 服务器地址 */
  host: string;
  /** SMTP 服务器端口 */
  port: number;
  /** 是否使用 SSL/TLS */
  secure?: boolean;
  /** 邮箱账号 */
  user: string;
  /** 邮箱密码或授权码 */
  pass: string;
  /** 发件人名称 */
  fromName?: string;
}

/**
 * 邮件附件
 */
export interface EmailAttachment {
  /** 附件内容（Buffer 或字符串） */
  content: Buffer | string;
  /** 文件名 */
  filename: string;
  /** 内容类型（可选） */
  contentType?: string;
}

/**
 * 邮件内容
 */
export interface EmailContent {
  /** 收件人邮箱地址 */
  to: string | string[];
  /** 邮件主题 */
  subject: string;
  /** 纯文本内容 */
  text?: string;
  /** HTML 内容 */
  html?: string;
  /** 抄送地址（可选） */
  cc?: string | string[];
  /** 密送地址（可选） */
  bcc?: string | string[];
  /** 附件列表（可选） */
  attachments?: EmailAttachment[];
}

/**
 * 邮件发送结果
 */
export interface EmailResult {
  /** 是否发送成功 */
  success: boolean;
  /** 邮件ID（成功时返回） */
  messageId?: string;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 响应信息（成功时返回） */
  response?: string;
}

/**
 * 邮件服务类
 */
export class EmailService {
  private transporter: Transporter;
  private fromAddress: string;

  /**
   * 构造函数
   * @param config 邮件配置
   */
  constructor(config: EmailConfig) {
    this.fromAddress = `"${config.fromName || '购物助手'}" <${config.user}>`;

    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? (config.port === 465),
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  /**
   * 验证邮件配置是否有效
   * @returns Promise<boolean> 配置是否有效
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('邮件配置验证失败:', error);
      return false;
    }
  }

  /**
   * 发送邮件
   * @param content 邮件内容
   * @returns Promise<EmailResult> 发送结果
   */
  async sendEmail(content: EmailContent): Promise<EmailResult> {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: Array.isArray(content.to) ? content.to.join(', ') : content.to,
        subject: content.subject,
        text: content.text,
        html: content.html,
        cc: content.cc ? (Array.isArray(content.cc) ? content.cc.join(', ') : content.cc) : undefined,
        bcc: content.bcc ? (Array.isArray(content.bcc) ? content.bcc.join(', ') : content.bcc) : undefined,
        attachments: content.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      const info: SentMessageInfo = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量发送邮件
   * @param recipients 收件人列表
   * @param subject 邮件主题
   * @param text 纯文本内容
   * @param html HTML 内容
   * @returns Promise<EmailResult[]> 发送结果列表
   */
  async sendBulkEmail(
    recipients: string[],
    subject: string,
    text?: string,
    html?: string
  ): Promise<EmailResult[]> {
    const results: EmailResult[] = [];

    for (const recipient of recipients) {
      const result = await this.sendEmail({
        to: recipient,
        subject,
        text,
        html,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * 关闭邮件服务连接
   */
  async close(): Promise<void> {
    await this.transporter.close();
  }
}

/**
 * 默认邮件服务实例（需要先配置）
 */
let defaultEmailService: EmailService | null = null;

/**
 * 配置默认邮件服务
 * @param config 邮件配置
 */
export function configureEmailService(config: EmailConfig): void {
  defaultEmailService = new EmailService(config);
}

/**
 * 获取默认邮件服务实例
 * @returns EmailService 邮件服务实例
 * @throws 如果未配置邮件服务，抛出错误
 */
export function getEmailService(): EmailService {
  if (!defaultEmailService) {
    throw new Error('邮件服务未配置，请先调用 configureEmailService()');
  }
  return defaultEmailService;
}

/**
 * 快速发送邮件（使用默认邮件服务）
 * @param content 邮件内容
 * @returns Promise<EmailResult> 发送结果
 */
export async function sendEmail(content: EmailContent): Promise<EmailResult> {
  const service = getEmailService();
  return service.sendEmail(content);
}

/**
 * 验证默认邮件服务配置
 * @returns Promise<boolean> 配置是否有效
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    const service = getEmailService();
    return service.verifyConnection();
  } catch {
    return false;
  }
}

/**
 * 创建邮件模板 - 到货提醒
 * @param productName 商品名称
 * @param price 价格
 * @param productImage 商品图片 URL（可选）
 * @returns HTML 邮件内容
 */
export function createBackInStockTemplate(
  productName: string,
  price: number,
  productImage?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #2196F3;
          margin: 0;
        }
        .content {
          background: white;
          padding: 25px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .product-name {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          margin: 15px 0;
        }
        .product-image {
          width: 100%;
          max-width: 300px;
          height: auto;
          border-radius: 8px;
          margin: 15px 0;
          object-fit: cover;
        }
        .price {
          font-size: 24px;
          color: #e53935;
          font-weight: bold;
          margin: 15px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 到货提醒</h1>
        </div>
        <div class="content">
          <p>您好！</p>
          <p>您关注的商品已到货，快去看看吧！</p>
          ${productImage ? `<img src="${productImage}" alt="${productName}" class="product-image" />` : ''}
          <div class="product-name">${productName}</div>
          <div class="price">¥${price.toFixed(2)}</div>
        </div>
        <div class="footer">
          <p>这是一封自动发送的邮件，请勿直接回复。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 创建邮件模板 - 库存查询报告
 * @param inStockCount 有货数量
 * @param outOfStockCount 无货数量
 * @param reportDetails 报告详情
 * @returns HTML 邮件内容
 */
export function createStockReportTemplate(
  inStockCount: number,
  outOfStockCount: number,
  reportDetails: Array<{ name: string; inStock: boolean; price: number }>
): string {
  const rows = reportDetails.map(item => `
    <tr style="${item.inStock ? '' : 'background: #fff0f0;'}">
      <td style="padding: 10px; border: 1px solid #ddd;">${item.name}</td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
        ${item.inStock ? '<span style="color: green; font-weight: bold;">✓ 有货</span>' : '<span style="color: red; font-weight: bold;">✗ 无货</span>'}
      </td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">¥${item.price.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #2196F3;
          margin: 0;
        }
        .summary {
          background: white;
          padding: 20px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-around;
        }
        .summary-item {
          text-align: center;
        }
        .summary-number {
          font-size: 32px;
          font-weight: bold;
        }
        .summary-in-stock {
          color: #4CAF50;
        }
        .summary-out-of-stock {
          color: #f44336;
        }
        .summary-label {
          color: #666;
          margin-top: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }
        th {
          background: #2196F3;
          color: white;
          padding: 12px;
          text-align: left;
        }
        td {
          padding: 10px;
          border: 1px solid #ddd;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 库存查询报告</h1>
        </div>
        <div class="summary">
          <div class="summary-item">
            <div class="summary-number summary-in-stock">${inStockCount}</div>
            <div class="summary-label">有货商品</div>
          </div>
          <div class="summary-item">
            <div class="summary-number summary-out-of-stock">${outOfStockCount}</div>
            <div class="summary-label">无货商品</div>
          </div>
          <div class="summary-item">
            <div class="summary-number">${inStockCount + outOfStockCount}</div>
            <div class="summary-label">商品总数</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>商品名称</th>
              <th style="text-align: center;">库存状态</th>
              <th style="text-align: right;">价格</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="footer">
          <p>报告生成时间: ${new Date().toLocaleString('zh-CN')}</p>
          <p>这是一封自动发送的邮件，请勿直接回复。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
