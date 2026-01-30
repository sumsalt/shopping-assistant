/**
 * HTTP 请求工具
 */

import { StockCheckError, StockCheckErrorType } from '../types';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { type RequestInit } from 'node-fetch';

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
  /** 请求方法 */
  method?: 'GET' | 'POST';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（用于 POST 请求） */
  body?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 代理 URL（可选） */
  proxyUrl?: string;
}

/**
 * 将对象编码为 x-www-form-urlencoded 格式
 */
const encodeFormData = (data: Record<string, string>): string => {
  return Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
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
  } = options;

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...headers,
      },
      signal: controller.signal,
    };

    // 如果配置了代理，添加代理 agent
    if (proxyUrl) {
      fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
    }

    // 处理 POST 请求体
    if (method === 'POST' && body) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      fetchOptions.body = encodeFormData(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new StockCheckError(
        StockCheckErrorType.API_ERROR,
        `HTTP 请求失败: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    // 处理超时错误
    if (error instanceof Error && error.name === 'AbortError') {
      throw new StockCheckError(
        StockCheckErrorType.NETWORK_ERROR,
        `请求超时（${timeout}ms）`,
        error
      );
    }

    // 如果已经是 StockCheckError，直接抛出
    if (error instanceof StockCheckError) {
      throw error;
    }

    // 其他网络错误
    throw new StockCheckError(
      StockCheckErrorType.NETWORK_ERROR,
      `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      error
    );
  } finally {
    clearTimeout(timeoutId);
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
