import { describe, it, expect, vi } from 'vitest'
import { createCollectionIndex } from './collection-index'

describe('createCollectionIndex', () => {
  it('首次查询触发全量加载，命中项返回 collectId', async () => {
    const loader = vi.fn(async () =>
      new Map([
        ['no-1', 'cid-1'],
        ['no-2', 'cid-2'],
      ])
    )
    const index = createCollectionIndex(loader, 10_000)

    expect(await index.find('no-1')).toBe('cid-1')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('TTL 内后续商品命中缓存，不重复加载', async () => {
    const loader = vi.fn(async () => new Map([['no-1', 'cid-1']]))
    const index = createCollectionIndex(loader, 10_000)

    await index.find('no-1')
    // 查一个不存在的商品：也应命中已加载的索引（返回空），而不触发新的翻页
    expect(await index.find('no-missing')).toBe('')
    expect(await index.find('no-1')).toBe('cid-1')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('singleflight：并发查询合并为一次加载', async () => {
    let resolveLoader!: (m: Map<string, string>) => void
    const loader = vi.fn(
      () =>
        new Promise<Map<string, string>>(resolve => {
          resolveLoader = resolve
        })
    )
    const index = createCollectionIndex(loader, 10_000)

    // 同时发起 5 个不同商品的查询
    const promises = ['a', 'b', 'c', 'd', 'e'].map(no => index.find(no))
    expect(loader).toHaveBeenCalledTimes(1)

    resolveLoader(new Map([['a', 'cid-a']]))
    const results = await Promise.all(promises)

    expect(results[0]).toBe('cid-a')
    expect(results.slice(1).every(r => r === '')).toBe(true)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('TTL 过期后重新加载', async () => {
    const loader = vi.fn(async () => new Map([['no-1', 'cid-1']]))
    const index = createCollectionIndex(loader, 0) // ttl=0，立即过期

    await index.find('no-1')
    await index.find('no-1')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('加载失败不缓存，下次重试', async () => {
    let attempt = 0
    const loader = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('502')
      return new Map([['no-1', 'cid-1']])
    })
    const index = createCollectionIndex(loader, 10_000)

    await expect(index.find('no-1')).rejects.toThrow('502')
    expect(await index.find('no-1')).toBe('cid-1')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('set/remove 增量维护索引，clear 后重新加载', async () => {
    const loader = vi.fn(async () => new Map([['no-1', 'cid-1']]))
    const index = createCollectionIndex(loader, 10_000)

    await index.find('no-1')
    index.set('no-2', 'cid-2')
    expect(await index.find('no-2')).toBe('cid-2')

    index.remove('no-1')
    expect(await index.find('no-1')).toBe('')

    index.set('no-3', 'cid-3')
    index.clear()
    expect(await index.find('no-3')).toBe('')
    expect(loader).toHaveBeenCalledTimes(2) // clear 后重新加载
  })
})
