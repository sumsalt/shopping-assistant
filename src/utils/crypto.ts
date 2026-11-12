/**
 * 加密工具函数
 */

import SparkMD5 from 'spark-md5';

/**
 * MD5 输入类型：字符串或数字
 */
export type MD5Input = string | number;

/**
 * 计算 MD5 哈希值
 * 支持传入字符串、数字，或它们的数组
 * @param inputs 输入值（字符串/数字）或输入数组
 * @returns 32位小写 MD5 哈希值
 */
export const md5 = (...inputs: MD5Input[]): string => {
  const spark = new SparkMD5();
  for (const input of inputs) {
    // SparkMD5 只接受字符串 / ArrayBuffer，数字会被静默丢弃：
    // 签名第二段是 md5(firstHash + t_t)，漏掉 t_t 就等于算了个错的签名，
    // 所以这里统一转成字符串，不依赖底层库的容错行为。
    spark.append(typeof input === 'number' ? String(input) : input);
  }
  return spark.end();
};

/**
 * 一手平台签名参数
 */
export interface YishouSignParams {
  /** 用户openid */
  openid?: string;
  /** 设备型号 */
  model: string;
  /** 版本号 */
  version: string;
  /** 版本名称 */
  version_name: string;
  /** 时间戳 */
  t_t: number;
}

/**
 * 计算一手平台请求签名
 * 签名算法: md5(md5(openid + model + version + version_name) + t_t)
 * @param params 签名参数
 * @returns 签名字符串
 */
export const generateYishouSign = (params: YishouSignParams): string => {
  const { openid, model, version, version_name, t_t } = params;
  
  // 第一次 MD5：对 openid + model + version + version_name 进行哈希
  const firstHash = md5(`${openid}${model}${version}${version_name}`);
  
  // 第二次 MD5：对第一次哈希结果 + t_t 进行哈希
  const sign = md5(firstHash, t_t);
  
  return sign;
};
