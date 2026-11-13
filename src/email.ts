/**
 * 邮件服务 - 提供邮件发送能力
 */

import { createTransport } from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';
import type { AutoOrderItem } from './types';
import { buildYishouProductLink, buildYishouDeepLink, YISHOU_ROUTES } from './yishou-deeplink';

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
 * Tab 监控专用邮件服务实例
 *
 * Tab 提醒可以用独立发件账号（例如 QQ 邮箱的 Foxmail 别名），
 * 未配置时 sendTabEmail 会回退到默认服务，行为与以前一致。
 */
let tabEmailService: EmailService | null = null;

/**
 * 读取 Tab 监控专用 SMTP 配置
 *
 * 支持用 TAB_SMTP_* 覆盖发件账号，未设置的项回退到全局 SMTP_*：
 * - TAB_SMTP_USER：发件账号，不设置时视为不区分发件人，返回 null
 * - TAB_SMTP_PASS：授权码，未设置时复用 SMTP_PASS
 * - TAB_SMTP_HOST / TAB_SMTP_PORT / TAB_SMTP_SECURE / TAB_SMTP_FROM_NAME：可选
 *
 * @returns Tab 专用配置；未配置专用账号或缺少授权码时返回 null（回退默认服务）
 */
export function loadTabEmailConfigFromEnv(): EmailConfig | null {
  const user = process.env.TAB_SMTP_USER?.trim();

  // 没单独指定发件账号，就走默认服务
  if (!user) {
    return null;
  }

  const pass = process.env.TAB_SMTP_PASS?.trim() || process.env.SMTP_PASS?.trim();
  if (!pass) {
    console.warn(
      '[Email] 已配置 TAB_SMTP_USER 但缺少 TAB_SMTP_PASS / SMTP_PASS，Tab 邮件继续使用默认账号'
    );
    return null;
  }

  const rawPort = Number(process.env.TAB_SMTP_PORT ?? process.env.SMTP_PORT ?? 465);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 465;

  return {
    host: process.env.TAB_SMTP_HOST || process.env.SMTP_HOST || 'smtp.qq.com',
    port,
    secure: (process.env.TAB_SMTP_SECURE ?? process.env.SMTP_SECURE ?? 'true') !== 'false',
    user,
    pass,
    fromName: process.env.TAB_SMTP_FROM_NAME || process.env.SMTP_FROM_NAME || '购物助手',
  };
}

/**
 * 确保默认邮件服务已按环境变量配置好。
 *
 * 其它监控模块在 import 时就配置了服务，但续期任务可能独立启动，
 * 这里做一次幂等兜底：已配置则直接复用，未配置则尝试从环境变量读取。
 *
 * @returns 是否可用（未配置 SMTP_PASS 时返回 false，调用方应跳过发信而不是抛错）
 */
export function ensureEmailServiceConfigured(): boolean {
  if (defaultEmailService) return true;
  const config = loadEmailConfigFromEnv();
  if (!config) return false;
  configureEmailService(config);
  return true;
}

/**
 * 配置默认邮件服务
 * @param config 邮件配置
 */
export function configureEmailService(config: EmailConfig): void {
  defaultEmailService = new EmailService(config);
}

/**
 * 配置 Tab 监控专用邮件服务
 * @param config 邮件配置
 */
