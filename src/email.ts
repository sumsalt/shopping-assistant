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
 * 从环境变量读取 SMTP 配置
 *
 * 授权码等敏感信息不写进代码，部署时通过 PM2 ecosystem / shell 注入：
 * - SMTP_HOST：默认 smtp.qq.com
 * - SMTP_PORT：默认 465
 * - SMTP_USER：默认 sumsalt@qq.com
 * - SMTP_PASS：QQ 邮箱授权码，必填
 * - SMTP_SECURE：默认 true（465 端口 SSL）
 * - SMTP_FROM_NAME：发件人显示名，默认「购物助手」
 *
 * 未配置 SMTP_PASS 时返回 null：进程可以正常启动，只是发信时会报「邮件服务未配置」。
 */
export function loadEmailConfigFromEnv(): EmailConfig | null {
  const pass = process.env.SMTP_PASS?.trim();
  if (!pass) {
    console.warn('[Email] 未配置 SMTP_PASS 环境变量，邮件通知不可用');
    return null;
  }

  const rawPort = Number(process.env.SMTP_PORT ?? 465);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 465;

  return {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port,
    secure: (process.env.SMTP_SECURE ?? 'true') !== 'false',
    user: process.env.SMTP_USER || 'sumsalt@qq.com',
    pass,
    fromName: process.env.SMTP_FROM_NAME || '购物助手',
  };
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
          display: block;
          width: 100%;
          max-width: 300px;
          height: auto;
          border-radius: 8px;
          object-fit: cover;
        }
        .image-container {
          text-align: center;
          margin: 15px 0;
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
          ${productImage ? `
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" class="image-container">
                <img src="${productImage}" alt="${productName}" class="product-image" />
              </td>
            </tr>
          </table>
          ` : ''}
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

/** 邮件里展示的商品字段 */
interface TabMailProduct {
  productId: string;
  productName: string;
  price: number;
  productUrl: string;
  productImage: string;
}

/** 累计模式的提醒内容：只关心新商品 */
interface TabAccumulateMailInfo {
  mode: 'accumulate';
  newProducts: TabMailProduct[];
  currentTotal: number;
  seenTotal: number;
}

/** 逐轮对比模式的提醒内容：本轮新增 + 下架 */
interface TabDiffMailInfo {
  mode: 'diff';
  changeType: 'list_changed' | 'count_changed' | 'both';
  previousTotal: number;
  currentTotal: number;
  newProducts: TabMailProduct[];
  removedProducts: TabMailProduct[];
}

/**
 * 创建邮件模板 - Tab 提醒
 *
 * 按任务选择的监控模式渲染：累计模式只列新商品，对比模式列本轮新增与下架。
 *
 * @param tabName Tab名称
 * @param info 提醒内容
 * @param tabId Tab ID
 * @returns HTML 邮件内容
 */
export function createTabChangeTemplate(
  tabName: string,
  info: TabAccumulateMailInfo | TabDiffMailInfo,
  tabId: string
): string {
  return info.mode === 'diff'
    ? createTabDiffTemplate(tabName, info, tabId)
    : createTabAccumulateTemplate(tabName, info, tabId);
}

/**
 * 累计模式：只展示新发现的商品，不展示下架商品
 */
function createTabAccumulateTemplate(
  tabName: string,
  info: TabAccumulateMailInfo,
  tabId: string
): string {
  const productsHtml = info.newProducts
    .slice(0, 10)
    .map(
      product => `
        <div style="background: #f0fdf4; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #4CAF50;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="text-align: center;">
                <img src="${product.productImage}" alt="${product.productName}" width="400" style="width: 100%; max-width: 400px; height: auto; object-fit: cover; border-radius: 4px; display: block; margin: 0 auto;" />
              </td>
            </tr>
          </table>
          <div style="font-weight: bold; color: #333; margin-bottom: 5px; text-align: center;">${product.productName}</div>
          <div style="color: #e53935; font-weight: bold; text-align: center;">¥${product.price.toFixed(2)}</div>
        </div>
      `
    )
    .join('')

  const moreHtml =
    info.newProducts.length > 10
      ? `<p style="color: #999; font-size: 12px; text-align: center;">... 还有 ${info.newProducts.length - 10} 个新商品</p>`
      : ''

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
          color: #FF9800;
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
        .summary-new {
          color: #4CAF50;
        }
        .summary-current {
          color: #2196F3;
        }
        .summary-seen {
          color: #FF9800;
        }
        .summary-label {
          color: #666;
          margin-top: 5px;
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
          <h1>🆕 Tab 发现新商品</h1>
        </div>

        <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin-top: 0;">${tabName}</h3>
          <p style="color: #666; font-size: 14px;">Tab ID: ${tabId}</p>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="summary-number summary-new">${info.newProducts.length}</div>
            <div class="summary-label">本次新商品</div>
          </div>
          <div class="summary-item">
            <div class="summary-number summary-current">${info.currentTotal}</div>
            <div class="summary-label">当前在架</div>
          </div>
          <div class="summary-item">
            <div class="summary-number summary-seen">${info.seenTotal}</div>
            <div class="summary-label">累计记录</div>
          </div>
        </div>

        <div style="margin-top: 20px;">
          <h3 style="color: #4CAF50; margin-bottom: 15px;">✨ 新商品 (${info.newProducts.length})</h3>
          ${productsHtml}
          ${moreHtml}
        </div>

        <div class="footer">
          <p>检测时间: ${new Date().toLocaleString('zh-CN')}</p>
          <p>同一商品只记录一次，反复上下架不会重复提醒。</p>
          <p>这是一封自动发送的邮件，请勿直接回复。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 逐轮对比模式：展示本轮新增与下架的商品
 */
function createTabDiffTemplate(
  tabName: string,
  info: TabDiffMailInfo,
  tabId: string
): string {
  const changeTypeText = {
    list_changed: '商品列表变化',
    count_changed: '商品总数变化',
    both: '商品列表和总数变化',
  }[info.changeType];

  const newProductsHtml = info.newProducts.length > 0 ? `
    <div style="margin-top: 20px;">
      <h3 style="color: #4CAF50; margin-bottom: 15px;">✨ 新增商品 (${info.newProducts.length})</h3>
      ${info.newProducts.slice(0, 10).map(product => `
        <div style="background: #f0fdf4; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #4CAF50;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="text-align: center;">
                <img src="${product.productImage}" alt="${product.productName}" width="400" style="width: 100%; max-width: 400px; height: auto; object-fit: cover; border-radius: 4px; display: block; margin: 0 auto;" />
              </td>
            </tr>
          </table>
          <div style="font-weight: bold; color: #333; margin-bottom: 5px; text-align: center;">${product.productName}</div>
          <div style="color: #e53935; font-weight: bold; text-align: center;">¥${product.price.toFixed(2)}</div>
        </div>
      `).join('')}
      ${info.newProducts.length > 10 ? `<p style="color: #999; font-size: 12px; text-align: center;">... 还有 ${info.newProducts.length - 10} 个新增商品</p>` : ''}
    </div>
  ` : '';

  const removedProductsHtml = info.removedProducts.length > 0 ? `
    <div style="margin-top: 20px;">
      <h3 style="color: #f44336; margin-bottom: 15px;">❌ 删除商品 (${info.removedProducts.length})</h3>
      ${info.removedProducts.slice(0, 10).map(product => `
        <div style="background: #fef2f2; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #f44336;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="text-align: center;">
                <img src="${product.productImage}" alt="${product.productName}" width="400" style="width: 100%; max-width: 400px; height: auto; object-fit: cover; border-radius: 4px; display: block; opacity: 0.6;" />
              </td>
            </tr>
          </table>
          <div style="font-weight: bold; color: #333; margin-bottom: 5px; text-align: center;">${product.productName}</div>
          <div style="color: #666; text-align: center;">¥${product.price.toFixed(2)}</div>
        </div>
      `).join('')}
      ${info.removedProducts.length > 10 ? `<p style="color: #999; font-size: 12px; text-align: center;">... 还有 ${info.removedProducts.length - 10} 个删除商品</p>` : ''}
    </div>
  ` : '';

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
          color: #FF9800;
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
        .summary-previous {
          color: #2196F3;
        }
        .summary-current {
          color: #4CAF50;
        }
        .summary-diff {
          color: #FF9800;
        }
        .summary-label {
          color: #666;
          margin-top: 5px;
        }
        .change-type {
          background: #FFF3E0;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          text-align: center;
          font-weight: bold;
          color: #FF6F00;
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
          <h1>🔔 Tab商品列表变化提醒</h1>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin-top: 0;">${tabName}</h3>
          <p style="color: #666; font-size: 14px;">Tab ID: ${tabId}</p>
        </div>

        <div class="change-type">
          变化类型: ${changeTypeText}
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="summary-number summary-previous">${info.previousTotal}</div>
            <div class="summary-label">变化前</div>
          </div>
          <div class="summary-item">
            <div class="summary-number summary-diff">
              ${info.currentTotal > info.previousTotal ? '+' : ''}${info.currentTotal - info.previousTotal}
            </div>
            <div class="summary-label">变化量</div>
          </div>
          <div class="summary-item">
            <div class="summary-number summary-current">${info.currentTotal}</div>
            <div class="summary-label">变化后</div>
          </div>
        </div>

        ${newProductsHtml}
        ${removedProductsHtml}

        <div class="footer">
          <p>检测时间: ${new Date().toLocaleString('zh-CN')}</p>
          <p>这是一封自动发送的邮件，请勿直接回复。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 创建邮件模板 - 价格变动提醒
 *
 * @param productName 商品名称
 * @param change 价格变化信息
 * @param productImage 商品图片 URL（可选）
 * @param productUrl 商品链接（可选）
 * @returns HTML 邮件内容
 */
export function createPriceChangeTemplate(
  productName: string,
  change: {
    previousPrice: number;
    currentPrice: number;
    delta: number;
    deltaPercent: number;
    direction: 'up' | 'down';
    detectedAt: number;
  } | null,
  productImage?: string,
  productUrl?: string,
  couponChange?: {
    added: Array<{ kind: string; label: string }>;
    removed: Array<{ kind: string; label: string }>;
    detectedAt?: number;
  }
): string {
  const isDrop = change?.direction === 'down';
  const accentColor = change ? (isDrop ? '#4CAF50' : '#f44336') : '#FF9800';
  const title = change ? (isDrop ? '价格下降提醒' : '价格上涨提醒') : '优惠券变化提醒';
  const sign = change && change.delta > 0 ? '+' : '';
  const percentSign = change && change.deltaPercent > 0 ? '+' : '';

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const intro = [
    change ? `价格${isDrop ? '下降' : '上涨'}` : '',
    couponChange ? '优惠券有变化' : '',
  ]
    .filter(Boolean)
    .join('，');

  const couponHtml = couponChange
    ? `
          <div class="coupon-block">
            <div class="coupon-title">🎟️ 优惠券变化</div>
            ${(couponChange.added ?? []).length > 0 ? `<div class="coupon-row coupon-add">新增：${couponChange.added.map(item => escapeHtml(item.label)).join('、')}</div>` : ''}
            ${(couponChange.removed ?? []).length > 0 ? `<div class="coupon-row coupon-remove">失效：${couponChange.removed.map(item => escapeHtml(item.label)).join('、')}</div>` : ''}
          </div>`
    : '';

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
          color: ${accentColor};
          margin: 0;
          font-size: 22px;
        }
        .content {
          background: white;
          padding: 25px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .product-name {
          font-size: 16px;
          font-weight: bold;
          color: #333;
          margin: 15px 0;
        }
        .product-image {
          display: block;
          width: 100%;
          max-width: 300px;
          height: auto;
          border-radius: 8px;
          object-fit: cover;
          margin: 0 auto 15px;
        }
        .price-row {
          text-align: center;
          margin: 20px 0;
        }
        .price-old {
          color: #999;
          font-size: 18px;
          text-decoration: line-through;
        }
        .price-arrow {
          color: #999;
          margin: 0 10px;
        }
        .price-new {
          color: ${accentColor};
          font-size: 28px;
          font-weight: bold;
        }
        .price-delta {
          text-align: center;
          color: ${accentColor};
          font-size: 16px;
          font-weight: bold;
        }
        .coupon-block {
          margin: 20px 0;
          padding: 15px;
          background: #fff8e1;
          border-left: 4px solid #FF9800;
          border-radius: 6px;
        }
        .coupon-title {
          font-size: 15px;
          font-weight: bold;
          color: #E65100;
          margin-bottom: 8px;
        }
        .coupon-row {
          font-size: 14px;
          line-height: 1.8;
        }
        .coupon-add {
          color: #2E7D32;
        }
        .coupon-remove {
          color: #999;
        }
        .link {
          display: block;
          text-align: center;
          margin-top: 20px;
        }
        .link a {
          color: #2196F3;
          text-decoration: none;
          font-size: 14px;
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
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>您好！</p>
          <p>您监控的商品${intro}。</p>
          ${productImage ? `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            <tr>
              <td align="center" style="text-align: center; padding: 0 0 15px;">
                <img src="${productImage}" alt="${productName}" width="300" style="display: block; width: 100%; max-width: 300px; height: auto; border-radius: 8px; margin: 0 auto;" />
              </td>
            </tr>
          </table>
          ` : ''}
          <div class="product-name">${productName}</div>
          ${change ? `
          <div class="price-row">
            <span class="price-old">¥${change.previousPrice.toFixed(2)}</span>
            <span class="price-arrow">→</span>
            <span class="price-new">¥${change.currentPrice.toFixed(2)}</span>
          </div>
          <div class="price-delta">
            ${sign}${change.delta.toFixed(2)} 元（${percentSign}${change.deltaPercent.toFixed(2)}%）
          </div>
          ` : ''}
          ${couponHtml}
          ${productUrl ? `<div class="link"><a href="${productUrl}">查看商品详情</a></div>` : ''}
        </div>
        <div class="footer">
          <p>检测时间: ${new Date(change?.detectedAt ?? couponChange?.detectedAt ?? Date.now()).toLocaleString('zh-CN')}</p>
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
