/**
 * HTTP 请求工具
 */

import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { StockCheckError, StockCheckErrorType } from '../types';
import { acquireRequestSlot, GateTimeoutError, getGateContext } from './request-gate';

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
  /** 请求方法 */
  method?: 'GET' | 'POST';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（用于 POST 请求） */
  body?: Record<string, string> | string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 代理 URL（可选） */
  proxyUrl?: string;
  /**
   * 跳过全局请求闸门
   *
   * 下单链路（加购 / 结算 / 建单）是「抢库存」操作，排队 15 秒即失去意义，
   * 因此这些请求显式跳过限流；它们只在检测到有货时触发，不会持续空转。
   */
  skipGate?: boolean;
}

/**
 * 创建 Axios 代理配置
 */
const createProxyConfig = (proxyUrl: string) => {
  const url = new URL(proxyUrl);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80')),
    auth: url.username ? {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password || ''),
    } : undefined,
  };
};

/**
 * 发送 HTTP 请求
 * @param url 请求 URL
 * @param options 请求选项
 * @returns 响应数据
 */
export const httpRequest = async <T>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> => {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 10000,
    proxyUrl,
    skipGate = false,
  } = options;

  const axiosConfig: AxiosRequestConfig = {
    url,
    method,
    timeout,
    headers,
    proxy: proxyUrl ? createProxyConfig(proxyUrl) : false,
  };

  // 处理请求体
  if (method === 'POST' && body) {
    if (typeof body === 'string') {
      axiosConfig.data = body;
    } else {
      axiosConfig.data = new URLSearchParams(body).toString();
      axiosConfig.headers = {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
    }
  }

  // 全局请求闸门：只有带任务上下文的请求才排队限流；
  // 用户手动触发的请求（无上下文）直接放行，不受任何限制。
  const gateContext = getGateContext();
  if (gateContext && !skipGate) {
    try {
      await acquireRequestSlot(gateContext);
    } catch (error) {
      if (error instanceof GateTimeoutError) {
        throw new StockCheckError(
          StockCheckErrorType.REQUEST_GATE_TIMEOUT,
          error.message,
          error
        );
      }
      throw error;
    }
  }

  try {
    const response: AxiosResponse<T> = await axios(axiosConfig);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.message;
      const code = error.code;

      // 代理相关错误
      if (proxyUrl && (
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === 'ECONNRESET' ||
        errorMessage.includes('ENOTFOUND')
      )) {
        throw new StockCheckError(
          StockCheckErrorType.NETWORK_ERROR,
          `代理连接失败: ${errorMessage}。请检查代理地址是否正确或代理服务器是否正常运行`,
          error
        );
      }

      // 网络错误
      if (code === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
        throw new StockCheckError(
          StockCheckErrorType.NETWORK_ERROR,
          `请求超时（${timeout}ms）`,
          error
        );
      }

      // HTTP 错误响应
      if (error.response) {
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          `HTTP 请求失败: ${error.response.status} ${error.response.statusText}`,
          error
        );
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.NETWORK_ERROR,
        `网络请求失败: ${errorMessage}`,
        error
      );
    }

    // 非 Axios 错误
    throw new StockCheckError(
      StockCheckErrorType.NETWORK_ERROR,
      `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      error
    );
  }
};

/**
 * 发送 POST 请求（便捷方法）
 * @param url 请求 URL
 * @param body 请求体
 * @param headers 请求头
 * @param options 请求选项（包含代理等）
 * @returns 响应数据
 */
export const httpPost = async <T>(
  url: string,
  body: Record<string, string>,
  headers?: Record<string, string>,
  options?: Partial<Omit<HttpRequestOptions, 'method' | 'body' | 'headers'>>
): Promise<T> => {
  return httpRequest<T>(url, {
    method: 'POST',
    body,
    headers,
    ...options,
  });
};