export function configureTabEmailService(config: EmailConfig): void {
  tabEmailService = new EmailService(config);
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
 * 发送 Tab 监控邮件
 *
 * 优先使用 Tab 专用发件服务（TAB_SMTP_USER），未配置时回退默认服务。
 *
 * @param content 邮件内容
 * @returns Promise<EmailResult> 发送结果
 */
export async function sendTabEmail(content: EmailContent): Promise<EmailResult> {
  const service = tabEmailService ?? getEmailService();
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
 * @param priceNote 价格口径说明，如匿名查询时的「游客参考价」（可选）
 * @returns HTML 邮件内容
 */
export function createBackInStockTemplate(
  productName: string,
  price: number,
  productImage?: string,
  priceNote?: string,
  skuLabel?: string
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
          ${skuLabel ? `<p style="margin:0 0 8px;color:#666;font-size:14px;">可购规格：${skuLabel}</p>` : ''}
          <div class="price">¥${price.toFixed(2)}${priceNote ? `<span style="font-size:12px;color:#999;font-weight:normal;">（${priceNote}）</span>` : ''}</div>
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
  /** 商品货号（一手 goods_no，用于拼 App 深链唤起一手） */
  productNo?: string;
  productImage: string;
  /** 店铺名称（一手 brand_name） */
  brandName?: string;
  /** 市场名称 */
  marketName?: string;
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

/** 单封邮件最多展示的商品数（累计 / 对比的新增与下架都受此限制） */
const TAB_MAIL_MAX_PRODUCTS = 50;

/**
 * 商品图高度（px）。
 *
 * 不用 `aspect-ratio`：邮件客户端（尤其 Gmail）不认，竖长图会按原始比例撑成一条长条。
 * 这里用 img 的 height 属性 + object-fit:cover 固定高度，保证卡片高度一致、不变形。
 */
const TAB_MAIL_IMAGE_HEIGHT = 190;

/**
 * Tab 邮件统一外壳。
 *
 * 邮件里不能用 flex/grid，且多层 padding 会让手机上两侧留白过大；
 * 这里只用「外层 table 居中 + 内层 table 限宽」两层，左右留白合计约 14px，
 * 主体宽度接近满屏（桌面最多 640px）。
 */
function tabMailShell(opts: {
  schema: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="light only">
      <meta name="supported-color-schemes" content="light only">
      ${opts.schema}
    </head>
    <body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;">
        <tr>
          <td align="center" style="padding:10px 8px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;border-collapse:collapse;">
              <tr>
                <td style="padding:2px 6px 10px;border-bottom:1px solid #f0f0f0;">
                  <div style="font-size:17px;font-weight:700;color:#111827;line-height:1.35;">${opts.title}</div>
                  <div style="font-size:12px;color:#6b7280;line-height:1.4;margin-top:3px;">${opts.subtitle}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 6px 0;">
                  ${opts.bodyHtml}
                </td>
              </tr>
              ${
                opts.footerHtml
                  ? `<tr><td style="padding:16px 6px 0;text-align:center;font-size:11px;color:#9ca3af;line-height:1.6;">${opts.footerHtml}</td></tr>`
                  : ''
              }
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/** 三列统计条（用 table，邮件客户端不支持 flex） */
function tabSummaryBar(items: Array<{ value: string; label: string; color: string }>): string {
  const cells = items
    .map(
      item => `
      <td width="33%" align="center" valign="middle" style="padding:8px 2px;">
        <div style="font-size:20px;font-weight:700;color:${item.color};line-height:1.2;">${item.value}</div>
        <div style="font-size:11px;color:#6b7280;line-height:1.3;margin-top:2px;">${item.label}</div>
      </td>`
    )
    .join('');
  return `<table   role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #f1f2f4;border-radius:10px;"><tr>${cells}</tr></table>`;
}

/** 区块标题（✨ 新商品 / ❌ 删除商品） */
function tabSectionTitle(text: string, color: string): string {
  return `<div style="font-size:14px;font-weight:700;color:${color};line-height:1.4;margin:0 0 8px;">${text}</div>`;
}

/**
 * 把商品渲染成两列表格（邮件客户端对 CSS grid/flex 支持差，用 table 模拟页面的 grid-cols-2）。
 * 卡片风格对齐页面累计商品：圆角浅灰底、固定高度封面、¥价格标签、商品名 + 店铺名。
 */
function renderTabProductGrid(products: TabMailProduct[], removed = false): string {
  const shown = products.slice(0, TAB_MAIL_MAX_PRODUCTS);
  const cells = shown.map(p => tabProductCell(p, removed));
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const left = cells[i] ?? '';
    const right = cells[i + 1] ?? '';
    // 用 cellspacing 做卡片间距：td 加 padding 会撑破 50% 宽度，导致两列溢出屏幕
    rows.push(`<tr><td width="50%" valign="top">${left}</td><td width="50%" valign="top">${right}</td></tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0">${rows.join('')}</table>`;
}

function tabProductCell(p: TabMailProduct, removed: boolean): string {
  const dim = removed ? 'opacity:0.55;' : '';
  // 点击唤起一手 App（与页面手机端同一套深链），而非跳 H5 网页
  const appLink = buildYishouProductLink(p.productId, p.productNo);
  const shopText = p.brandName ?? '';
  const cover = p.productImage
    ? `<img src="${p.productImage}" alt="${p.productName}" width="100%" height="${TAB_MAIL_IMAGE_HEIGHT}" style="display:block;width:100%;height:${TAB_MAIL_IMAGE_HEIGHT}px;object-fit:cover;border:0;border-radius:10px 10px 0 0;${dim}" />`
    : `<div style="height:${TAB_MAIL_IMAGE_HEIGHT}px;background:#f3f4f6;"></div>`;

  return `
    <a href="${appLink}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;box-sizing:border-box;background:#f9fafb;border:1px solid #f1f2f4;border-radius:10px;">
        <tr><td style="padding:0;font-size:0;line-height:0;">${cover}</td></tr>
        <tr>
          <td style="padding:6px 8px 7px;">
            <div style="font-size:12px;font-weight:600;color:#1f2937;line-height:1.35;height:32px;overflow:hidden;">${p.productName}</div>
            <div style="margin-top:3px;">
              <span style="display:inline-block;background:rgba(0,0,0,0.7);color:#ffffff;font-size:11px;font-weight:600;line-height:1.4;padding:1px 5px;border-radius:4px;">¥${p.price.toFixed(2)}</span>
              ${
                shopText
                  ? `<span style="display:inline-block;font-size:11px;color:#9ca3af;line-height:1.4;margin-left:5px;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;">${shopText}</span>`
                  : ''
              }
            </div>
          </td>
        </tr>
      </table>
    </a>`;
}

/**
 * Gmail 等支持的邮件结构化操作（schema.org EmailMessage + ViewAction）。
 * 让收件人在邮件里直接看到可点击的跳转操作；发件域名需通过 SPF/DKIM/DMARC 且注册才会显示。
 * 跳转到首个新商品（对比模式回退到首个下架商品）的一手 App 深链。
 */
function tabEmailSchema(info: TabAccumulateMailInfo | TabDiffMailInfo, tabName: string): string {
  const first =
    info.mode === 'diff'
      ? info.newProducts[0] ?? info.removedProducts[0]
      : info.newProducts[0];
  if (!first) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'EmailMessage',
    action: {
      '@type': 'ViewAction',
      name: '在手一查看商品',
      url: buildYishouProductLink(first.productId, first.productNo),
    },
    description: `${tabName} 有商品更新`,
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * 累计模式：只展示新发现的商品，不展示下架商品
 */
function createTabAccumulateTemplate(
  tabName: string,
  info: TabAccumulateMailInfo,
  tabId: string
): string {
  const gridHtml = renderTabProductGrid(info.newProducts, false);
  const moreHtml =
    info.newProducts.length > TAB_MAIL_MAX_PRODUCTS
      ? `<p style="color:#9ca3af;font-size:11px;text-align:center;margin:10px 0 0;">... 还有 ${info.newProducts.length - TAB_MAIL_MAX_PRODUCTS} 个新商品</p>`
      : '';

  const summary = tabSummaryBar([
    { value: String(info.newProducts.length), label: '本次新商品', color: '#16a34a' },
    { value: String(info.currentTotal), label: '当前在架', color: '#2563eb' },
    { value: String(info.seenTotal), label: '累计记录', color: '#f97316' },
  ]);

  const bodyHtml = `
    ${summary}
    <div style="margin-top:14px;">
      ${tabSectionTitle(`✨ 新商品 (${info.newProducts.length})`, '#16a34a')}
      ${gridHtml}
      ${moreHtml}
    </div>
  `;

  return tabMailShell({
    schema: tabEmailSchema(info, tabName),
    title: '🆕 Tab 发现新商品',
    subtitle: `${tabName} · Tab ID: ${tabId}`,
    bodyHtml,
    footerHtml: '同一商品只记录一次，反复上下架不会重复提醒。<br>这是一封自动发送的邮件，请勿直接回复。',
  });
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
    <div style="margin-top:14px;">
      ${tabSectionTitle(`✨ 新增商品 (${info.newProducts.length})`, '#16a34a')}
      ${renderTabProductGrid(info.newProducts, false)}
      ${info.newProducts.length > TAB_MAIL_MAX_PRODUCTS ? `<p style="color:#9ca3af;font-size:11px;text-align:center;margin:10px 0 0;">... 还有 ${info.newProducts.length - TAB_MAIL_MAX_PRODUCTS} 个新增商品</p>` : ''}
    </div>
  ` : '';

  const removedProductsHtml = info.removedProducts.length > 0 ? `
    <div style="margin-top:14px;">
      ${tabSectionTitle(`❌ 删除商品 (${info.removedProducts.length})`, '#ef4444')}
      ${renderTabProductGrid(info.removedProducts, true)}
      ${info.removedProducts.length > TAB_MAIL_MAX_PRODUCTS ? `<p style="color:#9ca3af;font-size:11px;text-align:center;margin:10px 0 0;">... 还有 ${info.removedProducts.length - TAB_MAIL_MAX_PRODUCTS} 个删除商品</p>` : ''}
    </div>
  ` : '';

  const summary = tabSummaryBar([
    { value: String(info.previousTotal), label: '变化前', color: '#2563eb' },
    {
      value: `${info.currentTotal > info.previousTotal ? '+' : ''}${info.currentTotal - info.previousTotal}`,
      label: '变化量',
      color: '#f97316',
    },
    { value: String(info.currentTotal), label: '变化后', color: '#16a34a' },
  ]);

  const changeTypeHtml = `
    <div style="background:#fff7ed;border:1px solid #ffedd5;border-radius:10px;padding:8px 10px;margin-bottom:10px;text-align:center;font-size:12px;font-weight:600;color:#c2410c;">
      变化类型：${changeTypeText}
    </div>
  `;

  return tabMailShell({
    schema: tabEmailSchema(info, tabName),
    title: '🔔 Tab 商品列表变化提醒',
    subtitle: `${tabName} · Tab ID: ${tabId}`,
    bodyHtml: `${changeTypeHtml}${summary}${newProductsHtml}${removedProductsHtml}`,
    footerHtml: '这是一封自动发送的邮件，请勿直接回复。',
  });
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

/** 自动下单成功通知的参数 */
export interface AutoOrderTemplateParams {
  /** 商品名称 */
  productName: string;
  /** 商品主图 */
  productImage?: string;
  /** 订单号 */
  orderSn?: string;
  /** 订单金额 */
  orderAmount?: number;
  /** 规格文案：蓝色 / M */
  skuLabel?: string;
  /** 下单明细：多规格合单时每个规格一行 */
  items?: AutoOrderItem[];
  /** 件数 */
  num?: number;
  /** 用户配置的件数（库存不足时与 num 不同） */
  requestedNum?: number;
  /** 支付方式（1 支付宝 / 4 微信） */
  payTool?: string;
  /** 支付截止时间（毫秒时间戳） */
  expireAt?: number;
  /** 触发下单时的券后最优价（已把满减券算进去），用于说明「为什么到点」 */
  couponAdjustedPrice?: number;
  /** 触发时的目标价（price 模式），与 couponAdjustedPrice 对照展示 */
  targetPrice?: number;
  /** 触发时的目标折扣（discount 模式，如 2.4 表示 2.4 折），与券后折扣对照展示 */
  targetDiscount?: number;
}

/** 把支付截止时间格式化成「今天 12:34」这种可读文案 */
const formatExpireText = (expireAt?: number): string => {
  if (!expireAt) {
    return '';
  }
  const date = new Date(expireAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * 自动下单成功通知
 *
 * 服务端只能把订单建出来（锁住库存），支付必须人工完成，
 * 所以这封邮件的重点是「订单号 + 还剩多久 + 去哪付」。
 */
export function createAutoOrderTemplate(params: AutoOrderTemplateParams): string {
  const {
    productName,
    productImage,
    orderSn = '-',
    orderAmount,
    skuLabel,
    items,
    num = 1,
    requestedNum,
    payTool,
    expireAt,
    couponAdjustedPrice,
    targetPrice,
    targetDiscount,
  } = params;

  const numReduced = Boolean(requestedNum && requestedNum > num);

  // 多规格合单：一个规格一行，并单独给出合计件数
  const orderItems = items && items.length > 0 ? items : [{ skuLabel: skuLabel || '-', num }];
  const skuCell = orderItems
    .map(item => `${item.skuLabel || '-'} × ${item.num}`)
    .join('<br>');
  const multiSku = orderItems.length > 1;

  const amountText = orderAmount !== undefined ? `¥${orderAmount.toFixed(2)}` : '以 App 内为准';
  const payText = payTool === '1' ? '支付宝' : payTool === '4' ? '微信' : '默认支付方式';
  const expireText = formatExpireText(expireAt);

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
        .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e0e0e0; padding-bottom: 18px; }
        .header h1 { color: #2e7d32; margin: 0; font-size: 22px; }
        .content { background: white; padding: 24px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
        .product-name { font-size: 17px; font-weight: bold; margin: 12px 0; }
        .image-container { text-align: center; margin: 14px 0; }
        .product-image { max-width: 240px; width: 100%; border-radius: 8px; }
        .amount { font-size: 24px; color: #e53935; font-weight: bold; margin: 12px 0; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        td { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        td.label { color: #888; width: 96px; }
        .warn {
          background: #fff8e1; border-left: 4px solid #ffb300;
          padding: 12px 14px; border-radius: 4px; font-size: 14px; color: #795548; margin-top: 16px;
        }
        .steps { font-size: 14px; color: #444; margin-top: 16px; }
        .footer { text-align: center; margin-top: 26px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ 已自动下单，请尽快付款</h1>
        </div>
        <div class="content">
          <p>你好！你监控的商品刚补货，系统已经自动建好订单并锁住库存。</p>
          <div class="product-name">${productName}</div>
          ${productImage ? `<div class="image-container"><img class="product-image" src="${productImage}" alt="${productName}" /></div>` : ''}
          <div class="amount">${amountText}</div>
          <table>
            <tr><td class="label">订单号</td><td><strong>${orderSn}</strong></td></tr>
            <tr><td class="label">规格</td><td>${skuCell}</td></tr>
            ${multiSku ? `<tr><td class="label">合计</td><td>${orderItems.length} 个规格，共 ${num} 件</td></tr>` : ''}
            <tr><td class="label">支付方式</td><td>${payText}</td></tr>
            ${expireText ? `<tr><td class="label">付款截止</td><td>${expireText}</td></tr>` : ''}
            ${
              couponAdjustedPrice !== undefined
                ? `<tr><td class="label">券后最优价</td><td>¥${couponAdjustedPrice.toFixed(2)}${
                    targetPrice !== undefined
                      ? `（已达目标价 ¥${targetPrice.toFixed(2)}）`
                      : targetDiscount !== undefined
                        ? `（已达目标折扣 ${targetDiscount} 折）`
                        : ''
                  }</td></tr>`
                : ''
            }
          </table>
          ${numReduced ? `<div class="warn">库存不足，已按实际可买 <strong>${num}</strong> 件下单（你设置的是 ${requestedNum} 件）。如需更多，请补货后再发起监控。</div>` : ''}
          <div class="warn">
            订单已生成但<strong>尚未付款</strong>。一手待付款订单有效期约 <strong>20 分钟</strong>，超时未付会自动关闭并释放库存，届时需要重新抢。
          </div>
          <div class="steps">
            付款方式：打开一手 App → 我的 → 待付款 → 找到订单 <strong>${orderSn}</strong> → 立即支付。
          </div>
        </div>
        <div class="footer">
          本邮件由购物助手自动发送，请勿直接回复。
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 自动下单失败告警
 *
 * 只有「继续重试没有意义」的失败才会发这封邮件（登录态失效、建单结果未知等）。
 */
export function createAutoOrderFailedTemplate(params: {
  productName: string;
  message: string;
  stage?: string;
  uncertain?: boolean;
}): string {
  const { productName, message, stage, uncertain } = params;

  const stageText: Record<string, string> = {
    address: '获取收货地址',
    sku: '查询规格库存',
    cart: '加入购物车',
    confirm: '结算确认',
    create: '创建订单',
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.6;
          color: #333; max-width: 600px; margin: 0 auto; padding: 20px;
        }
        .container { background: #fdf3f3; border-radius: 8px; padding: 28px; }
        .header { text-align: center; margin-bottom: 22px; }
        .header h1 { color: #c62828; margin: 0; font-size: 20px; }
        .content { background: white; padding: 22px; border-radius: 6px; }
        .msg { background: #fafafa; border-left: 4px solid #c62828; padding: 12px 14px; border-radius: 4px; font-size: 14px; }
        .footer { text-align: center; margin-top: 22px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ 自动下单失败</h1>
        </div>
        <div class="content">
          <p>商品：<strong>${productName}</strong></p>
          ${stage ? `<p>失败环节：${stageText[stage] || stage}</p>` : ''}
          <div class="msg">${message}</div>
          ${uncertain ? '<p style="color:#c62828;font-size:14px;margin-top:14px;">建单请求中断，订单<strong>可能已经生成</strong>，请先到 App「我的订单」核对，避免重复下单或漏付款。</p>' : ''}
          <p style="font-size:14px;color:#666;margin-top:14px;">任务已停止。排除问题后可重新发起监控。</p>
        </div>
        <div class="footer">本邮件由购物助手自动发送，请勿直接回复。</div>
      </div>
    </body>
    </html>
  `;
}

/** HTML 文本转义：账号备注由用户填写，避免破坏邮件结构 */
const escapeHtmlText = (value: string): string =>
  value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );

/** 自动续期「即将结束」提醒的参数 */
export interface RenewEndingSoonTemplateParams {
  /** 账号显示名（备注 / 手机号 / ID） */
  accountName: string;
  /** 任务结束时间（毫秒时间戳） */
  endsAt: number;
  /** 任务总时长（小时），仅用于文案展示 */
  durationHours?: number;
  /** 累计扫描轮次 */
  checkCount?: number;
  /** 累计成功续期次数 */
  renewedCount?: number;
  /** 累计已结束订单数 */
  finishedCount?: number;
}

/**
 * 自动续期即将结束提醒
 *
 * 任务结束前 10 分钟发出，目的是让用户赶在停止续期前完成付款或重新发起任务。
 * 不列具体订单（需要再查一次接口），只给时间、账号与累计统计。
 */
export function createRenewEndingSoonTemplate(
  params: RenewEndingSoonTemplateParams
): string {
  const {
    accountName,
    endsAt,
    durationHours,
    checkCount = 0,
    renewedCount = 0,
    finishedCount = 0,
  } = params;

  const safeName = escapeHtmlText(accountName || '当前账号');
  const endTime = new Date(endsAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const endsText = `${endTime.getFullYear()}-${pad(endTime.getMonth() + 1)}-${pad(endTime.getDate())} ${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
  const durationText = durationHours ? `${durationHours} 小时` : '本轮设定的时长';
  const appLink = buildYishouDeepLink(YISHOU_ROUTES.myOrder, { check_login: 1 });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;
        }
        .container { background: #fff8e1; border-radius: 8px; padding: 28px; }
        .header { text-align: center; margin-bottom: 22px; border-bottom: 2px solid #ffe0a3; padding-bottom: 16px; }
        .header h1 { color: #e65100; margin: 0; font-size: 21px; }
        .content { background: white; padding: 22px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
        .endtime { font-size: 22px; color: #e65100; font-weight: bold; margin: 14px 0; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        td { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        td.label { color: #888; width: 110px; }
        .warn {
          background: #fff3cd; border-left: 4px solid #ffb300;
          padding: 12px 14px; border-radius: 4px; font-size: 14px; color: #795548; margin-top: 16px;
        }
        .steps { font-size: 14px; color: #444; margin-top: 16px; }
        .app-btn {
          display: inline-block; margin-top: 18px; padding: 10px 20px;
          background: #e65100; color: #ffffff !important; text-decoration: none;
          border-radius: 6px; font-size: 14px; font-weight: bold;
        }
        .footer { text-align: center; margin-top: 22px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ 订单自动续期即将结束</h1>
        </div>
        <div class="content">
          <p>你好！你为账号 <strong>${safeName}</strong> 开启的订单自动续期任务，将在约 <strong>10 分钟后</strong>结束。</p>
          <div class="endtime">结束时间：${endsText}</div>
          <table>
            <tr><td class="label">账号</td><td>${safeName}</td></tr>
            <tr><td class="label">任务时长</td><td>${durationText}</td></tr>
            <tr><td class="label">已扫描</td><td>${checkCount} 轮</td></tr>
            <tr><td class="label">已续期</td><td>${renewedCount} 次</td></tr>
            <tr><td class="label">已结束订单</td><td>${finishedCount} 笔</td></tr>
          </table>
          <div class="warn">
            任务结束后，系统将<strong>不再自动刷新待付款订单的有效期</strong>。一手待付款订单超时未付会自动关闭并释放库存，请尽快完成支付。
          </div>
          <div class="steps">
            付款方式：打开一手 App → 我的 → 待付款 → 完成支付。<br>
            如果仍需继续续期，请在购物助手里重新发起「订单续期」任务。
          </div>
          <a class="app-btn" href="${appLink}">打开一手 App 查看订单</a>
        </div>
        <div class="footer">本邮件由购物助手自动发送，请勿直接回复。</div>
      </div>
    </body>
    </html>
  `;
}
