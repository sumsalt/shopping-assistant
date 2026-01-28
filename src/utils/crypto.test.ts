/**
 * 加密工具函数 - 单元测试
 */

import { describe, it, expect } from 'vitest';
import { md5, generateYishouSign } from './crypto';

describe('md5 - MD5 哈希函数', () => {
  it('应正确计算空字符串的 MD5', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('应正确计算普通字符串的 MD5', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('应正确计算包含数字的字符串的 MD5', () => {
    expect(md5('123456')).toBe('e10adc3949ba59abbe56e057f20f883e');
  });

  it('应返回32位小写哈希值', () => {
    const hash = md5('test');
    expect(hash).toHaveLength(32);
    expect(hash).toBe(hash.toLowerCase());
  });
});

describe('generateYishouSign - 一手平台签名计算', () => {
  it('应正确计算签名', () => {
    const params = {
      openid: 'test_openid',
      model: 'iPhone 14',
      version: '1.0.0',
      version_name: 'release',
      t_t: 1706400000000,
    };

    // 手动验证签名计算过程：
    // 1. md5('test_openidiPhone 141.0.0release') = '某个哈希值'
    // 2. md5(某个哈希值, t_t) = 最终签名（t_t 以数字形式 append）
    const firstHash = md5(`${params.openid}${params.model}${params.version}${params.version_name}`);
    const expectedSign = md5(firstHash, params.t_t);

    const sign = generateYishouSign(params);
    expect(sign).toBe(expectedSign);
  });

  it('相同参数应生成相同签名', () => {
    const params = {
      openid: 'user123',
      model: 'Android',
      version: '2.0.0',
      version_name: 'stable',
      t_t: 1706500000000,
    };

    const sign1 = generateYishouSign(params);
    const sign2 = generateYishouSign(params);

    expect(sign1).toBe(sign2);
  });

  it('不同时间戳应生成不同签名', () => {
    const baseParams = {
      openid: 'user123',
      model: 'Android',
      version: '2.0.0',
      version_name: 'stable',
    };

    const sign1 = generateYishouSign({ ...baseParams, t_t: 1706500000000 });
    const sign2 = generateYishouSign({ ...baseParams, t_t: 1706500000001 });

    expect(sign1).not.toBe(sign2);
  });

  it('不同 openid 应生成不同签名', () => {
    const baseParams = {
      model: 'iPhone',
      version: '1.0.0',
      version_name: 'release',
      t_t: 1706500000000,
    };

    const sign1 = generateYishouSign({ ...baseParams, openid: 'user1' });
    const sign2 = generateYishouSign({ ...baseParams, openid: 'user2' });

    expect(sign1).not.toBe(sign2);
  });

  it('签名应为32位小写字符串', () => {
    const sign = generateYishouSign({
      openid: 'test',
      model: 'test',
      version: '1.0',
      version_name: 'test',
      t_t: 12345,
    });

    expect(sign).toHaveLength(32);
    expect(sign).toBe(sign.toLowerCase());
    expect(/^[a-f0-9]+$/.test(sign)).toBe(true);
  });
});
